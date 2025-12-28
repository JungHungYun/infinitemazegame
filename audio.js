// 오디오 관련 로직 - game.js에서 분리
// (벽 마찰 SFX / 일반 SFX(WebAudio) / BGM)
// 주의: 실제로 사용되는 시점엔 game.js의 state가 존재해야 합니다.

// --- 오디오: 벽 마찰(부딪침) 사운드 ---
function ensureWallRubAudioElement() {
    const wr = state.audio.wallRub;
    if (wr.el) return wr.el;
    const el = new Audio(wr.src);
    // 끝 2초를 스킵해야 하므로 loop는 수동 처리
    el.loop = false;
    el.preload = 'auto';
    el.muted = false;
    el.volume = 0;
    // playbackRate로 피치를 올릴 수 있게(브라우저별 preservesPitch 옵션 OFF)
    try { el.preservesPitch = false; } catch { /* ignore */ }
    try { el.mozPreservesPitch = false; } catch { /* ignore */ }
    try { el.webkitPreservesPitch = false; } catch { /* ignore */ }

    // 디버깅에 도움되는 에러 로그(문제 발생 시 콘솔에서 원인 확인 가능)
    el.addEventListener('error', () => {
        try { console.warn('[wallRub] audio error', el.error, wr.src); } catch { /* ignore */ }
    });
    wr.el = el;
    return el;
}

function ensureSfxContext() {
    const sfx = state.audio.sfx;
    if (sfx.ctx) {
        // 모바일: suspended 상태를 자주 체크하고 resume
        if (sfx.ctx.state === 'suspended') {
            const rp = sfx.ctx.resume();
            if (rp && typeof rp.catch === 'function') rp.catch(() => {});
        }
        return sfx.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    // 모바일 최적화: 샘플레이트를 명시적으로 설정 (일부 모바일 브라우저에서 문제 방지)
    try {
        sfx.ctx = new Ctx({ sampleRate: 44100 });
    } catch {
        // 샘플레이트 설정 실패 시 기본 생성자 사용
        sfx.ctx = new Ctx();
    }
    // 모바일: 초기 상태가 suspended일 수 있으므로 resume 시도
    if (sfx.ctx.state === 'suspended') {
        const rp = sfx.ctx.resume();
        if (rp && typeof rp.catch === 'function') rp.catch(() => {});
    }
    return sfx.ctx;
}

// --- BGM ---
function ensureBgmElement() {
    const bgm = state.audio.bgm;
    if (bgm.el) return bgm.el;
    const el = new Audio();
    el.preload = 'auto';
    el.loop = false;
    el.volume = Math.max(0, Math.min(1, bgm.volume ?? 0.35));
    el.addEventListener('ended', () => {
        playNextBgmTrack();
    });
    el.addEventListener('error', () => {
        try { console.warn('[bgm] audio error', el.error); } catch { /* ignore */ }
    });
    bgm.el = el;
    return el;
}

function pickNextBgmIndex() {
    const bgm = state.audio.bgm;
    const n = bgm.tracks?.length || 0;
    if (!n) return 0;
    if (bgm.shuffle) {
        // 같은 곡 연속 방지
        let next = Math.floor(Math.random() * n);
        if (n > 1 && next === bgm.idx) next = (next + 1) % n;
        return next;
    }
    return (bgm.idx + 1) % n;
}

function startBgmIfNeeded() {
    const bgm = state.audio.bgm;
    if (bgm.started) return;
    if (!state.audio.gestureUnlocked) return; // 유저 제스처 이후
    if (!bgm.tracks?.length) return;

    bgm.started = true;
    // 첫 곡 시작
    playBgmAtIndex(bgm.idx || 0);
}

function playBgmAtIndex(i) {
    const bgm = state.audio.bgm;
    const el = ensureBgmElement();
    const n = bgm.tracks?.length || 0;
    if (!n) return;
    bgm.idx = Math.max(0, Math.min(n - 1, i));

    // 특정 파일 재생 중일 수 있으므로 루프 속성 체크
    el.loop = false;
    el.src = bgm.tracks[bgm.idx];
    el.volume = Math.max(0, Math.min(1, bgm.volume ?? 0.35));
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
}

function playBgmFile(src, loop = false) {
    const bgm = state.audio.bgm;
    const el = ensureBgmElement();
    el.src = src;
    el.loop = loop;
    el.volume = Math.max(0, Math.min(1, bgm.volume ?? 0.35));
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
}

function playNextBgmTrack() {
    const bgm = state.audio.bgm;
    if (!bgm.tracks?.length) return;

    // 상점 모달이 열려있는 동안은 일반 BGM 자동 재생 방지 (레벨업 효과음 재생 후 정적 유지)
    if (state.ui.modalOpen) return;

    // bgm 폴더 내 무작위 재생 강화
    let next;
    if (bgm.tracks.length > 1) {
        do {
            next = Math.floor(Math.random() * bgm.tracks.length);
        } while (next === bgm.idx);
    } else {
        next = 0;
    }

    playBgmAtIndex(next);
}

function setBgmVolume(v01) {
    const bgm = state.audio.bgm;
    bgm.volume = Math.max(0, Math.min(1, v01));
    if (bgm.el) bgm.el.volume = bgm.volume;
}

async function loadSfxBuffer(src) {
    const sfx = state.audio.sfx;
    if (sfx.bufferCache.has(src)) return sfx.bufferCache.get(src);
    const ctx = ensureSfxContext();
    if (!ctx) return null;

    // file:// 프로토콜 또는 origin이 null인 경우 fetch가 제한되므로 Audio fallback 유도
    const isLocal = location.protocol === 'file:' || location.origin === 'null' || !location.origin || location.protocol === 'about:';
    if (isLocal) return null;

    try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        sfx.bufferCache.set(src, buf);
        return buf;
    } catch (e) {
        // 이미 fallback이 준비되어 있으므로 경고는 최소화
        return null;
    }
}

