// 리더보드 UI (Supabase)

function renderLeaderboardRows(rows) {
    const root = document.getElementById('leaderboard');
    if (!root) return;
    root.innerHTML = '';

    if (!rows?.length) {
        const empty = document.createElement('div');
        empty.className = 'lb-row muted';
        empty.textContent = '기록이 없습니다.';
        root.appendChild(empty);
        return;
    }

    const myId = window.currentUser?.id || null;
    rows.forEach((r, idx) => {
        // 구분선 row
        if (r.user_id === '__sep__') {
            const sep = document.createElement('div');
            sep.className = 'lb-row muted';
            sep.textContent = '...';
            root.appendChild(sep);
            return;
        }
        const row = document.createElement('div');
        row.className = 'lb-row';
        if (myId && r.user_id === myId) row.classList.add('me');

        const rank = document.createElement('div');
        rank.className = 'lb-rank';
        rank.textContent = String(r.rank ?? (idx + 1));

        const name = document.createElement('div');
        name.className = 'lb-name';
        name.textContent = r.display_name || '(no name)';

        const score = document.createElement('div');
        score.className = 'lb-score';
        score.textContent = String(r.score ?? 0);

        const floor = document.createElement('div');
        floor.className = 'lb-floor';
        floor.textContent = `${r.floor ?? 1}F`;

        row.appendChild(rank);
        row.appendChild(name);
        row.appendChild(score);
        row.appendChild(floor);
        root.appendChild(row);
    });
}

