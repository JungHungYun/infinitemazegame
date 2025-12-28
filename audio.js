// 오디오 관련 로직 - game.js에서 분리
// (벽 마찰 SFX / 일반 SFX(WebAudio) / BGM)
// 주의: 실제로 사용되는 시점엔 game.js의 state가 존재해야 합니다.

// --- 오디오: 벽 마찰(부딪침) 사운드 (WebAudio API 사용) ---
async function loadWallRubBuffer() {
    const wr = state.audio.wallRub;
    if (wr.buffer) return wr.buffer;
    
    const ctx = ensureSfxContext();
    if (!ctx) return null;
    
    // file:// 프로토콜 또는 origin이 null인 경우 fetch가 제한되므로 null 반환
    const isLocal = location.protocol === 'file:' || location.origin === 'null' || !location.origin || location.protocol === 'about:';
    if (isLocal) return null;
    
    try {
        const res = await fetch(wr.src);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        wr.buffer = buf;
        return buf;
    } catch (e) {
        try { console.warn('[wallRub] buffer load failed', e); } catch { /* ignore */ }
        return null;
    }
}

function ensureWallRubAudioElement() {
    // 레거시 호환성: 일부 코드에서 여전히 el을 참조할 수 있음
    const wr = state.audio.wallRub;
    if (wr.el) return wr.el;
    // WebAudio를 사용하므로 더 이상 Audio 엘리먼트를 생성하지 않음
    // 하지만 호환성을 위해 더미 객체 반환
    wr.el = { paused: true, volume: 0, currentTime: 0, duration: 0 };
    return wr.el;
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

    // 메모리 누수 방지: 버퍼 캐시 크기 제한 (최대 20개)
    const MAX_BUFFER_CACHE = 20;
    if (sfx.bufferCache.size >= MAX_BUFFER_CACHE) {
        // 가장 오래된 항목 제거 (FIFO)
        const firstKey = sfx.bufferCache.keys().next().value;
        if (firstKey) sfx.bufferCache.delete(firstKey);
    }

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
        
        // wallRub WebAudio 버퍼도 미리 로드
        loadWallRubBuffer().catch(() => {});
        
        // 상점 BGM 예열
        new Audio('resource/cute-level-up-2-189851.mp3').preload = 'auto';
        
        // BGM도 유저 제스처 이후 시작
        startBgmIfNeeded();
        
        // WebAudio 사용 시 AudioContext resume으로 정책 통과
        if (ctx) {
            const rp = ctx.resume();
            if (rp && typeof rp.then === 'function') {
                rp.then(() => {
                    state.audio.unlocked = true;
                    // 모바일: AudioContext가 다시 suspended 될 수 있으므로 주기적으로 체크
                    if (ctx.state === 'suspended') {
                        ctx.resume().catch(() => {});
                    }
                }).catch((err) => {
                    try { console.warn('[audio] unlock failed', err); } catch { /* ignore */ }
                    state.audio.unlocked = false;
                });
            } else {
                // Promise가 없는 환경이면 일단 unlocked 처리
                state.audio.unlocked = true;
            }
        } else {
            // WebAudio가 없으면 레거시 방식 (Audio 엘리먼트)
            const el = ensureWallRubAudioElement();
            el.volume = 0;
            const p = el.play();
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    state.audio.unlocked = true;
                    state.audio.wallRub.playing = true;
                }).catch((err) => {
                    try { console.warn('[audio] unlock failed', err); } catch { /* ignore */ }
                    state.audio.unlocked = false;
                });
            } else {
                state.audio.unlocked = true;
                state.audio.wallRub.playing = true;
            }
        }
    } catch (err) {
        try { console.warn('[audio] unlock exception', err); } catch { /* ignore */ }
        state.audio.unlocked = false;
    }
}

function startWallRubFade(mode, toVol, durMs) {
    const wr = state.audio.wallRub;
    // WebAudio: GainNode의 gain.value에서 현재 볼륨 가져오기
    const from = wr.gainNode ? Math.max(0, Math.min(1, wr.gainNode.gain.value || 0)) : 0;
    wr.fadeMode = mode;
    wr.fadeStartMs = state.nowMs;
    wr.fadeDurMs = durMs;
    wr.fadeFrom = from;
    wr.fadeTo = Math.max(0, Math.min(1, toVol));
}