// Audio 엘리먼트 풀에서 재사용 가능한 엘리먼트 가져오기
function getPooledAudioElement() {
    const sfx = state.audio.sfx;
    const pool = sfx.audioPool || [];
    
    // 재생이 끝난 엘리먼트 찾기
    for (let i = 0; i < pool.length; i++) {
        const a = pool[i];
        if (a && (a.paused || a.ended)) {
            // 재사용 전 초기화
            try {
                a.pause();
                a.currentTime = 0;
            } catch {}
            return a;
        }
    }
    
    // 풀이 가득 차지 않았으면 새로 생성
    if (pool.length < (sfx.maxPoolSize || 8)) {
        const a = new Audio();
        a.preload = 'auto';
        pool.push(a);
        return a;
    }
    
    // 풀이 가득 찼으면 가장 오래된 엘리먼트 재사용 (강제)
    if (pool.length > 0) {
        const a = pool[0];
        try {
            a.pause();
            a.currentTime = 0;
        } catch {}
        // 순환: 사용한 엘리먼트를 맨 뒤로 이동
        pool.push(pool.shift());
        return a;
    }
    
    // 풀이 비어있으면 새로 생성
    const a = new Audio();
    a.preload = 'auto';
    pool.push(a);
    return a;
}

function playSfx(src, opts = {}) {
    // SFX는 wallRub 언락과 별개로 "유저 제스처"만 있으면 재생 가능
    if (!state.audio.gestureUnlocked) return;
    const {
        volume = 1.0,
        rate = 1.0,
    } = opts;

    const ctx = ensureSfxContext();

    const playViaPlainAudioElement = () => {
        // 폴백: WebAudio가 없거나(fetch/decode 실패 포함) 환경에서도 즉시 재생
        // 모바일 최적화: Audio 엘리먼트 풀 사용
        try {
            const a = getPooledAudioElement();
            a.src = src;
            a.volume = Math.max(0, Math.min(1, volume * (state.audio.sfx.master ?? 1)));
            a.playbackRate = Math.max(0.5, Math.min(2.0, rate));
            // 모바일: play() 실패 시 재시도
            const playPromise = a.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((err) => {
                    // 재생 실패 시 한 번 더 시도
                    setTimeout(() => {
                        try {
                            a.currentTime = 0;
                            a.play().catch(() => {});
                        } catch {}
                    }, 50);
                });
            }
        } catch { /* ignore */ }
    };

    if (!ctx) return playViaPlainAudioElement();

    // 중요: 캐시 미스일 때 "로딩 완료 후 재생"을 하면 몇 초 뒤에 늦게 울리는 버그가 생김.
    // 따라서 캐시에 없으면 즉시 Audio 엘리먼트로 재생하고, WebAudio 버퍼는 예열만 한다.
    const cached = state.audio.sfx.bufferCache.get(src);
    if (!cached) {
        playViaPlainAudioElement();
        // 예열(완료 시 자동 재생 금지)
        loadSfxBuffer(src).catch(() => {});
        return;
    }

    // 캐시 히트면 WebAudio로 즉시 재생(지연 없음)
    try {
        // 모바일: suspended 상태를 더 적극적으로 체크하고 resume
        if (ctx.state === 'suspended') {
            const rp = ctx.resume();
            if (rp && typeof rp.catch === 'function') {
                rp.catch(() => {
                    // resume 실패 시 폴백으로 재생
                    playViaPlainAudioElement();
                });
                // resume이 완료될 때까지 기다리지 않고 바로 재생 시도 (비동기)
            }
        }
        
        // resume 중이거나 suspended 상태일 수 있으므로, 재생 실패 시 폴백
        try {
            const srcNode = ctx.createBufferSource();
            srcNode.buffer = cached;
            srcNode.playbackRate.value = Math.max(0.5, Math.min(2.0, rate));

            const gain = ctx.createGain();
            const v = Math.max(0, Math.min(1, volume * (state.audio.sfx.master ?? 1)));
            gain.gain.value = v;

            srcNode.connect(gain);
            gain.connect(ctx.destination);
            srcNode.start();
        } catch (webAudioErr) {
            // WebAudio 재생 실패 시 즉시 폴백
            playViaPlainAudioElement();
        }
    } catch {
        // WebAudio 재생이 실패하면 즉시 폴백
        playViaPlainAudioElement();
    }
}