function setLeaderboardMsg(msg, isError = false) {
    const el = document.getElementById('leaderboard-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#ff9aa2' : '#9a9a9a';
}

function withTimeout(promise, ms, label = '요청') {
    let t = null;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} 타임아웃(${ms}ms). 네트워크/차단(광고차단/기업망)/Supabase 장애를 확인하세요.`)), ms);
    });
    // supabase 쿼리 객체는 thenable이지만 Promise가 아니라 finally()가 없을 수 있음
    const p = Promise.resolve(promise);
    return Promise.race([
        p.finally(() => { if (t) clearTimeout(t); }),
        timeout,
    ]);
}

function isSchemaCacheMissingError(err) {
    const m = String(err?.message || '');
    return m.includes("schema cache") || m.includes("Could not find the table") || m.includes("leaderboard_view");
}

async function fetchProfilesMapByIds(sb, ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniq.length) return new Map();
    const { data, error } = await sb.from('profiles').select('id,username').in('id', uniq);
    if (error) return new Map();
    const mp = new Map();
    for (const r of (data || [])) mp.set(r.id, r.username);
    return mp;
}

function sortAndRank(rows) {
    const copy = [...(rows || [])];
    copy.sort((a, b) => {
        const as = Number(a.score || 0), bs = Number(b.score || 0);
        if (bs !== as) return bs - as;
        const af = Number(a.floor || 1), bf = Number(b.floor || 1);
        if (bf !== af) return bf - af;
        const at = new Date(a.updated_at || 0).getTime();
        const bt = new Date(b.updated_at || 0).getTime();
        return at - bt;
    });
    // rank() 스타일: 동점이면 같은 rank
    let prevKey = null;
    let currentRank = 0;
    copy.forEach((r, i) => {
        const key = `${r.score}|${r.floor}`;
        if (key !== prevKey) {
            currentRank = i + 1;
            prevKey = key;
        }
        r.rank = currentRank;
    });
    return copy;
}

async function leaderboardRefresh() {
    const sb = window.supabaseClient;
    if (!sb) {
        setLeaderboardMsg('Supabase 미설정: URL/anon key를 넣어주세요.', true);
        renderLeaderboardRows([]);
        return;
    }

    // 로딩 표시(기존 "불러오는 중..."이 남아있는 경우도 강제로 갱신)
    try {
        const root = document.getElementById('leaderboard');
        if (root) {
            root.innerHTML = '<div class="lb-row muted">리더보드 로딩중... (v20251227_6)</div>';
        }
    } catch (_) {}

    setLeaderboardMsg('리더보드 조회 중...');

    // 1) 우선 view 기반 (가장 빠름)
    let data, error;
    try {
        ({ data, error } = await withTimeout(
            sb
                .from('leaderboard_view')
                .select('rank,user_id,score,floor,display_name,updated_at')
                .order('rank', { ascending: true })
                .limit(10),
            20000,
            'leaderboard_view 조회'
        ));
    } catch (err) {
        const raw = String(err?.message || err);
        // 시크릿에서만 되는 경우: 확장프로그램(광고차단/보안) 차단 가능성이 큼
        const hint = ' (시크릿에서만 되면 확장프로그램/광고차단이 Supabase를 차단 중일 가능성이 큽니다)';
        const msg = (raw.includes('타임아웃') || raw.includes('Failed to fetch')) ? (raw + hint) : raw;
        setLeaderboardMsg(msg, true);
        renderLeaderboardRows([]);
        return;
    }

    if (!error) {
        setLeaderboardMsg('');
        const rows = (data || []).map((r) => ({
            rank: r.rank,
            user_id: r.user_id,
            score: r.score,
            floor: r.floor,
            display_name: r.display_name || '익명',
            updated_at: r.updated_at,
        }));
        renderLeaderboardRows(rows);

        // 내 순위가 TOP10 밖이면 아래에 별도 표기
        const myId = window.currentUser?.id || null;
        if (!myId) return;
        const inTop10 = rows.some(r => r.user_id === myId);
        if (inTop10) return;

        const { data: myRow, error: myErr } = await withTimeout(
            sb
                .from('leaderboard_view')
                .select('rank,user_id,score,floor,display_name,updated_at')
                .eq('user_id', myId)
                .maybeSingle(),
            20000,
            '내 순위 조회'
        );

        if (!myErr && myRow) {
            renderLeaderboardRows([
                ...rows,
                { rank: '…', user_id: '__sep__', score: '', floor: '', display_name: '' },
                { ...myRow },
            ]);
        }
        return;
    }

    // 2) view가 없거나 schema cache 문제면 테이블 폴백으로라도 표시
    if (!isSchemaCacheMissingError(error)) {
        setLeaderboardMsg(error.message, true);
        renderLeaderboardRows([]);
        return;
    }

    // 폴백: leaderboard_best를 직접 읽고 클라에서 랭킹 계산
    setLeaderboardMsg('리더보드 뷰가 아직 준비되지 않아 폴백 모드로 표시 중입니다.', true);
    const { data: best, error: bestErr } = await withTimeout(
        sb
            .from('leaderboard_best')
            .select('user_id,score,floor,updated_at')
            .limit(500),
        20000,
        'leaderboard_best 조회'
    );
    if (bestErr) {
        setLeaderboardMsg(bestErr.message, true);
        renderLeaderboardRows([]);
        return;
    }

    const ranked = sortAndRank(best || []);
    const top10 = ranked.slice(0, 10);
    const profiles = await fetchProfilesMapByIds(sb, top10.map(r => r.user_id));
    const rows = top10.map((r) => ({
        rank: r.rank,
        user_id: r.user_id,
        score: r.score,
        floor: r.floor,
        display_name: profiles.get(r.user_id) || `익명#${String(r.user_id).slice(0, 4)}`,
        updated_at: r.updated_at,
    }));
    renderLeaderboardRows(rows);

    const myId = window.currentUser?.id || null;
    if (!myId) return;
    const inTop10 = rows.some(r => r.user_id === myId);
    if (inTop10) return;
    const mine = ranked.find(r => r.user_id === myId);
    if (!mine) return;
    const myName = (await fetchProfilesMapByIds(sb, [myId])).get(myId) || `익명#${String(myId).slice(0, 4)}`;
    renderLeaderboardRows([
        ...rows,
        { rank: '…', user_id: '__sep__', score: '', floor: '', display_name: '' },
        { rank: mine.rank, user_id: myId, score: mine.score, floor: mine.floor, display_name: myName, updated_at: mine.updated_at },
    ]);
}

async function leaderboardSubmitScore({ score, floor }) {
    const sb = window.supabaseClient;
    if (!sb) return;
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    if (!user) {
        setLeaderboardMsg('로그인해야 리더보드에 기록됩니다.', true);
        return;
    }

    const s = Math.max(0, Math.floor(score ?? 0));
    const f = Math.max(1, Math.floor(floor ?? 1));

    // 1인 1기록(최고점) 유지: RPC로 조건부 업서트
    const { error } = await sb.rpc('submit_score', { p_score: s, p_floor: f });
    if (error) {
        setLeaderboardMsg(error.message, true);
        return;
    }

    // 업로드 후 새로고침
    await leaderboardRefresh();
}

// ui_gameover.js에서 호출할 수 있게 전역으로 노출
window.leaderboardRefresh = leaderboardRefresh;
window.leaderboardSubmitScore = leaderboardSubmitScore;

// 초기 로드는 예외가 발생하더라도 화면에 원인을 표시하도록 보호
(async () => {
    try {
        await leaderboardRefresh();
    } catch (err) {
        setLeaderboardMsg(`리더보드 초기화 실패: ${String(err?.message || err)}`, true);
        renderLeaderboardRows([]);
    }
})();