function tickWallRubAudio(nowMs) {
    const wr = state.audio.wallRub;
    const ctx = ensureSfxContext();
    
    // WebAudio 사용 시
    if (ctx && wr.buffer) {
        // WebAudio: 루프 체크 및 재생
        if (wr.playing && wr.sourceNode) {
            // 피치(=playbackRate) 스무딩 적용
            const s = Math.max(0, Math.min(1, wr.rateSmoothing ?? 0.18));
            wr.rateCurrent = (wr.rateCurrent ?? 1) + ((wr.rateTarget ?? 1) - (wr.rateCurrent ?? 1)) * s;
            const pr = Math.max(0.5, Math.min(2.0, wr.rateCurrent));
            if (wr.sourceNode && wr.sourceNode.playbackRate.value !== pr) {
                try { wr.sourceNode.playbackRate.value = pr; } catch { /* ignore */ }
            }
        }

        // 페이드 진행
        if (wr.fadeMode !== 'none' && wr.gainNode) {
            const tRaw = (nowMs - wr.fadeStartMs) / (wr.fadeDurMs || 1);
            // easeInOutCubic는 game.js에 정의(호출 시점에는 항상 존재)
            const t = easeInOutCubic(tRaw);
            const targetGain = wr.fadeFrom + (wr.fadeTo - wr.fadeFrom) * t;
            wr.gainNode.gain.value = Math.max(0, Math.min(1, targetGain));
            
            if (tRaw >= 1) {
                wr.gainNode.gain.value = wr.fadeTo;
                const endedMode = wr.fadeMode;
                wr.fadeMode = 'none';
                if (endedMode === 'out' && wr.gainNode.gain.value <= 0.0001) {
                    // 재생 정지
                    if (wr.sourceNode) {
                        try {
                            wr.sourceNode.stop();
                            wr.sourceNode.disconnect();
                        } catch {}
                        wr.sourceNode = null;
                    }
                    wr.playing = false;
                }
            }
        }
        return; // WebAudio 사용 시 여기서 종료
    }
    
    // 레거시: Audio 엘리먼트 사용 (WebAudio가 없는 경우)
    const el = wr.el;
    if (!el) return;

    // 모바일 최적화: 재생 중인데 pause된 상태면 즉시 재생 시도
    if (wr.playing && el.paused) {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    }

    // 피치(=playbackRate) 스무딩 적용
    const s = Math.max(0, Math.min(1, wr.rateSmoothing ?? 0.18));
    wr.rateCurrent = (wr.rateCurrent ?? 1) + ((wr.rateTarget ?? 1) - (wr.rateCurrent ?? 1)) * s;
    const pr = Math.max(0.5, Math.min(2.0, wr.rateCurrent));
    if (el.playbackRate !== pr) {
        try { el.playbackRate = pr; } catch { /* ignore */ }
    }

    // 루프 구간 제어: 마지막 2초(tailSkipSec)는 사용하지 않음
    // 모바일 최적화: 더 일찍 루프를 시작하여 끊김 방지
    const dur = el.duration;
    const pad = Math.max(0, wr.tailSkipSec || 0);
    if (wr.playing && Number.isFinite(dur) && dur > pad + 0.1) {
        const loopEnd = dur - pad;
        const currentTime = el.currentTime || 0;
        // 모바일: 끝부분에 가까워지면 미리 되감기 (0.1초 여유)
        if (currentTime >= loopEnd - 0.1) {
            try { 
                el.currentTime = 0;
                // 모바일: 되감은 후 재생이 멈췄을 수 있으므로 재생 확인
                if (el.paused && wr.playing) {
                    const p = el.play();
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                }
            } catch { /* ignore */ }
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
    // 모바일 최적화: unlocked 대신 gestureUnlocked 체크 (마찰소리는 제스처만 있으면 재생 가능)
    if (!state.audio.gestureUnlocked) return;
    
    const ctx = ensureSfxContext();
    
    // WebAudio 사용 시
    if (ctx && wr.buffer) {
        if (isContact) {
            // 강도에 따라 볼륨 스케일
            const k = Math.max(0, Math.min(1, intensity));
            const target = wr.baseVolume * (0.20 + 0.80 * k);
            // 강도에 따라 피치(살짝 상승)
            wr.rateTarget = (wr.rateBase ?? 1.0) + (wr.rateMaxUp ?? 0.12) * k;

            // WebAudio: 필요하면 재생 시작
            if (!wr.playing) {
                const srcNode = ctx.createBufferSource();
                srcNode.buffer = wr.buffer;
                srcNode.playbackRate.value = Math.max(0.5, Math.min(2.0, wr.rateTarget));
                
                const gain = ctx.createGain();
                gain.gain.value = 0; // 시작 시 볼륨 0
                wr.gainNode = gain;
                
                srcNode.connect(gain);
                gain.connect(ctx.destination);
                
                const dur = wr.buffer.duration;
                const pad = Math.max(0, wr.tailSkipSec || 0);
                const loopEnd = dur - pad;
                const startTime = ctx.currentTime;
                
                srcNode.start(startTime);
                srcNode.stop(startTime + loopEnd);
                
                wr.sourceNode = srcNode;
                wr.playing = true;
                wr.rateCurrent = wr.rateTarget;
                wr.loopStartTime = startTime;
                wr.loopEndTime = startTime + loopEnd;
                
                // 루프 종료 시 재시작 (재귀적으로 루프)
                const createNextLoop = () => {
                    if (!wr.playing || !wr.buffer) return;
                    const nextTime = ctx.currentTime;
                    const nextSrc = ctx.createBufferSource();
                    nextSrc.buffer = wr.buffer;
                    nextSrc.playbackRate.value = Math.max(0.5, Math.min(2.0, wr.rateCurrent || 1.0));
                    nextSrc.connect(gain);
                    nextSrc.start(nextTime);
                    nextSrc.stop(nextTime + loopEnd);
                    wr.sourceNode = nextSrc;
                    wr.loopStartTime = nextTime;
                    wr.loopEndTime = nextTime + loopEnd;
                    nextSrc.onended = createNextLoop;
                };
                srcNode.onended = createNextLoop;
            }

            // 페이드아웃 중 재접촉: 디졸브 취소
            if (wr.fadeMode === 'out') wr.fadeMode = 'none';

            // 매 프레임 페이드를 "재시작"하면 볼륨이 0 근처에서 계속 리셋될 수 있으므로,
            // 볼륨/상태가 바뀌는 순간에만 페이드인 트리거.
            const eps = 0.02;
            const currentGain = wr.gainNode ? wr.gainNode.gain.value : 0;
            if (wr.fadeMode !== 'in') {
                if (currentGain < target - eps) {
                    startWallRubFade('in', target, 90);
                } else if (wr.gainNode) {
                    wr.gainNode.gain.value = target;
                }
            } else {
                // 이미 페이드인 중이면 목표만 상향(더 세게 문댈 때)
                if (wr.fadeTo < target) wr.fadeTo = target;
            }
        } else {
            // 접촉 해제 시 피치를 기본으로 복귀(페이드아웃 중에도 천천히 내려감)
            wr.rateTarget = (wr.rateBase ?? 1.0);
            // 떨어졌으면 페이드아웃 후 정지
            if (wr.playing && wr.fadeMode !== 'out') {
                startWallRubFade('out', 0, wr.fadeDurMs || 100);
            }
        }
        return; // WebAudio 사용 시 여기서 종료
    }
    
    // 레거시: Audio 엘리먼트 사용 (WebAudio가 없는 경우)
    const el = ensureWallRubAudioElement();
    if (!el) return;

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
        // 떨어졌으면 페이드아웃 후 정지
        if (wr.playing && wr.fadeMode !== 'out') {
            startWallRubFade('out', 0, wr.fadeDurMs || 100);
        }
    }
}