function unlockAudioOnce() {
    // 유저 제스처가 들어온 순간부터 SFX는 재생 가능
    state.audio.gestureUnlocked = true;
    if (state.audio.unlocked) return;
    try {
        const el = ensureWallRubAudioElement();
        const ctx = ensureSfxContext();
        
        // 모바일: AudioContext가 suspended 상태면 즉시 resume 시도
        if (ctx && ctx.state === 'suspended') {
            const rp = ctx.resume();
            if (rp && typeof rp.catch === 'function') rp.catch(() => {});
        }
        
        // SFX는 첫 재생 지연을 없애기 위해 예열(완료 시 자동 재생 없음)
        // 모바일 최적화: 모든 사운드를 미리 로드
        const sfxFiles = [
            'resource/missile-launch.mp3',
            'resource/missile-explosion-168600.mp3',
            'resource/small-rock-break-194553.mp3',
            'resource/rock-break-hard-184891.mp3',
            'resource/pick-coin-384921.mp3',
            'resource/pick_missile-83043.mp3'
        ];
        sfxFiles.forEach(src => {
            loadSfxBuffer(src).catch(() => {});
        });
        
        // 상점 BGM 예열
        new Audio('resource/cute-level-up-2-189851.mp3').preload = 'auto';
        
        // BGM도 유저 제스처 이후 시작
        startBgmIfNeeded();
        
        // 유저 제스처에서 "실제 play 성공"해야만 unlocked로 인정 (실패 시 다음 입력에서 재시도)
        el.volume = 0;
        const p = el.play();
        if (p && typeof p.then === 'function') {
            p.then(() => {
                state.audio.unlocked = true;
                state.audio.wallRub.playing = true;
                // 모바일: AudioContext가 다시 suspended 될 수 있으므로 주기적으로 체크
                if (ctx && ctx.state === 'suspended') {
                    ctx.resume().catch(() => {});
                }
                // 여기서는 바로 끄지 않고 0볼륨으로 유지(정책 회피 + 즉시 페이드인 가능)
            }).catch((err) => {
                try { console.warn('[audio] unlock failed', err); } catch { /* ignore */ }
                state.audio.unlocked = false;
            });
        } else {
            // Promise가 없는 환경이면 일단 unlocked 처리
            state.audio.unlocked = true;
            state.audio.wallRub.playing = true;
        }
    } catch (err) {
        try { console.warn('[audio] unlock exception', err); } catch { /* ignore */ }
        state.audio.unlocked = false;
    }
}

function startWallRubFade(mode, toVol, durMs) {
    const wr = state.audio.wallRub;
    const el = ensureWallRubAudioElement();
    const from = Math.max(0, Math.min(1, el.volume || 0));
    wr.fadeMode = mode;
    wr.fadeStartMs = state.nowMs;
    wr.fadeDurMs = durMs;
    wr.fadeFrom = from;
    wr.fadeTo = Math.max(0, Math.min(1, toVol));
}

