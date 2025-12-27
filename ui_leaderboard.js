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

async function leaderboardRefresh() {
    const sb = window.supabaseClient;
    if (!sb) {
        setLeaderboardMsg('Supabase 미설정: URL/anon key를 넣어주세요.', true);
        renderLeaderboardRows([]);
        return;
    }

    setLeaderboardMsg('');
    // leaderboard_view: rank, user_id, score, floor, updated_at, display_name
    const { data, error } = await sb
        .from('leaderboard_view')
        .select('rank,user_id,score,floor,display_name,updated_at')
        .order('rank', { ascending: true })
        .limit(10);

    if (error) {
        setLeaderboardMsg(error.message, true);
        renderLeaderboardRows([]);
        return;
    }

    const rows = (data || []).map((r) => ({
        rank: r.rank,
        user_id: r.user_id,
        score: r.score,
        floor: r.floor,
        display_name: r.display_name || '익명',
    }));
    renderLeaderboardRows(rows);

    // 내 순위가 TOP10 밖이면 아래에 별도 표기
    const myId = window.currentUser?.id || null;
    if (!myId) return;
    const inTop10 = rows.some(r => r.user_id === myId);
    if (inTop10) return;

    const { data: myRow, error: myErr } = await sb
        .from('leaderboard_view')
        .select('rank,user_id,score,floor,display_name,updated_at')
        .eq('user_id', myId)
        .maybeSingle();

    if (myErr) return;
    if (!myRow) return;

    // NOTE: renderLeaderboardRows는 root를 통째로 다시 그리므로,
    // 구분선(...)을 포함한 배열로 렌더링
    renderLeaderboardRows([
        ...rows,
        { rank: '…', user_id: '__sep__', score: '', floor: '', display_name: '' },
        { ...myRow },
    ]);
}

async function leaderboardSubmitScore({ score, floor }) {
    const sb = window.supabaseClient;
    if (!sb) return;
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    if (!user) return; // 로그인 안 했으면 업로드 안 함

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

leaderboardRefresh();