function tickWallRubAudio(nowMs) {
    const wr = state.audio.wallRub;
    const el = wr.el;
    if (!el) return;

    // 피치(=playbackRate) 스무딩 적용
    const s = Math.max(0, Math.min(1, wr.rateSmoothing ?? 0.18));
    wr.rateCurrent = (wr.rateCurrent ?? 1) + ((wr.rateTarget ?? 1) - (wr.rateCurrent ?? 1)) * s;
    const pr = Math.max(0.5, Math.min(2.0, wr.rateCurrent));
    if (el.playbackRate !== pr) {
        try { el.playbackRate = pr; } catch { /* ignore */ }
    }

    // 루프 구간 제어: 마지막 2초(tailSkipSec)는 사용하지 않음
    const dur = el.duration;
    const pad = Math.max(0, wr.tailSkipSec || 0);
    if (wr.playing && Number.isFinite(dur) && dur > pad + 0.1) {
        const loopEnd = dur - pad;
        // 끝부분에 닿으면 0으로 되감아 반복
        if (el.currentTime >= loopEnd) {
            try { el.currentTime = 0; } catch { /* ignore */ }
        }
    }

    // 페이드 진행
    if (wr.fadeMode !== 'none') {
        const tRaw = (nowMs - wr.fadeStartMs) / (wr.fadeDurMs || 1);
        // easeInOutCubic는 game.js에 정의(호출 시점에는 항상 존재)
        const t = easeInOutCubic(tRaw);
        el.volume = wr.fadeFrom + (wr.fadeTo - wr.fadeFrom) * t;
        if (tRaw >= 1) {
            el.volume = wr.fadeTo;
            const endedMode = wr.fadeMode;
            wr.fadeMode = 'none';
            if (endedMode === 'out' && el.volume <= 0.0001) {
                try { el.pause(); } catch { /* ignore */ }
                wr.playing = false;
                try { el.currentTime = 0; } catch { /* ignore */ }
            }
        }
    }
}

function setWallRubContact(isContact, intensity = 1) {
    const wr = state.audio.wallRub;
    if (!state.audio.unlocked) return;
    const el = ensureWallRubAudioElement();

    if (isContact) {
        // 강도에 따라 볼륨 스케일
        const k = Math.max(0, Math.min(1, intensity));
        const target = wr.baseVolume * (0.20 + 0.80 * k);
        // 강도에 따라 피치(살짝 상승)
        wr.rateTarget = (wr.rateBase ?? 1.0) + (wr.rateMaxUp ?? 0.12) * k;

        // 필요하면 재생 시작(처음 접촉 시에만 currentTime 리셋)
        if (!wr.playing) {
            try { el.currentTime = 0; } catch { /* ignore */ }
            el.volume = 0;
            // 시작 시 피치도 초기화
            wr.rateCurrent = wr.rateTarget;
            try { el.playbackRate = wr.rateCurrent; } catch { /* ignore */ }
            const p = el.play();
            wr.playing = true;
            if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
        } else {
            // 혹시 pause된 상태면 다시 play 시도(정책/탭 상태 등)
            if (el.paused) {
                const p = el.play();
                if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
            }
        }

        // 페이드아웃 중 재접촉: 디졸브 취소
        if (wr.fadeMode === 'out') wr.fadeMode = 'none';

        // 매 프레임 페이드를 "재시작"하면 볼륨이 0 근처에서 계속 리셋될 수 있으므로,
        // 볼륨/상태가 바뀌는 순간에만 페이드인 트리거.
        const eps = 0.02;
        if (wr.fadeMode !== 'in') {
            if (el.volume < target - eps) startWallRubFade('in', target, 90);
            else el.volume = target;
        } else {
            // 이미 페이드인 중이면 목표만 상향(더 세게 문댈 때)
            if (wr.fadeTo < target) wr.fadeTo = target;
        }
    } else {
        // 접촉 해제 시 피치를 기본으로 복귀(페이드아웃 중에도 천천히 내려감)
        wr.rateTarget = (wr.rateBase ?? 1.0);
        // 떨어졌으면 0.5초 디졸브(페이드아웃) 후 정지
        if (wr.playing && wr.fadeMode !== 'out') {
            startWallRubFade('out', 0, wr.fadeDurMs || 100);
        }
    }
}


