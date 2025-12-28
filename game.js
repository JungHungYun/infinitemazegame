/**
 * 미로 찾기 게임 초안
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 리소스: 이미지(오른쪽이 진행 방향)
const CHASER_IMG = new Image();
const MISSILE_IMG = new Image();         // 플레이어 미사일
const CHASER_MISSILE_IMG = new Image();  // 추격자 미사일
const BOSS_IMG = new Image();            // 보스 이미지
// 코인 애니메이션 이미지
const COIN_FRONT_IMG = new Image();
const COIN_45_IMG = new Image();
const COIN_SIDE_IMG = new Image();
// 타일 이미지
const GROUND_IMGS = [new Image(), new Image(), new Image(), new Image(), new Image()]; // ground1~5
const WALL_IMG = new Image();
const WALL_BROKE_IMGS = [new Image(), new Image(), new Image()]; // wall_broke1~3

function loadImageWithDebug(img, url, label) {
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (ok, err) => {
            if (done) return;
            done = true;
            img.onload = null;
            img.onerror = null;
            ok ? resolve(true) : reject(err || new Error(`${label} 로드 실패`));
        };

        img.onload = () => finish(true);
        img.onerror = () => finish(false, new Error(`${label} 로드 실패: ${url}`));
        // 상대경로 안정화(배포/라우팅 케이스)
        img.src = url.startsWith('./') ? url : `./${url.replace(/^\.\//, '')}`;

        // 안전장치: decode() 가능하면 성공/실패를 더 확실히 감지
        if (typeof img.decode === 'function') {
            img.decode().then(() => finish(true)).catch((e) => {
                // decode가 실패해도 onload로 올 수 있으니 약간 유예
                setTimeout(() => {
                    if (img.complete && img.naturalWidth > 0) finish(true);
                    else finish(false, e || new Error(`${label} decode 실패`));
                }, 0);
            });
        }
    });
}

// 프리로드 상태
let GAME_IMG_READY = false;
let GAME_IMG_ERROR = '';

async function preloadGameImages() {
    // 중복 호출 방지
    if (GAME_IMG_READY) return true;
    try {
        // 필수 이미지들
        await Promise.all([
            loadImageWithDebug(CHASER_IMG, 'resource/imgage/chaser.png', '추격자 이미지'),
            loadImageWithDebug(MISSILE_IMG, 'resource/imgage/misslie.png', '플레이어 미사일 이미지'),
            loadImageWithDebug(CHASER_MISSILE_IMG, 'resource/imgage/chaser_misslie.png', '추격자 미사일 이미지'),
            loadImageWithDebug(BOSS_IMG, 'resource/imgage/boss.png', '보스 이미지'),
        ]);
        
        // 코인 이미지들은 선택적 로드 (파일이 없어도 게임 진행 가능)
        Promise.all([
            loadImageWithDebug(COIN_FRONT_IMG, 'resource/imgage/coin_front.png', '코인 앞면 이미지').catch(() => {}),
            loadImageWithDebug(COIN_45_IMG, 'resource/imgage/coin_45.png', '코인 45도 이미지').catch(() => {}),
            loadImageWithDebug(COIN_SIDE_IMG, 'resource/imgage/coin_side.png', '코인 옆면 이미지').catch(() => {}),
        ]).catch(() => {
            // 코인 이미지 로드 실패는 무시 (폴백 렌더링 사용)
        });
        
        // 타일 이미지들은 선택적 로드 (파일이 없어도 게임 진행 가능)
        Promise.all([
            loadImageWithDebug(GROUND_IMGS[0], 'resource/imgage/ground1.png', '바닥 타일 1').catch(() => {}),
            loadImageWithDebug(GROUND_IMGS[1], 'resource/imgage/ground2.png', '바닥 타일 2').catch(() => {}),
            loadImageWithDebug(GROUND_IMGS[2], 'resource/imgage/ground3.png', '바닥 타일 3').catch(() => {}),
            loadImageWithDebug(GROUND_IMGS[3], 'resource/imgage/ground4.png', '바닥 타일 4').catch(() => {}),
            loadImageWithDebug(GROUND_IMGS[4], 'resource/imgage/ground5.png', '바닥 타일 5').catch(() => {}),
            loadImageWithDebug(WALL_IMG, 'resource/imgage/wall.png', '벽 타일').catch(() => {}),
            loadImageWithDebug(WALL_BROKE_IMGS[0], 'resource/imgage/wall_broke1.png', '부서진 벽 1').catch(() => {}),
            loadImageWithDebug(WALL_BROKE_IMGS[1], 'resource/imgage/wall_broke2.png', '부서진 벽 2').catch(() => {}),
            loadImageWithDebug(WALL_BROKE_IMGS[2], 'resource/imgage/wall_broke3.png', '부서진 벽 3').catch(() => {}),
        ]).catch(() => {
            // 타일 이미지 로드 실패는 무시 (폴백 렌더링 사용)
        });
        
        GAME_IMG_READY = true;
        GAME_IMG_ERROR = '';
        return true;
    } catch (e) {
        GAME_IMG_READY = false;
        GAME_IMG_ERROR = String(e?.message || e);
        console.warn('[assets] image preload failed:', e);
        return false;
    }
}

// 게임 상태
const state = {
    mode: 'WORLD', // 'WORLD' 또는 'MAZE'
    currentChunk: { x: 2, y: 0 },
    chunks: new Map(),
    player: {
        worldPos: { x: 2, y: 0 },
        // 미로 좌표계는 "타일 단위 연속좌표"로 통일합니다.
        // 타일 (i, j)의 중심은 (i + 0.5, j + 0.5)
        mazePos: { x: 8.5, y: 16.5 }, // S 출구(아래쪽)에서 시작
        lives: 3,
        invincibleUntilMs: 0, // 플레이어 무적 시간
        shieldCharges: 0, // 실드 잔량(피격 1회 무효)
    },
    input: {
        pointerDown: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        startMs: 0,
        moved: false,
    },
    controls: {
        // 모바일 조작 모드: 'touch' | 'gyro'
        mobileMode: 'touch',
        gyro: {
            enabled: false,
            alpha: 0,
            beta: 0,
            gamma: 0,
            neutralBeta: 0,
            neutralGamma: 0,
            hasNeutral: false,
            tiltMaxDeg: 25,   // 이 이상 기울이면 입력 100%로 클램프
            radiusPx: 170,    // 가상 마우스 오프셋(픽셀)
            sensitivity: 1.0, // 0.5~2.0 정도
            listenerAttached: false,
        },
    },
    boss: {
        active: false,
        hp: 0,
        maxHp: 50,
        lastAttackMs: 0,
        lasers: [], // [{x, y, angle, width, lifeMs, soundPlayed?}]
        gridPatterns: [], // [{type, tiles: [{x, y, state, warnStartMs, damageStartMs, damageEndMs}], startMs}]
        missileSpawnMs: 0,
    },
    mouse: { x: 0, y: 0 },
    cameraY: 0,
    lastTime: 0,
    nowMs: 0,
    view: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    // 다음에 미로에 들어갈 때 어느 방향(입구)에서 시작할지
    // 'N' | 'S' | 'E' | 'W'
    nextEntryDir: 'S',
    // Tab 청크맵 기능 제거됨 (미니맵은 좌상단 패널에 상시 표시)
    // 현재 청크에 "어느 방향에서" 들어왔는지 (플레이어 리셋/추격자 스폰에 사용)
    currentEntryDir: 'S',
    // 추격자 상태
    chaser: {
        active: false,
        // 추격자는 "월드 청크 좌표 + 청크 내부 연속 좌표"로 유지(청크를 넘어 추격)
        chunk: { x: CONFIG.START_CHUNK_X, y: CONFIG.START_CHUNK_Y },
        pos: { x: 0.5, y: 0.5 }, // 연속 좌표(타일 중심 기준)
        path: [],
        pathIndex: 0,
        lastRepathMs: 0,
        lastTargetTile: null,
        graceUntilMs: 0,
        stunUntilMs: 0,
        lastShotMs: 0,
        // 청크 진입 연출: 일정 시간 동안은 아예 등장하지 않다가, 시간이 지나면 입구로 진입
        entryScheduledUntilMs: 0,
        entryScheduledDir: 'S',
        // 첫 활성화(3번째 행) 때는 랜덤 위치 스폰을 위해 사용
        entryScheduledPos: null, // {x,y} in maze coords
        isPresentInMaze: false,
        nextEntryDelayMs: CONFIG.CHASER_ENTRY_DELAY_MS,
        caughtCount: 0,
        speedMult: 1.0,
        slowUntilMs: 0, // 강화 화약 슬로우 효과
        deadUntilNextChunk: false, // 살상 미사일에 의해 파괴됨
        respawnTimerMs: 0,
        // 보스전 종료 직후 스폰/미사일 난사 방지용 쿨다운
        bossCooldownUntilMs: 0,
        // 추격자 체력 (미사일 기본 공격력의 5배)
        hp: CONFIG.MISSILE_DAMAGE * 5,
        maxHp: CONFIG.MISSILE_DAMAGE * 5,
    },
    chaserProjectiles: [], // {pos, vel}

    // 아이템(필드 내 미사일 아이템) - 현재 청크에만 유지
    items: [], // [{ pos:{x,y} }]
    // 하트 드롭 - 현재 청크에만 유지
    hearts: [], // [{ pos:{x,y} }]
    inventory: {
        missiles: 0,
        gunpowder: 0,
    },
    coins: 0,
    // 점수는 시간 감점 때문에 소수 누적이 생길 수 있어 float로 관리(표시는 정수)
    score: 0,
    missiles: [], // [{ pos:{x,y}, vel:{x,y} }]
    pendingMissileShots: [], // [{ fireMs }]

    fx: {
        // 파티클은 "미로 좌표계(셀 단위)"로 저장하고 drawMaze에서 화면 좌표로 변환해 렌더
        particles: [],
        // 보스 피격 혈흔(바닥에 남는 데칼)
        bloodSplats: [], // [{x,y,r,rx,ry,rot,a,bornMs,lifeMs}]
        shake: { amp: 0, t: 0 },
        flash: { a: 0 },
        lastTrailMs: 0,
        // 아이템 획득 시 플레이어 색 틴트(코인=노랑, 미사일=청록) 연출
        playerTint: { a: 0, r: 255, g: 210, b: 77 }, // a:0..1
        // 점수 증감 표시 (플레이어 위에 뜨는 텍스트)
        scorePopups: [], // [{x,y,value,isPositive,lifeMs,bornMs,velY}]
        // 마찰열 연출을 위한 상태
        wallRubHeatMs: 0,
        wallRubTargetMs: 5000,
    },

    abilities: {
        wallBreakUnlocked: false,
        wallBreakSpeedMult: 1.0,
        missileSpawnChanceMult: 1.0,
        missileFieldSpawnBonus: 0, // 미사일 아이템 등장 확률 +N (0..1, 최대 +100%)
        maxFieldMissileItems: 1,   // 필드(현재 청크) 내 미사일 아이템 최대 동시 등장 개수
        missileStunBonusMs: 0,
        missileCount: 1, // 기본 1개
        moveSpeedMult: 1.0,
        coinFieldSpawnBonus: 0, // 필드 코인 스폰 보너스(0..3.0, 1회당 +0.15, 최대 20회)
        heartDropChance: 0, // 하트 드롭 확률(0..0.10). 1회 획득당 +0.001(=0.1%)
        goldWallUnlocked: false,
        goldWallProb: 0.03, // 최초 3%
        coinWallCoinAmount: 5, // 코인 벽(사금벽) 파괴 시 기본 코인 획득량
        coinGainBonus: 0, // 모든 코인 획득량 +N
        // 벽 내구도 약화(레벨별 추가 배수, 1회당 -2% = x0.98, 최대 50%까지)
        wallDurabilityMultCommon: 1.0,    // 갈/파/녹 (레벨 0~2)
        wallDurabilityMultRare: 1.0,      // 보/노/주 (레벨 3~5)
        wallDurabilityMultEpic: 1.0,      // 회/흰 (레벨 7~8)
        wallDurabilityMultLegendary: 1.0, // 검정 (레벨 9)
        missileWallBreakUnlocked: false,
        missileWallBreakProb: 0.10, // 최초 10%
        missileGunpowderProb: 0, // 벽 부쉈을 때 강화 화약 얻을 확률
        shopSlots: 3, // 기본 3개
        talismanCount: 0, // 부적 구매 횟수
        killMissileUnlocked: false, // 살상 미사일
        interceptMissileUnlocked: false, // 요격 미사일
        maxLives: 3,
        shieldMax: 0, // 실드 최대치(구매로 증가, 최대 3)
        // 금융 어빌리티
        bankDeposit: { enabled: false, intervalMs: 10000, timerMs: 0 }, // 예금: 10s마다 +1coin, 점점 빨라짐(최소 1s)
        bankSaving: { enabled: false, targetFloors: 5, progress: 0 },   // 적금: N층마다 +10coin, 점점 N 감소(최소 1)
        livingLoan: { debt: 0, graceFloors: 0, repayAccMs: 0, penaltyAccMs: 0, penaltyRate: 0 }, // 생활비 대출
        freeRerollTickets: 0, // 무료 티켓 잔여(상점 리롤 무료 횟수)
        freeRerollRestoreCost: 1, // 티켓 소진 후 복구할 리롤 비용
        boughtCountByRarity: {
            COMMON: 0,
            RARE: 0,
            EPIC: 0,
            LEGENDARY: 0
        },
        rarityBonus: {
            COMMON: 0,
            RARE: 0,
            EPIC: 0,
            LEGENDARY: 0
        }
    },

    ui: {
        started: false, // 타이틀 화면에서 첫 입력 후 true
        modalOpen: false,
        settingsOpen: false,
        gameOverOpen: false,
        runStartMs: null,
        maxFloorReached: 1,
        bossKills: 0,
        isMobile: false,
        abilityNotice: '',
        abilityShownFloors: new Set(), // 이미 선택창을 띄운 층(중복 방지)
        abilityChoices: [],
        boughtAbilities: new Set(),    // 이번 리롤에서 이미 구매한 능력들
        abilityRerollCost: 1,         // 현재 리롤 비용
        pendingEnter: null, // {x,y,entryDir}
        // 아이템 획득 직후 1초간 캐릭터 위에 보유량 표시(아이콘 + 세그먼트 숫자)
        pickupBadgeUntilMs: 0,
        pickupBadgeCoins: 0,
        pickupBadgeMissiles: 0,
        pickupBadgeGunpowder: 0,
    },

    // 청크 전환(스와이프) 연출
    transition: {
        active: false,
        startMs: 0,
        durMs: 260,
        dx: 0,
        dy: 0,
        fromChunk: null, // {x,y}
        toChunk: null,   // {x,y}
        entryDir: 'S',
        fromPos: null,   // {x,y} in maze coords (렌더용)
        toPos: null,     // {x,y} in maze coords (렌더용)
        toWorldPos: null, // {x,y}
    },

    audio: {
        // 유저 제스처(키/클릭)로 오디오 재생이 허용된 상태인지
        gestureUnlocked: false,
        // wallRub(미디어 엘리먼트) 언락 성공 여부(자동재생 정책 통과)
        unlocked: false,
        // 모바일 최적화: AudioContext 상태 체크 주기 관리
        lastContextCheckMs: 0,
        wallRub: {
            src: 'resource/bench-grinder-for-chainsaw-37683.mp3',
            el: null, // 레거시 호환성 (WebAudio로 전환 중)
            buffer: null, // WebAudio AudioBuffer
            sourceNode: null, // 현재 재생 중인 BufferSource
            gainNode: null, // 볼륨 제어용 GainNode
            playing: false,
            // 페이드 상태
            fadeMode: 'none', // 'none' | 'in' | 'out'
            fadeStartMs: 0,
            fadeDurMs: 100,
            fadeFrom: 0,
            fadeTo: 0,
            baseVolume: 0.2,
            minContactIntensity: 0.06,
            // 음원 끝부분(마지막 N초)은 사용하지 않음
            tailSkipSec: 2,
            // 피치(=playbackRate) 제어
            rateBase: 1.0,
            rateMaxUp: 0.12,      // 강도 1일 때 최대 +12% (살짝만)
            rateSmoothing: 0.18,  // 0..1 (클수록 더 빨리 따라감)
            rateTarget: 1.0,
            rateCurrent: 1.0,
            // WebAudio 루프 추적
            loopStartTime: 0, // 현재 루프 시작 시간 (AudioContext.currentTime 기준)
            loopEndTime: 0, // 현재 루프 종료 시간

        },
        wallRubContactThisFrame: false,
        wallRubIntensityThisFrame: 0,
        wallRubWasContact: false,

        // 1회성 SFX (미사일 발사/폭발 등)
        sfx: {
            master: 0.85,
            ctx: null,
            bufferCache: new Map(), // src -> AudioBuffer
            audioPool: [], // Audio 엘리먼트 풀 (모바일 최적화)
            maxPoolSize: 8, // 최대 풀 크기
        },

        // BGM
        bgm: {
            tracks: [
                'resource/bgm/alpha-drive-rhythms-264091.mp3',
                'resource/bgm/8-strong-fighter-battle-game-bgm-264623.mp3',
                'resource/bgm/aggressive-metal-sinister-111839.mp3',
                'resource/bgm/crazy-bad-2-min-edit-electronic-rock-game-music-414772.mp3',
                'resource/bgm/intense-phonk-heavy-metal-instrumental-226341.mp3',
                'resource/bgm/livin-dead-276389.mp3',
                'resource/bgm/raw-energetic-rock-music-261966.mp3',
                'resource/bgm/shred-onwards-244212.mp3'
            ],
            idx: 0,
            el: null,
            volume: 0.35,
            started: false,
            shuffle: true,
        },
    },
};

// --- 유틸리티 ---
function getChunkKey(x, y) {
    return `${x},${y}`;
}

function rand(min, max) {
    return min + Math.random() * (max - min);
}

function hashStringToUint(str) {
    // 간단한 문자열 해시(FNV-1a 변형)
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function easeInOutCubic(t) {
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function rgb(r, g, b, a = 1) {
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

// --- UI helpers (폰트 없이 숫자 표시: 7-seg) ---
function drawSevenSegDigit(ctx, x, y, d, s, color, alpha = 1) {
    // (x,y)는 좌상단. s는 스케일(픽셀).
    const w = 10 * s;
    const h = 18 * s;
    const t = 2.2 * s; // 두께
    const gap = 1.2 * s;

    // 7 segments: a b c d e f g
    const segOn = [
        [1,1,1,1,1,1,0], //0
        [0,1,1,0,0,0,0], //1
        [1,1,0,1,1,0,1], //2
        [1,1,1,1,0,0,1], //3
        [0,1,1,0,0,1,1], //4
        [1,0,1,1,0,1,1], //5
        [1,0,1,1,1,1,1], //6
        [1,1,1,0,0,0,0], //7
        [1,1,1,1,1,1,1], //8
        [1,1,1,1,0,1,1], //9
    ];
    const on = segOn[d] || segOn[0];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;

    // a (top)
    if (on[0]) ctx.fillRect(x + gap, y, w - gap * 2, t);
    // b (top-right)
    if (on[1]) ctx.fillRect(x + w - t, y + gap, t, h / 2 - gap * 1.5);
    // c (bottom-right)
    if (on[2]) ctx.fillRect(x + w - t, y + h / 2 + gap * 0.5, t, h / 2 - gap * 1.5);
    // d (bottom)
    if (on[3]) ctx.fillRect(x + gap, y + h - t, w - gap * 2, t);
    // e (bottom-left)
    if (on[4]) ctx.fillRect(x, y + h / 2 + gap * 0.5, t, h / 2 - gap * 1.5);
    // f (top-left)
    if (on[5]) ctx.fillRect(x, y + gap, t, h / 2 - gap * 1.5);
    // g (middle)
    if (on[6]) ctx.fillRect(x + gap, y + h / 2 - t / 2, w - gap * 2, t);

    ctx.restore();
    return { w, h };
}

function drawSevenSegNumber(ctx, x, y, value, s, color, alpha = 1) {
    const v = Math.max(0, Math.floor(value || 0));
    const str = String(v);
    let cx = x;
    const digitGap = 2.2 * s;
    for (let i = 0; i < str.length; i++) {
        const d = str.charCodeAt(i) - 48;
        const { w } = drawSevenSegDigit(ctx, cx, y, d, s, color, alpha);
        cx += w + digitGap;
    }
    return cx - x;
}

function measureSevenSegNumberWidth(value, s) {
    const v = Math.max(0, Math.floor(value || 0));
    const digits = String(v).length || 1;
    const w = 10 * s;
    const gap = 2.2 * s;
    return digits * w + Math.max(0, digits - 1) * gap;
}

function drawCoinIcon(ctx, x, y, r, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(255,230,140,0.95)');
    g.addColorStop(1, 'rgba(255,180,40,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.stroke();
    ctx.restore();
}

function drawMissileIcon(ctx, x, y, s, alpha = 1) {
    // 아주 단순한 미사일 실루엣
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    const L = s * 1.6;
    const W = s * 0.55;
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(L * 0.55, 0);
    ctx.lineTo(-L * 0.35, W);
    ctx.lineTo(-L * 0.55, 0);
    ctx.lineTo(-L * 0.35, -W);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 꼬리
    ctx.fillStyle = 'rgba(120,255,255,0.60)';
    ctx.beginPath();
    ctx.arc(-L * 0.58, 0, Math.max(1.0, s * 0.22), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawGunpowderIcon(ctx, x, y, r, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // 화약: 검은색/어두운 회색의 육각형 혹은 알갱이 뭉치 느낌
    ctx.fillStyle = '#222';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    
    // 작은 육각형 3개를 겹쳐서 가루 주머니나 뭉치 느낌 유도
    const drawDot = (ox, oy, or) => {
        ctx.beginPath();
        for(let i=0; i<6; i++) {
            const ang = i * Math.PI / 3;
            const px = ox + Math.cos(ang) * or;
            const py = oy + Math.sin(ang) * or;
            if(i===0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    };

    drawDot(x, y, r * 0.85);
    drawDot(x - r * 0.3, y + r * 0.2, r * 0.5);
    drawDot(x + r * 0.4, y + r * 0.1, r * 0.4);
    
    ctx.restore();
}

// 오디오 로직은 `audio.js`로 분리되었습니다.

// --- 드로잉: 플레이어(에너지 오브/나선환) ---
// 렉 방지: 복잡한 궤적 계산/선분 렌더를 매 프레임 하지 않고,
// "오프스크린 스프라이트(캐시)"를 1회 생성 후 drawImage로만 그립니다.
const PLAYER_SPRITE_CACHE = new Map(); // key -> { c, w, h, pad }

function buildPlayerOrbSprite(radiusPx, quality = 'mid') {
    const r = Math.max(2, radiusPx);
    // quality에 따라 비용(선 수/샘플)을 조정
    const q = (quality === 'low') ? 0 : (quality === 'high' ? 2 : 1);
    const glow = 16 + q * 6;
    const orbitCount = 5 + q * 3;  // 5/8/11
    const wispCount = 3 + q * 2;   // 3/5/7
    const orbitTurns = 2.2 + q * 0.35;
    const lineWidth = 1.4 + q * 0.6;
    const steps = Math.max(36, Math.floor(r * (4.5 + q * 1.8)));

    // 블러가 잘리지 않도록 패딩 확보
    const pad = Math.ceil(glow * 2 + r * 0.45 + 6);
    const size = Math.ceil((r + pad) * 2);
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');

    // 랜덤(하지만 고정된) 흔들림을 위해 seed 사용
    const rng = mulberry32(0xC0FFEE ^ (Math.floor(r) * 2654435761) ^ (q * 97531));
    const baseColor = '#00ffff';

    g.save();
    g.translate(size / 2, size / 2);
    g.globalCompositeOperation = 'lighter';

    // 코어 글로우
    g.shadowBlur = glow * 1.15;
    g.shadowColor = baseColor;
    const core = g.createRadialGradient(0, 0, r * 0.05, 0, 0, r * 1.25);
    core.addColorStop(0.00, 'rgba(255,255,255,0.98)');
    core.addColorStop(0.12, 'rgba(160,240,255,0.80)');
    core.addColorStop(0.35, 'rgba(0,220,255,0.35)');
    core.addColorStop(1.00, 'rgba(0,220,255,0.00)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    g.fill();

    // 내부 하얀 코어
    g.shadowBlur = glow * 1.25;
    g.fillStyle = 'rgba(255,255,255,0.90)';
    g.beginPath();
    g.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    g.fill();

    // 궤도선
    g.shadowBlur = glow * 0.95;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(1.1, lineWidth);

    for (let k = 0; k < orbitCount; k++) {
        const phase = (k / orbitCount) * Math.PI * 2;
        const tilt = phase * (0.55 + 0.3 * rng());
        const a = r * (0.78 + 0.26 * rng());
        const b = r * (0.52 + 0.30 * rng());
        const alpha = 0.11 + 0.10 * rng();
        g.strokeStyle = `rgba(180, 245, 255, ${alpha})`;

        g.save();
        g.rotate(tilt);
        g.beginPath();
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const ang = t * Math.PI * 2 * orbitTurns;
            const wob = 1 + 0.05 * Math.sin(ang * (2.2 + 0.7 * rng()) + phase);
            const px = Math.cos(ang) * a * wob;
            const py = Math.sin(ang) * b * (1 / wob);
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
        }
        g.stroke();
        g.restore();
    }

    // 외곽 링
    g.shadowBlur = glow * 1.05;
    g.strokeStyle = 'rgba(0, 220, 255, 0.18)';
    g.lineWidth = Math.max(1.2, lineWidth * 1.05);
    g.beginPath();
    g.arc(0, 0, r * 1.03, 0, Math.PI * 2);
    g.stroke();

    // 위습(바깥 흐릿한 곡선)
    g.shadowBlur = glow * 0.85;
    g.lineWidth = Math.max(0.9, lineWidth * 0.9);
    const wispSteps = Math.max(20, Math.floor(steps * 0.45));
    for (let w = 0; w < wispCount; w++) {
        const ph = (w / wispCount) * Math.PI * 2;
        const rr = r * (1.05 + 0.25 * rng());
        const a2 = rr * (1.12 + 0.25 * rng());
        const b2 = rr * (0.82 + 0.25 * rng());
        const alpha = 0.08 + 0.08 * rng();
        g.strokeStyle = `rgba(120, 220, 255, ${alpha})`;

        g.save();
        g.rotate(ph * (0.5 + 0.3 * rng()));
        g.beginPath();
        for (let i = 0; i <= wispSteps; i++) {
            const t = i / wispSteps;
            const ang = t * Math.PI * 2;
            const wob = 1 + 0.10 * Math.sin(ang * (2.4 + 1.1 * rng()) + ph);
            const px = Math.cos(ang) * a2 * wob;
            const py = Math.sin(ang) * b2 * (2 - wob) * 0.7;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
        }
        g.stroke();
        g.restore();
    }

    g.restore();

    return { c, w: size, h: size, pad };
}

function getPlayerOrbSprite(radiusPx, quality) {
    const rKey = Math.max(2, Math.round(radiusPx)); // 캐시 키 안정화(미세 변화로 폭발 방지)
    const key = `${rKey}:${quality}`;
    const hit = PLAYER_SPRITE_CACHE.get(key);
    if (hit) return hit;
    const built = buildPlayerOrbSprite(rKey, quality);
    PLAYER_SPRITE_CACHE.set(key, built);
    return built;
}

// 외부 API는 유지: 기존 호출부 수정 최소화
function drawSpiralPlayer(ctx, x, y, radiusPx, timeMs, opts = {}) {
    const quality = opts.quality || (radiusPx <= 12 ? 'low' : 'mid');
    const spin = (typeof opts.spin === 'number') ? opts.spin : 0.0014;
    const rot = timeMs * spin;
    const pulse = 0.92 + 0.08 * Math.sin(timeMs * 0.006);

    const spr = getPlayerOrbSprite(radiusPx, quality);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(pulse, pulse);
    // drawImage만으로 표시(가벼움)
    ctx.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    ctx.restore();
}

function drawSpeckleNoise(ctx2, w, h, rng, count, colA, colB, alpha) {
    for (let i = 0; i < count; i++) {
        const x = rng() * w;
        const y = rng() * h;
        const r = lerp(0.6, 2.2, rng());
        const t = rng();
        ctx2.fillStyle = t < 0.5 ? colA : colB;
        ctx2.globalAlpha = alpha * lerp(0.2, 1.0, rng());
        ctx2.beginPath();
        ctx2.arc(x, y, r, 0, Math.PI * 2);
        ctx2.fill();
    }
    ctx2.globalAlpha = 1;
}

// --- 미로 텍스처 빌드(프레임 드랍 방지: 점진 생성) ---
// drawMaze에서 처음 청크에 진입할 때 buildChunkMazeTexture가 한 번에 무거운 캔버스 작업을 수행하면
// "게임 시작/청크 진입 순간"에 프레임이 크게 떨어질 수 있어, 큐로 분산 생성합니다.
const MAZE_TEX_QUEUE = [];
const MAZE_TEX_QUEUED = new Set();
let MAZE_TEX_SYNC_ALLOWED = false;
let MAZE_TEX_PLACEHOLDER = null;

function getMazeTexPlaceholder() {
    if (MAZE_TEX_PLACEHOLDER) return MAZE_TEX_PLACEHOLDER;
    const size = CONFIG.MAZE_SIZE;
    const tile = 64;
    const pad = 16;
    const w = size * tile + pad * 2;
    const h = size * tile + pad * 2;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    // drawMaze에서 사용하는 메타(패딩 제외 영역)
    c._pad = pad;
    c._tile = tile;
    c._innerW = size * tile;
    c._innerH = size * tile;
    const g = c.getContext('2d');
    // 아주 가벼운 플레이스홀더(어두운 바탕 + 격자)만 그립니다.
    g.fillStyle = '#060403';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.03)';
    g.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
        const x = pad + i * tile;
        const y = pad + i * tile;
        g.beginPath(); g.moveTo(x, pad); g.lineTo(x, pad + size * tile); g.stroke();
        g.beginPath(); g.moveTo(pad, y); g.lineTo(pad + size * tile, y); g.stroke();
    }
    MAZE_TEX_PLACEHOLDER = c;
    return MAZE_TEX_PLACEHOLDER;
}

function queueMazeTexBuild(chunk) {
    if (!chunk || chunk.mazeTex) return;
    const k = getChunkKey(chunk.x, chunk.y);
    if (MAZE_TEX_QUEUED.has(k)) return;
    MAZE_TEX_QUEUED.add(k);
    MAZE_TEX_QUEUE.push(k);
}

function processMazeTexQueue(budgetMs = 6) {
    // 타이틀 화면에서도 큐가 쌓일 수 있으니, started 전에는 처리하지 않음(사용자 체감 우선)
    if (!state?.ui?.started) return;
    if (!MAZE_TEX_QUEUE.length) return;
    const start = performance.now();
    while (MAZE_TEX_QUEUE.length && (performance.now() - start) < budgetMs) {
        const k = MAZE_TEX_QUEUE.shift();
        MAZE_TEX_QUEUED.delete(k);
        const ch = state.chunks.get(k);
        if (!ch || ch.mazeTex) continue;
        MAZE_TEX_SYNC_ALLOWED = true;
        try {
            buildChunkMazeTexture(ch);
        } finally {
            MAZE_TEX_SYNC_ALLOWED = false;
        }
    }
}

function buildChunkMazeTexture(chunk) {
    // 청크별 "마인크래프트 dirt" 느낌 텍스처를 1회 생성해 캐시
    if (chunk.mazeTex) return chunk.mazeTex;
    // draw 단계에서 즉시 빌드하면 프레임이 크게 떨어질 수 있으므로,
    // 큐에 넣고 일단 플레이스홀더를 반환(다음 프레임부터 점진 생성)
    if (!MAZE_TEX_SYNC_ALLOWED) {
        queueMazeTexBuild(chunk);
        return getMazeTexPlaceholder();
    }

    const size = CONFIG.MAZE_SIZE;
    // 16x16 픽셀 아트 타일을 4배 스케일(=64px)로 확대해 블록감을 유지
    const tile = 64;
    const pad = 16;
    const w = size * tile + pad * 2;
    const h = size * tile + pad * 2;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    // drawMaze에서 타일과 정확히 정렬되도록 메타 저장(패딩 제외 영역만 잘라 그리기 위함)
    c._pad = pad;
    c._tile = tile;
    c._innerW = size * tile;
    c._innerH = size * tile;
    const g = c.getContext('2d');

    const seed = hashStringToUint(`chunk:${chunk.x},${chunk.y}`);
    const rng = mulberry32(seed);

    // 픽셀아트 스타일로 그리기 위해 내부에서는 smoothing OFF
    g.imageSmoothingEnabled = false;

    // 타일 변형(몇 개만 만들어 재사용)
    const mkDirtVariant = (seed2, wallLevel = -1) => {
        const isWall = wallLevel >= 0;
        const r2 = mulberry32(seed2);
        const t = document.createElement('canvas');
        t.width = 16;
        t.height = 16;
        const tg = t.getContext('2d');
        const img = tg.createImageData(16, 16);

        // 시인성(명도차) 강화:
        // - 바닥: 더 밝은 흙(길)
        // - 벽: 레벨별 지정 색상 사용
        let palette;
        if (isWall) {
            const baseCol = CONFIG.WALL_LEVELS[wallLevel].color;
            palette = [
                baseCol,
                [Math.min(255, baseCol[0] + 15), Math.min(255, baseCol[1] + 15), Math.min(255, baseCol[2] + 15)],
                [Math.max(0, baseCol[0] - 15), Math.max(0, baseCol[1] - 15), Math.max(0, baseCol[2] - 15)],
                [Math.min(255, baseCol[0] + 25), Math.min(255, baseCol[1] + 25), Math.min(255, baseCol[2] + 25)],
                [Math.max(0, baseCol[0] - 25), Math.max(0, baseCol[1] - 25), Math.max(0, baseCol[2] - 25)],
            ];
        } else {
            palette = [
                [152, 110, 74],
                [170, 124, 84],
                [138, 100, 67],
                [186, 136, 92],
                [126, 92, 62],
            ];
        }

        const pick = () => palette[Math.floor(r2() * palette.length)];

        // 기본 픽셀 채우기
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                let col = pick();
                // 큰 덩어리 느낌: 주변 픽셀과 조금 연속되게
                if (r2() < 0.55) {
                    col = palette[Math.floor(r2() * palette.length)];
                }
                const i = (y * 16 + x) * 4;
                img.data[i] = col[0];
                img.data[i + 1] = col[1];
                img.data[i + 2] = col[2];
                img.data[i + 3] = 255;
            }
        }

        tg.putImageData(img, 0, 0);

        // 벽은 위쪽 하이라이트/아래 그림자를 픽셀 단위로 더해서 "언덕" 느낌 + 경계 강조
        if (isWall) {
            // 아랫면 그림자
            tg.globalAlpha = 0.65;
            tg.fillStyle = 'rgba(0,0,0,1)';
            tg.fillRect(0, 13, 16, 3);
            // 좌측/우측 외곽선(벽이 더 잘 보이게)
            tg.globalAlpha = 0.55;
            tg.fillStyle = 'rgba(0,0,0,1)';
            tg.fillRect(0, 0, 1, 16);
            tg.fillRect(15, 0, 1, 16);
            tg.globalAlpha = 1;
        }
        return t;
    };

    const baseSeed = seed;
    const floorVariants = Array.from({ length: 10 }, (_, i) => mkDirtVariant(baseSeed ^ (i * 2654435761), -1));
    
    // 벽 레벨별 변형 타일 생성 (캐싱 효율을 위해 현재 청크에 존재하는 벽 레벨만 생성해도 되지만, 일단 전체 생성)
    const wallVariantsByLevel = CONFIG.WALL_LEVELS.map((_, lv) => {
        return Array.from({ length: 5 }, (_, i) => mkDirtVariant((baseSeed ^ (lv * 99991)) ^ (i * 374761393), lv));
    });

    // 사금 벽 변형 생성
    const goldWallVariants = Array.from({ length: 5 }, (_, i) => {
        const t = mkDirtVariant((baseSeed ^ 0x7777) ^ (i * 12345), 0); // 갈색 기반
        const tg = t.getContext('2d');
        tg.fillStyle = 'rgba(255, 215, 0, 0.8)'; // 금색 점
        for(let p=0; p<15; p++) {
            tg.fillRect(Math.floor(Math.random()*14)+1, Math.floor(Math.random()*14)+1, 1, 1);
        }
        return t;
    });

    // 검정색 외곽 벽 변형 생성
    const blackWallVariants = Array.from({ length: 5 }, (_, i) => {
        const t = document.createElement('canvas');
        t.width = 16; t.height = 16;
        const tg = t.getContext('2d');
        tg.fillStyle = '#050505';
        tg.fillRect(0, 0, 16, 16);
        tg.strokeStyle = 'rgba(255,255,255,0.1)';
        tg.strokeRect(0.5, 0.5, 15, 15);
        return t;
    });

    // 화약 벽 변형 생성
    const gunpowderWallVariants = Array.from({ length: 5 }, (_, i) => {
        // 기본 흙 타일 위에 검은색 화약 가루 점들 추가
        const t = mkDirtVariant((baseSeed ^ 0x9999) ^ (i * 12345), 0);
        const tg = t.getContext('2d');
        tg.fillStyle = 'rgba(20, 20, 20, 0.85)';
        const r2 = mulberry32((baseSeed ^ 0x8888) ^ (i * 54321));
        for(let p=0; p<12; p++) {
            tg.fillRect(Math.floor(r2()*14)+1, Math.floor(r2()*14)+1, 1, 1);
        }
        return t;
    });

    // 전체 배경도 dirt 패턴으로 채움(패드 영역 포함)
    const bgTile = floorVariants[0];
    const pat = g.createPattern(bgTile, 'repeat');
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);

    // 타일 렌더링
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const wallValue = chunk.maze[y][x];
            const isWall = wallValue > 0;
            const px = pad + x * tile;
            const py = pad + y * tile;

            // 타일 이미지 사용 (로드되었으면)
            const useTileImages = WALL_IMG.complete && WALL_IMG.naturalWidth > 0 && GROUND_IMGS[0].complete && GROUND_IMGS[0].naturalWidth > 0;
            
            if (useTileImages) {
                if (isWall) {
                    // 벽 이미지 사용 (특수 벽은 기존 방식 유지)
                    const hasGunpowder = hasGunpowderMarkOnWall(chunk, x, y, wallValue);
                    if (wallValue === 100) {
                        // 사금벽은 기존 방식
                        const v = goldWallVariants[(x * 31 + y * 17) % goldWallVariants.length];
                        g.drawImage(v, px, py, tile, tile);
                    } else if (wallValue === 200) {
                        // 검정 벽은 기존 방식
                        const v = blackWallVariants[(x * 31 + y * 17) % blackWallVariants.length];
                        g.drawImage(v, px, py, tile, tile);
                    } else if (hasGunpowder) {
                        // 화약벽은 기존 방식
                        const v = gunpowderWallVariants[(x * 31 + y * 17) % gunpowderWallVariants.length];
                        g.drawImage(v, px, py, tile, tile);
                    } else {
                        // 일반 벽은 이미지 사용 (명도 감소 + 그림자 효과)
                        g.save();
                        // 그림자 효과 (벽 가장자리)
                        g.shadowBlur = 8;
                        g.shadowColor = 'rgba(0, 0, 0, 0.6)';
                        g.shadowOffsetX = 2;
                        g.shadowOffsetY = 2;
                        // 명도 감소 (더 어둡게)
                        g.globalAlpha = 0.5; // 명도 50% 감소
                        g.drawImage(WALL_IMG, px, py, tile, tile);
                        g.restore();
                    }
                } else {
                    // 바닥 이미지 무작위 선택 (청크마다 다른 패턴, 더 무작위)
                    // mulberry32 RNG를 사용하여 더 자연스러운 무작위 배치
                    const groundRng = mulberry32(hashStringToUint(`ground:${chunk.x},${chunk.y},${x},${y}`));
                    const groundIdx = Math.min(Math.floor(groundRng() * GROUND_IMGS.length), GROUND_IMGS.length - 1);
                    const groundImg = GROUND_IMGS[groundIdx];
                    if (groundImg && groundImg.complete && groundImg.naturalWidth > 0) {
                        g.drawImage(groundImg, px, py, tile, tile);
                    } else {
                        // 이미지가 로드되지 않았으면 폴백
                        const v = floorVariants[(x * 31 + y * 17) % floorVariants.length];
                        g.drawImage(v, px, py, tile, tile);
                    }
                }
            } else {
                // 기존 방식 (이미지가 없을 때)
                let v;
                if (isWall) {
                    // 화약 여부 판정 (Stable RNG + "한 번 부쉈으면 일반 벽" 규칙 반영)
                    const hasGunpowder = hasGunpowderMarkOnWall(chunk, x, y, wallValue);

                    if (wallValue === 100) {
                        v = goldWallVariants[(x * 31 + y * 17) % goldWallVariants.length];
                    } else if (wallValue === 200) {
                        v = blackWallVariants[(x * 31 + y * 17) % blackWallVariants.length];
                    } else if (hasGunpowder) {
                        v = gunpowderWallVariants[(x * 31 + y * 17) % gunpowderWallVariants.length];
                    } else {
                        const lv = wallValue - 1;
                        const variants = wallVariantsByLevel[lv];
                        v = variants[(x * 31 + y * 17) % variants.length];
                    }
                } else {
                    v = floorVariants[(x * 31 + y * 17) % floorVariants.length];
                }
                g.drawImage(v, px, py, tile, tile);
            }

            // 바닥은 더 밝게, 벽은 더 어둡게 추가 보정(명도차 강화)
            if (!isWall) {
                g.globalAlpha = 0.15; // 밝게 보정 강화
                g.fillStyle = 'rgba(255,255,255,1)';
                g.fillRect(px, py, tile, tile);
                g.globalAlpha = 1;
            } else {
                g.globalAlpha = 0.70; // 어둡게 보정 더 강화
                g.fillStyle = 'rgba(0,0,0,1)';
                g.fillRect(px, py, tile, tile);
                g.globalAlpha = 1;
            }

            // 타일 경계: 벽/바닥 구분을 위해 벽은 더 진하게
            g.globalAlpha = isWall ? 0.55 : 0.18;
            g.strokeStyle = 'rgba(0,0,0,1)';
            g.lineWidth = 1;
            g.strokeRect(px + 0.5, py + 0.5, tile - 1, tile - 1);
            g.globalAlpha = 1;
        }
    }

    // 아주 약한 비네팅(너무 부드럽지 않게 최소)
    g.globalAlpha = 0.18;
    g.fillStyle = 'rgba(0,0,0,1)';
    g.fillRect(0, 0, w, pad);
    g.fillRect(0, h - pad, w, pad);
    g.fillRect(0, 0, pad, h);
    g.fillRect(w - pad, 0, pad, h);
    g.globalAlpha = 1;

    chunk.mazeTex = c;
    return c;
}

function fxAddParticle(p) {
    state.fx.particles.push(p);
    // 모바일 최적화: 파티클 최대치를 PC 대비 30%로 축소
    const mult = (state.ui?.isMobile ? 0.3 : 1.0);
    const baseMax = CONFIG.FX_PARTICLE_MAX;
    const max = Math.max(20, Math.floor(baseMax * mult));
    if (state.fx.particles.length > max) {
        state.fx.particles.splice(0, state.fx.particles.length - max);
    }
}

function fxBurstMaze(x, y, opts = {}) {
    const {
        count = 18,
        color = 'rgba(255,255,255,0.9)',
        lifeMs = 450,
        speed = 4.5,
        size = 0.08,
        kind = 'dot', // 'dot' | 'spark'
        len = 0.7, // spark 꼬리 길이(셀 단위)
        dir = 0,
        cone = Math.PI * 2,
        drag = 0.98,
        glow = 18,
    } = opts;

    // 모바일 최적화: 파티클 발생량을 PC 대비 30%로 축소
    const mult = (state.ui?.isMobile ? 0.3 : 1.0);
    const effCount = Math.max(1, Math.round(count * mult));

    for (let i = 0; i < effCount; i++) {
        const a = dir + (rand(-0.5, 0.5) * cone);
        const sp = speed * rand(0.45, 1.0);
        fxAddParticle({
            x, y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            r: (size * CONFIG.FX_SCALE) * rand(0.6, 1.6),
            c: color,
            life: lifeMs * rand(0.6, 1.2),
            age: 0,
            drag,
            glow: glow * CONFIG.FX_SCALE,
            kind,
            len: (len * CONFIG.FX_SCALE) * rand(0.7, 1.2),
        });
    }
}

function addBloodSplatsMaze(x, y, opts = {}) {
    const {
        count = 10,
        spread = 1.2,
        rMin = 0.10,
        rMax = 0.42,
        alpha = 0.75,
        lifeMs = 90000,
    } = opts;
    if (!state.fx.bloodSplats) state.fx.bloodSplats = [];

    for (let i = 0; i < count; i++) {
        const ox = (Math.random() * 2 - 1) * spread;
        const oy = (Math.random() * 2 - 1) * spread;
        const r = rMin + Math.random() * (rMax - rMin);
        const rx = 0.6 + Math.random() * 1.0;
        const ry = 0.6 + Math.random() * 1.0;
        const rot = Math.random() * Math.PI * 2;
        const a = Math.max(0.15, Math.min(0.95, alpha * (0.6 + Math.random() * 0.7)));
        state.fx.bloodSplats.push({
            x: x + ox,
            y: y + oy,
            r,
            rx,
            ry,
            rot,
            a,
            bornMs: state.nowMs,
            lifeMs,
        });
    }

    // 과도한 누적 방지(모바일에서도 안전)
    const max = state.ui?.isMobile ? 80 : 160;
    if (state.fx.bloodSplats.length > max) {
        state.fx.bloodSplats.splice(0, state.fx.bloodSplats.length - max);
    }
}

function bossHitBloodFx(damage = 1) {
    // 튀는 피(파티클) + 바닥 혈흔(데칼)
    const dmg = Math.max(1, Number(damage || 1));
    const mult = Math.max(0.6, Math.min(2.2, dmg / 5));

    // 바닥에 낭자하게: 오래 남는 스플랫 (3배 증가)
    addBloodSplatsMaze(8.5, 8.5, {
        count: Math.round(24 * mult), // 8 -> 24 (3배)
        spread: 2.0, // 1.4 -> 2.0 (더 넓게)
        rMin: 0.12,
        rMax: 0.70, // 0.55 -> 0.70 (더 크게)
        alpha: 0.90, // 0.85 -> 0.90 (더 진하게)
        lifeMs: 120000,
    });

    // 즉시 튀는 피 파티클(짧게) (3배 증가)
    fxBurstMaze(8.5, 8.5, {
        kind: 'dot',
        count: Math.round(78 * mult), // 26 -> 78 (3배)
        color: 'rgba(170, 0, 0, 0.85)',
        lifeMs: 520,
        speed: 7.0,
        size: 0.06,
        drag: 0.90,
        glow: 8,
    });
    fxBurstMaze(8.5, 8.5, {
        kind: 'spark',
        count: Math.round(18 * mult),
        color: 'rgba(255, 40, 40, 0.75)',
        lifeMs: 420,
        speed: 11.0,
        size: 0.02,
        len: 1.8,
        drag: 0.84,
        glow: 18,
    });
}

function fxShake(amp) {
    state.fx.shake.amp = Math.max(state.fx.shake.amp, amp * CONFIG.FX_SCALE);
    state.fx.shake.t = rand(0, 1000);
}

function fxFlash(a, color = '#fff') {
    state.fx.flash.a = Math.min(1, state.fx.flash.a + a);
    state.fx.flash.color = color;
}

function onPickupFx(kind = 'coin') {
    // 플레이어 위치에서 획득 이펙트 + 노란 틴트
    const px = state.player.mazePos.x;
    const py = state.player.mazePos.y;
    let col;
    if (kind === 'missile') col = 'rgba(120, 255, 255, 0.95)';
    else if (kind === 'gunpowder') col = 'rgba(100, 100, 100, 0.95)';
    else col = 'rgba(255, 230, 120, 0.95)';

    fxBurstMaze(px, py, {
        kind: 'spark',
        count: (kind === 'missile' || kind === 'gunpowder') ? 16 : 12,
        color: col,
        lifeMs: 240,
        speed: 9.5,
        size: 0.030,
        len: 0.95,
        cone: Math.PI * 2,
        drag: 0.86,
        glow: 26,
    });
    fxBurstMaze(px, py, {
        kind: 'dot',
        count: (kind === 'missile' || kind === 'gunpowder') ? 10 : 8,
        color: kind === 'missile' ? 'rgba(60, 255, 240, 0.55)' : (kind === 'gunpowder' ? 'rgba(50, 50, 50, 0.55)' : 'rgba(255, 210, 77, 0.55)'),
        lifeMs: 520,
        speed: 4.0,
        size: 0.06,
        cone: Math.PI * 2,
        drag: 0.90,
        glow: 18,
    });
    fxFlash(0.06);

    // 틴트는 즉시 1로 올리고 서서히 감쇠(종류별 색)
    if (kind === 'missile') {
        state.fx.playerTint.r = 80;
        state.fx.playerTint.g = 255;
        state.fx.playerTint.b = 240;
    } else if (kind === 'gunpowder') {
        state.fx.playerTint.r = 60;
        state.fx.playerTint.g = 60;
        state.fx.playerTint.b = 60;
    } else {
        state.fx.playerTint.r = 255;
        state.fx.playerTint.g = 210;
        state.fx.playerTint.b = 77;
    }
    state.fx.playerTint.a = Math.max(state.fx.playerTint.a || 0, 1);
}

function wallKey(x, y) {
    return `${x},${y}`;
}

function getNormalWallValForCell(chunk, tx, ty) {
    // 특수 벽(금벽 등)이 한 번 부서진 뒤 재생될 때는 "일반 벽"으로 강등되도록
    // 현재 층(청크 y)의 일반 벽 분포를 따릅니다.
    const floor = (chunk?.y ?? 0) + 1;
    const dist = getWallLevelDistribution(floor);
    const rng = mulberry32(hashStringToUint(`regenWall:${chunk.x},${chunk.y},${tx},${ty}`));
    const level = rng() < dist.nextProb ? dist.nextLevel : dist.baseLevel;
    return (level + 1); // 일반 벽은 (레벨+1)
}

function hasGunpowderMarkOnWall(chunk, x, y, wallValue) {
    // 화약벽은 "타일 타입"이 아니라, 특정 벽 칸에 시각적/보상 특성을 부여하는 방식
    if (!(wallValue > 0) || wallValue === 100 || wallValue === 200) return false;
    if (!(state.abilities.missileGunpowderProb > 0)) return false;
    // 한 번 화약벽으로 부쉈던 칸은 이후 재생돼도 다시 화약벽으로 표시/보상되지 않음
    if (chunk?.gunpowderSpent?.has(wallKey(x, y))) return false;
    const wallRng = mulberry32(hashStringToUint(`gunpowder:${chunk.x},${chunk.y},${x},${y}`));
    return wallRng() < state.abilities.missileGunpowderProb;
}

function isBreakableWallTile(x, y) {
    // 청크를 감싸는 외곽(경계) 벽은 파괴 불가로 두어 청크 구조/출구 규칙이 무너지지 않게 함
    const size = CONFIG.MAZE_SIZE;
    const m = CONFIG.WALL_UNBREAKABLE_MARGIN ?? 1;
    if (x < m || y < m || x >= size - m || y >= size - m) return false;
    return true;
}

function applyWallRub(chunk, tx, ty, addMs) {
    if (!state.abilities.wallBreakUnlocked) return;
    if (!chunk || !chunk.maze) return;
    const size = CONFIG.MAZE_SIZE;
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) return;
    
    const wallVal = chunk.maze[ty][tx];
    if (wallVal <= 0) return; // 길이면 무시
    if (wallVal === 200) return; // 검정색 벽은 파괴 불가
    if (!isBreakableWallTile(tx, ty)) return;

    const getExtraDurMult = (lv) => {
        // 레벨: 0 갈색, 1 파랑, 2 녹색, 3 보라, 4 노랑, 5 주황, 6 빨강, 7 회색, 8 흰색, 9 검정
        if (lv >= 0 && lv <= 2) return state.abilities.wallDurabilityMultCommon ?? 1.0;
        if (lv >= 3 && lv <= 5) return state.abilities.wallDurabilityMultRare ?? 1.0;
        if (lv === 7 || lv === 8) return state.abilities.wallDurabilityMultEpic ?? 1.0;
        if (lv === 9) return state.abilities.wallDurabilityMultLegendary ?? 1.0;
        return 1.0; // 빨강(6) 등은 약화 대상 아님
    };

    // 벽 레벨에 따른 내구도 배수 적용 (+ 약화 배수)
    let baseDurability = 1;
    let extraDurMult = 1.0;
    if (wallVal === 100) {
        baseDurability = CONFIG.WALL_LEVELS[0].durability; // 사금벽은 기본 내구도(갈색 기반)
        extraDurMult = 1.0; // 특수벽은 약화 대상에서 제외
    } else {
        const lv = wallVal - 1;
        baseDurability = CONFIG.WALL_LEVELS[lv]?.durability || 1;
        extraDurMult = getExtraDurMult(lv);
    }
    const targetBreakMs = CONFIG.WALL_RUB_BREAK_MS * baseDurability * extraDurMult;

    const key = wallKey(tx, ty);
    const cur = chunk.wallHeat.get(key) || { heatMs: 0, lastMs: state.nowMs };
    // 누적 시간은 (벽부수기 속도 배수)를 적용해 더함
    cur.heatMs = Math.min(targetBreakMs * 1.2, cur.heatMs + addMs * state.abilities.wallBreakSpeedMult);
    cur.lastMs = state.nowMs;
    chunk.wallHeat.set(key, cur);

    // 연출을 위해 현재 프레임에서 가장 높은 마찰열을 추적
    if (cur.heatMs > state.fx.wallRubHeatMs) {
        state.fx.wallRubHeatMs = cur.heatMs;
        state.fx.wallRubTargetMs = targetBreakMs;
    }

    if (cur.heatMs >= targetBreakMs) {
        // 사금벽(코인 벽) 파괴 시 코인 획득
        if (wallVal === 100) {
            addCoins(state.abilities.coinWallCoinAmount ?? 5);
            onPickupFx('coin');
        }
        
        // 강화 화약(화약벽) 획득 체크
        // 화약벽은 1회 파괴 후엔 일반 벽으로 강등(재생돼도 다시 화약벽으로 표시/보상되지 않음)
        const hadGunpowder = hasGunpowderMarkOnWall(chunk, tx, ty, wallVal);
        if (hadGunpowder) {
            state.inventory.gunpowder = (state.inventory.gunpowder || 0) + 1;
            onPickupFx('gunpowder');
        }

        // 터져서 길이 됨
        const oldVal = chunk.maze[ty][tx];
        if (hadGunpowder) {
            if (!chunk.gunpowderSpent) chunk.gunpowderSpent = new Set();
            chunk.gunpowderSpent.add(key);
        }
        chunk.maze[ty][tx] = 0;
        chunk.wallHeat.delete(key);

        // 하트 드롭(필드 랜덤) 시도
        tryDropHeartInCurrentChunk();
        
        // 벽 재생 예약
        if (!chunk.brokenWalls) chunk.brokenWalls = new Map();
        // 금벽(코인벽)은 1회 파괴 후 재생 시 일반 벽으로 강등
        const regenVal = (oldVal === 100) ? getNormalWallValForCell(chunk, tx, ty) : oldVal;
        chunk.brokenWalls.set(key, { val: regenVal, time: state.nowMs });

        // 점수: 타일 파괴 시 +10 (층수 배수 적용)
        addScore(10, getFloor());
        // 텍스처 캐시 무효화(벽->바닥 반영)
        chunk.mazeTex = null;

        const cx = tx + 0.5;
        const cy = ty + 0.5;

        // 벽 색깔에 따른 파편 색상 결정
        const wallCol = CONFIG.WALL_LEVELS[(oldVal === 100 ? 0 : oldVal - 1)]?.color || [200, 245, 255];
        const sparkCol = `rgba(${wallCol[0]}, ${wallCol[1]}, ${wallCol[2]}, 0.95)`;

        // SFX: 벽 파괴 (두 가지 소리 중 무작위)
        const breakSfx = Math.random() < 0.5 ? 'resource/small-rock-break-194553.mp3' : 'resource/rock-break-hard-184891.mp3';
        playSfx(breakSfx, { volume: 0.70, rate: 1.0 });

        fxBurstMaze(cx, cy, {
            kind: 'spark',
            count: 26,
            color: sparkCol,
            lifeMs: 260,
            speed: 15.0,
            size: 0.028,
            len: 1.4,
            cone: Math.PI * 2,
            drag: 0.84,
            glow: 30,
        });
        fxBurstMaze(cx, cy, {
            kind: 'dot',
            count: 16,
            color: 'rgba(255, 80, 80, 0.45)',
            lifeMs: 520,
            speed: 4.0,
            size: 0.06,
            cone: Math.PI * 2,
            drag: 0.90,
            glow: 18,
        });
        fxFlash(0.18);
        fxShake(2.0);
    }
}

function addCoins(base) {
    const b = Math.max(0, Math.floor(base || 0));
    const bonus = Math.max(0, Math.floor(state.abilities?.coinGainBonus ?? 0));
    const gained = b + bonus;
    state.coins = (state.coins ?? 0) + gained;
    return gained;
}

// 음수 포함 코인 증감(대출/상환 등). coinGainBonus는 적용하지 않음.
function addCoinsSigned(delta) {
    const d = Number(delta || 0);
    if (!Number.isFinite(d) || d === 0) return 0;
    state.coins = (state.coins ?? 0) + d;
    return d;
}

function isPlayerInvincible() {
    return state.nowMs < (state.player.invincibleUntilMs || 0);
}

function tryConsumeShield() {
    const max = Math.max(0, Math.floor(state.abilities?.shieldMax ?? 0));
    if (max <= 0) return false;
    const cur = Math.max(0, Math.floor(state.player.shieldCharges ?? 0));
    if (cur <= 0) return false;
    state.player.shieldCharges = cur - 1;
    // 실드가 피격을 무효로 한 뒤 1초 무적
    state.player.invincibleUntilMs = state.nowMs + 1000;
    fxFlash(0.12, '#66ccff');
    fxShake(2.5);
    updateUI();
    return true;
}

function applyPlayerHit({ livesLoss = 1, canUseShield = true, flashA = 0.25, flashColor = '#ff0000', shake = 4.0, sfx = null } = {}) {
    if (isPlayerInvincible()) return { applied: false, blockedBy: 'invincible' };
    if (canUseShield && tryConsumeShield()) return { applied: false, blockedBy: 'shield' };
    state.player.lives = Math.max(0, (state.player.lives || 0) - livesLoss);
    // 데미지가 실제로 적용되었을 때 무적 시간 설정 (연속 피격 방지)
    state.player.invincibleUntilMs = state.nowMs + 1000; // 1초 무적
    fxFlash(flashA, flashColor);
    fxShake(shake);
    if (sfx) playSfx(sfx, { volume: 0.9 });
    updateUI();
    if (state.player.lives <= 0 && !state.ui.gameOverOpen) {
        openGameOverModal();
    }
    return { applied: true, blockedBy: null };
}

function refillShieldOnChunkChange(prevChunk, nextChunk) {
    if (prevChunk && prevChunk.x === nextChunk.x && prevChunk.y === nextChunk.y) return;
    const max = Math.max(0, Math.floor(state.abilities?.shieldMax ?? 0));
    if (max > 0) state.player.shieldCharges = max;
}

function applyWallRubToCollidingTiles(px, py, r, maze, chunk, addMs, txPos, tyPos) {
    const size = CONFIG.MAZE_SIZE;
    const xStart = Math.floor(Math.min(px, txPos) - r - 0.2);
    const xEnd = Math.ceil(Math.max(px, txPos) + r + 0.2);
    const yStart = Math.floor(Math.min(py, tyPos) - r - 0.2);
    const yEnd = Math.ceil(Math.max(py, tyPos) + r + 0.2);

    for (let ty = yStart; ty <= yEnd; ty++) {
        for (let tx = xStart; tx <= xEnd; tx++) {
            if (tx < 0 || tx >= size || ty < 0 || ty >= size) continue;
            if (maze[ty][tx] <= 0) continue;
            if (!isBreakableWallTile(tx, ty)) continue;

            // 목표 위치(txPos, tyPos)에서 타일과의 거리 계산
            const closestX = clamp(txPos, tx, tx + 1);
            const closestY = clamp(tyPos, ty, ty + 1);
            const dx = txPos - closestX;
            const dy = tyPos - closestY;
            
            // 충돌 반경보다 약간 큰 범위(0.12) 내에 있으면 마찰열 적용
            if (dx * dx + dy * dy < (r + 0.12) * (r + 0.12)) {
                applyWallRub(chunk, tx, ty, addMs);
            }
        }
    }
}

function pickWallTileFromContact(chunk, sx, sy, nx, ny) {
    // 마찰점 주변(이동 방향 포함)에서 실제 벽 타일을 안정적으로 찾는다.
    // sx,sy: 마찰점(셀 좌표), nx,ny: 충돌 노말 방향(이동 방향 쪽: -1/0/1)
    if (!chunk?.maze) return null;
    const size = CONFIG.MAZE_SIZE;
    const inRange = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
    const fx = Math.floor(sx);
    const fy = Math.floor(sy);
    const eps = 0.12;

    const candidates = [
        [fx, fy],
        [Math.floor(sx + nx * eps), Math.floor(sy + ny * eps)],
        [fx + nx, fy + ny],
        [fx + nx, fy],
        [fx, fy + ny],
    ];

    const seen = new Set();
    for (const [tx, ty] of candidates) {
        const k = `${tx},${ty}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (!inRange(tx, ty)) continue;
        if (chunk.maze[ty][tx] <= 0) continue;
        if (!isBreakableWallTile(tx, ty)) continue;
        return { tx, ty };
    }
    return null;
}

function decayWallHeat(chunk, dt) {
    if (!chunk?.wallHeat?.size) return;
    const dec = CONFIG.WALL_RUB_DECAY_PER_SEC * (Math.min(dt, 80) / 1000) * 1000;
    for (const [k, v] of chunk.wallHeat.entries()) {
        // 최근에 문댄 타일은 decay하지 않음(같은 프레임에서 갱신됨)
        const idleMs = state.nowMs - (v.lastMs || 0);
        if (idleMs < 120) continue;
        v.heatMs = Math.max(0, v.heatMs - dec);
        if (v.heatMs <= 0) chunk.wallHeat.delete(k);
        else chunk.wallHeat.set(k, v);
    }
}

// --- 미로 생성 및 청크 ---
class Chunk {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.cleared = false;
        this.maze = this.generateMaze();
        this.mazeTex = null; // 청크별 미로 지형 텍스처 캐시
        // 벽 타일 "열(문댄 시간)" 누적: key "x,y" -> { heatMs, lastMs }
        this.wallHeat = new Map();
        // 코인(복사 방지): 청크마다 0~3개를 1회 스폰하고, 먹은 코인은 다시 생기지 않음
        this.coins = this.generateCoins(); // [{x,y,picked}]
    }

    generateCoins() {
        const rng = mulberry32(hashStringToUint(`coins:${this.x},${this.y}`));
        const bonus = Math.max(0, Math.min(3.0, state.abilities?.coinFieldSpawnBonus ?? 0));
        const mult = 1 + bonus; // 최대 x4.0
        const maxCoins = Math.max(3, Math.floor(3 * mult)); // "최대 코인 개수도 확률만큼 증가"
        const count = Math.min(maxCoins, Math.floor(rng() * 4 * mult)); // 기본 0~3에서 기대/최대 증가
        const size = CONFIG.MAZE_SIZE;
        const coins = [];
        for (let i = 0; i < count; i++) {
            for (let t = 0; t < 250; t++) {
                const x = Math.floor(rng() * size);
                const y = Math.floor(rng() * size);
                if (this.maze[y]?.[x] !== 0) continue;
                if (x <= 1 || x >= size - 2 || y <= 1 || y >= size - 2) continue;
                const px = x + 0.5;
                const py = y + 0.5;
                if (coins.some(c => (c.x - px) ** 2 + (c.y - py) ** 2 < 0.8 ** 2)) continue;
                coins.push({ x: px, y: py, picked: false });
                break;
            }
        }
        return coins;
    }

    generateMaze() {
        const size = CONFIG.MAZE_SIZE;
        const mid = Math.floor(size / 2); // 중앙 좌표
        const floor = this.y + 1;
        const dist = getWallLevelDistribution(floor);
        const rng = mulberry32(hashStringToUint(`mazeProb:${this.x},${this.y}`));
        const isBossFloor = floor > 0 && floor % 20 === 0;

        let grid = Array(size).fill().map(() => Array(size).fill(1));

        if (isBossFloor) {
            // 보스방: 기하학적 형태의 벽 (가운데 큰 공간 + 주변 구조물)
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    grid[y][x] = 0; // 일단 비움
                    // 외곽 벽
                    if (x === 0 || x === size - 1 || y === 0 || y === size - 1) {
                        grid[y][x] = 1;
                    }
                    // 중앙 십자형 구조물 (mid 변수 확실히 사용)
                    if (Math.abs(x - mid) < 2 && Math.abs(y - mid) < 2) continue; // 중앙 비움
                    // 남쪽(하단)에는 구조물을 두지 않도록: 상단(y < 4)쪽에만 세로 구조물 배치
                    if ((x === mid || x === mid-1 || x === mid+1) && (y < 4)) grid[y][x] = 1;
                    if ((y === mid || y === mid-1 || y === mid+1) && (x < 4 || x > size - 5)) grid[y][x] = 1;
                    
                    // 4개의 모서리 블록
                    // 남쪽 모서리 블록(y === size-5)은 제거하고, 북쪽(y === 4)만 유지
                    if ((x === 4 || x === size - 5) && (y === 4)) grid[y][x] = 1;
                }
            }

            // 남쪽(하단) 내부는 완전히 비우기: 경계(0/size-1)는 유지하고 내부만 클리어
            for (let y = Math.max(1, size - 4); y <= size - 2; y++) {
                for (let x = 1; x <= size - 2; x++) {
                    grid[y][x] = 0;
                }
            }
        } else {
            // Recursive Backtracking
            this.carve(grid, mid, mid);
        }

        // ... (나머지 로직은 그대로)
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (grid[y][x] === 1) {
                    if (x === 0 || x === size - 1 || y === 0 || y === size - 1) {
                        grid[y][x] = 200;
                        continue;
                    }
                    if (state.abilities.goldWallUnlocked && rng() < state.abilities.goldWallProb) {
                        grid[y][x] = 100;
                    } else {
                        const level = rng() < dist.nextProb ? dist.nextLevel : dist.baseLevel;
                        grid[y][x] = level + 1;
                    }
                }
            }
        }

        const exits = [
            { x: mid, y: 0, dir: 'N' },
            { x: mid, y: size - 1, dir: 'S' },
            { x: 0, y: mid, dir: 'W' },
            { x: size - 1, y: mid, dir: 'E' }
        ].filter(exit => {
            if (isBossFloor && (exit.dir === 'W' || exit.dir === 'E')) return false;
            if (exit.dir === 'W' && this.x === 0) return false;
            if (exit.dir === 'E' && this.x === CONFIG.CHUNK_COLS - 1) return false;
            if (exit.dir === 'S' && this.y === 0 && !(this.x === CONFIG.START_CHUNK_X && this.y === CONFIG.START_CHUNK_Y)) return false;
            return true;
        });

        exits.forEach(exit => {
            grid[exit.y][exit.x] = 0;
            if (exit.y === 0) grid[1][exit.x] = 0;
            if (exit.y === size - 1) grid[size - 2][exit.x] = 0;
            if (exit.x === 0) grid[exit.y][1] = 0;
            if (exit.x === size - 1) grid[exit.y][size - 2] = 0;
        });

        return grid;
    }

    carve(grid, x, y) {
        grid[y][x] = 0;
        const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5);
        
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx > 0 && nx < CONFIG.MAZE_SIZE - 1 && ny > 0 && ny < CONFIG.MAZE_SIZE - 1 && grid[ny][nx] === 1) {
                grid[y + dy/2][x + dx/2] = 0;
                this.carve(grid, nx, ny);
            }
        }
    }
}

// --- 초기화 ---
function detectIsMobile() {
    // “모바일”을 터치/조작 방식 관점(coarse pointer)으로 판단
    try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) return true;
    } catch (_) {}
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function init() {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    // 메인 화면에서 디바이스 판별 후, 입력/UI를 분기
    state.ui.isMobile = detectIsMobile();
    loadControlPrefs();

    if (state.ui.isMobile) {
        // 모바일: 드래그(조작) + 탭(월드맵 진입) 을 위해 pointer 사용
        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
        window.addEventListener('pointerup', handlePointerUp, { passive: false });
    } else {
        // PC: 기존처럼 클릭으로 월드맵 진입
    canvas.addEventListener('click', handleClick);
    }
    initHudUI();
    initAbilityModalUI();
    initSettingsModalUI();
    initTitleScreenUI();
    initGameOverUI();

    // 디버그 모드 설정
    if (CONFIG.DEBUG) {
        state.abilities.wallBreakUnlocked = true;
        state.abilities.wallBreakSpeedMult = CONFIG.MAX_WALL_BREAK_SPEED_MULT;
        state.abilities.moveSpeedMult = CONFIG.MAX_MOVE_SPEED_MULT;
        state.coins = 1000;
        state.inventory.missiles = 1000;
        console.log("DEBUG MODE ENABLED: Wall break active, Max speed, Max move speed, 1000 coins, 1000 missiles.");
    }

    // 개발자도구 console에서 debugmode 777 입력 시 디버그 모드 활성화
    window.debugmode = function(code) {
        if (code === 777) {
            CONFIG.DEBUG = true;
            state.abilities.wallBreakUnlocked = true;
            state.abilities.wallBreakSpeedMult = CONFIG.MAX_WALL_BREAK_SPEED_MULT;
            state.abilities.moveSpeedMult = CONFIG.MAX_MOVE_SPEED_MULT;
            state.coins = 1000;
            state.inventory.missiles = 1000;
            console.log("DEBUG MODE ENABLED via console: Wall break active, Max speed, Max move speed, 1000 coins, 1000 missiles.");
            if (typeof updateUI === 'function') updateUI();
            return "Debug mode activated!";
        }
        return "Invalid code. Use: debugmode(777)";
    };

    generateVisibleChunks();
    state.cameraY = state.player.worldPos.y * CONFIG.CHUNK_SIZE - state.view.h * 0.7;
    // 이미지 프리로드(실패해도 게임은 진행 가능: 폴백 렌더)
    preloadGameImages().catch(() => {});
    
    requestAnimationFrame(gameLoop);
}

function loadControlPrefs() {
    try {
        const savedMode = localStorage.getItem('maze_mobile_mode');
        if (savedMode === 'touch' || savedMode === 'gyro') {
            state.controls.mobileMode = savedMode;
}
        const nb = Number(localStorage.getItem('maze_gyro_neutral_beta'));
        const ng = Number(localStorage.getItem('maze_gyro_neutral_gamma'));
        if (Number.isFinite(nb) && Number.isFinite(ng)) {
            state.controls.gyro.neutralBeta = nb;
            state.controls.gyro.neutralGamma = ng;
            state.controls.gyro.hasNeutral = true;
        }
    } catch (_) {}
}

function saveControlPrefs() {
    try {
        localStorage.setItem('maze_mobile_mode', state.controls.mobileMode);
        if (state.controls.gyro.hasNeutral) {
            localStorage.setItem('maze_gyro_neutral_beta', String(state.controls.gyro.neutralBeta));
            localStorage.setItem('maze_gyro_neutral_gamma', String(state.controls.gyro.neutralGamma));
}
    } catch (_) {}
}

async function enableGyroControls() {
    // 지원 여부 체크 + (iOS) 권한 요청
    if (typeof DeviceOrientationEvent === 'undefined') {
        throw new Error('이 기기는 자이로(DeviceOrientation)를 지원하지 않습니다.');
    }
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') throw new Error('자이로 권한이 거부되었습니다.');
    }

    const g = state.controls.gyro;
    if (!g.listenerAttached) {
        window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
        g.listenerAttached = true;
    }
    g.enabled = true;

    // 첫 활성화인데 캘리브레이션 값이 없으면 현재 값으로 중립값 설정
    if (!g.hasNeutral) {
        g.neutralBeta = g.beta || 0;
        g.neutralGamma = g.gamma || 0;
        g.hasNeutral = true;
    }
    saveControlPrefs();
            }

function disableGyroControls() {
    state.controls.gyro.enabled = false;
    saveControlPrefs();
}

function calibrateGyroNeutral() {
    const g = state.controls.gyro;
    g.neutralBeta = g.beta || 0;
    g.neutralGamma = g.gamma || 0;
    g.hasNeutral = true;
    saveControlPrefs();
}

function onDeviceOrientation(e) {
    const g = state.controls.gyro;
    if (!g) return;
    // UI에서 "센서 이벤트가 실제로 들어오는지" 판단할 수 있도록 메타 기록
    g._eventCount = (g._eventCount || 0) + 1;
    g._lastEventTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // 숫자만 반영(브라우저에 따라 null 가능)
    if (typeof e.alpha === 'number') g.alpha = e.alpha;
    if (typeof e.beta === 'number') g.beta = e.beta;
    if (typeof e.gamma === 'number') g.gamma = e.gamma;
}

function initHudUI() {
    const hud = document.getElementById('hud');
    const settingsBtn = document.getElementById('hud-settings');
    const missileBtn = document.getElementById('hud-missile');
    if (hud) {
        hud.classList.add('hidden');
        hud.setAttribute('aria-hidden', 'true');
    }
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            unlockAudioOnce();
            toggleSettingsModal();
            updateUI();
        });
    }
    if (missileBtn) {
        missileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            unlockAudioOnce();
            tryFireMissileFromInventory();
        });
        }
}

function initTitleScreenUI() {
    const el = document.getElementById('title-screen');
    const btn = document.getElementById('title-start');
    const settingsBtn = document.getElementById('title-settings');
    if (!el) return;

    // 초기엔 타이틀 화면 표시
    el.classList.remove('hidden');
    state.ui.started = false;

    const start = async () => {
        if (state.ui.started) return;
        // 이미지가 반영되지 않는 문제 방지: 시작 전에 프리로드를 1회 기다림
        if (btn) {
            btn.disabled = true;
            const oldText = btn.textContent;
            btn.textContent = '로딩중...';
            const ok = await preloadGameImages();
            // 실패해도 폴백 렌더(원/벡터)로 진행 가능
            btn.disabled = false;
            btn.textContent = oldText || '시작';
            if (!ok && GAME_IMG_ERROR) {
                console.warn('[assets] continue with fallback:', GAME_IMG_ERROR);
            }
        }
        state.ui.started = true;
        el.classList.add('hidden');
        // 런 시작 시간/최고 층 초기화
        state.ui.runStartMs = state.nowMs;
        state.ui.maxFloorReached = Math.max(1, getFloor());
        state.ui.bossKills = Math.max(0, Math.floor(state.ui.bossKills ?? 0));
        closeGameOverModal();
            updateUI();
        // 첫 입력 이후 BGM 시작
        playNextBgmTrack();
    };

    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); start(); });
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            unlockAudioOnce();
            openSettingsModal();
        });
    }
}

// 게임 다시하기: 페이지 새로고침 없이 런만 초기화(로그인 세션 유지)
function restartRun() {
    // 모달/효과 정리
    try { if (typeof closeGameOverModal === 'function') closeGameOverModal(); } catch (_) {}
    try { if (typeof closeSettingsModal === 'function') closeSettingsModal(); } catch (_) {}
    try { if (typeof setWallRubContact === 'function') setWallRubContact(false, 0); } catch (_) {}

    // 필수 상태 초기화(로그인/설정/오디오/조작 모드는 유지)
    state.mode = 'WORLD';
    state.currentChunk = { x: CONFIG.START_CHUNK_X, y: CONFIG.START_CHUNK_Y };
    state.player.worldPos = { x: CONFIG.START_CHUNK_X, y: CONFIG.START_CHUNK_Y };
    state.player.mazePos = { x: 8.5, y: 16.5 };
    state.player.invincibleUntilMs = 0;
    state.player.shieldCharges = 0;

    // 어빌리티/인벤/점수/아이템 초기화
    state.abilities = {
        wallBreakUnlocked: false,
        wallBreakSpeedMult: 1.0,
        missileSpawnChanceMult: 1.0,
        missileFieldSpawnBonus: 0,
        maxFieldMissileItems: 1,
        missileFieldSpawnUnlocked: false,
        missileStunBonusMs: 0,
        missileCount: 1,
        moveSpeedMult: 1.0,
        coinFieldSpawnBonus: 0,
        heartDropChance: 0,
        goldWallUnlocked: false,
        goldWallProb: 0.03,
        coinWallCoinAmount: 5,
        coinGainBonus: 0,
        wallDurabilityMultCommon: 1.0,
        wallDurabilityMultRare: 1.0,
        wallDurabilityMultEpic: 1.0,
        wallDurabilityMultLegendary: 1.0,
        missileWallBreakUnlocked: false,
        missileWallBreakProb: 0.10,
        missileGunpowderProb: 0,
        shopSlots: 3,
        talismanCount: 0,
        killMissileUnlocked: false,
        maxLives: 3,
        shieldMax: 0,
        // 금융 어빌리티
        bankDeposit: { enabled: false, intervalMs: 10000, timerMs: 0 },
        bankSaving: { enabled: false, targetFloors: 5, progress: 0 },
        livingLoan: { debt: 0, graceFloors: 0, repayAccMs: 0, penaltyAccMs: 0, penaltyRate: 0 },
        freeRerollTickets: 0,
        freeRerollRestoreCost: 1,
        boughtCountByRarity: { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 },
        rarityBonus: { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 },
    };
    state.player.lives = state.abilities.maxLives;

    state.inventory = { missiles: 0, gunpowder: 0 };
    state.items = [];
    state.hearts = [];
    state.coins = 0;
    state.score = 0;
    state.missiles = [];
    state.pendingMissileShots = [];
    state.chaserProjectiles = [];

    // FX 초기화(모바일 최적화 유지)
    state.fx = {
        particles: [],
        bloodSplats: [],
        shake: { amp: 0, t: 0 },
        flash: { a: 0, color: '#fff' },
        lastTrailMs: 0,
        playerTint: { a: 0, r: 255, g: 210, b: 77 },
        wallRubHeatMs: 0,
        wallRubTargetMs: 5000,
    };

    // 추격자/보스 초기화
    state.boss = { active: false, hp: 0, maxHp: 50, lastAttackMs: 0, lasers: [], gridPatterns: [], missileSpawnMs: 0 };
    state.chaser = {
        active: false,
        chunk: { x: CONFIG.START_CHUNK_X, y: CONFIG.START_CHUNK_Y },
        pos: { x: 0.5, y: 0.5 },
        path: [],
        pathIndex: 0,
        lastRepathMs: 0,
        lastTargetTile: null,
        graceUntilMs: 0,
        stunUntilMs: 0,
        lastShotMs: 0,
        entryScheduledUntilMs: 0,
        entryScheduledDir: 'S',
        entryScheduledPos: null,
        isPresentInMaze: false,
        nextEntryDelayMs: CONFIG.CHASER_ENTRY_DELAY_MS,
        caughtCount: 0,
        speedMult: 1.0,
        slowUntilMs: 0,
        deadUntilNextChunk: false,
        respawnTimerMs: 0,
        bossCooldownUntilMs: 0,
        hp: CONFIG.MISSILE_DAMAGE * 5,
        maxHp: CONFIG.MISSILE_DAMAGE * 5,
    };

    // 청크/카메라/입구 초기화
    state.chunks = new Map();
    state.nextEntryDir = 'S';
    state.currentEntryDir = 'S';
    state.cameraY = state.player.worldPos.y * CONFIG.CHUNK_SIZE - state.view.h * 0.7;
    generateVisibleChunks();

    // UI 초기화(로그인 UI는 그대로)
    state.ui.modalOpen = false;
    state.ui.settingsOpen = false;
    state.ui.gameOverOpen = false;
    state.ui.pendingEnter = null;
    state.ui.abilityNotice = '';
    state.ui.abilityShownFloors = new Set();
    state.ui.abilityChoices = [];
    state.ui.boughtAbilities = new Set();
    state.ui.abilityRerollCost = 1;
    state.ui.freeRerollsLeft = 0;
    state.ui.freeRerollRestoreCost = 1;
    state.ui.runStartMs = state.nowMs;
    state.ui.maxFloorReached = 1;
    state.ui.bossKills = 0;
    state.ui.scoreDisplayY = 30;
    state.ui.lastScore = 0;

            updateUI();
}

// 외부(UI)에서도 호출할 수 있게 노출
window.restartRun = restartRun;

// 게임오버 후 메인(타이틀) 화면으로 복귀: 세션 유지 + 새로고침 없이 런만 초기화
function goToTitleScreen() {
    // 런 상태 리셋(세션/설정 유지)
    restartRun();
    // 타이틀 표시
    const title = document.getElementById('title-screen');
    if (title) title.classList.remove('hidden');
    state.ui.started = false;
    // 리더보드 갱신(로그인 세션은 유지)
    try { if (typeof window.leaderboardRefresh === 'function') window.leaderboardRefresh(); } catch (_) {}
}

window.goToTitleScreen = goToTitleScreen;

// 어빌리티(상점) UI는 `ui_ability.js`로 분리되었습니다.

function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    state.view.w = w;
    state.view.h = h;
    state.view.dpr = dpr;

    // CSS 크기(논리 픽셀)
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // 실제 렌더링 버퍼(물리 픽셀)
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    // 이후 드로잉 좌표계를 "논리 픽셀" 기준으로 맞춤
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
}

function generateVisibleChunks() {
    const viewDist = 5;
    // 시작 지점(2,0) 아래(음수 y)로는 필요 없으므로 생성 금지
    const startY = Math.max(0, state.player.worldPos.y - viewDist);
    const endY = state.player.worldPos.y + viewDist;

    // 메모리 누수 방지: 보이지 않는 청크 제거
    const keepDist = viewDist + 2; // 보이는 거리보다 조금 더 유지
    const keepStartY = Math.max(0, state.player.worldPos.y - keepDist);
    const keepEndY = state.player.worldPos.y + keepDist;
    
    // 오래된 청크 제거 (메모리 누수 방지)
    if (state.chunks.size > 100) { // 청크가 너무 많아지면 정리
        for (const [key, chunk] of state.chunks.entries()) {
            if (chunk.y < keepStartY || chunk.y > keepEndY) {
                state.chunks.delete(key);
            }
        }
    }

    for (let y = startY; y <= endY; y++) {
        for (let x = 0; x < CONFIG.CHUNK_COLS; x++) {
            const key = getChunkKey(x, y);
            if (!state.chunks.has(key)) {
                state.chunks.set(key, new Chunk(x, y));
            }
        }
    }
}

// --- 입력 처리 ---
function handleKeyDown(e) {
    // 오디오 언락(브라우저 자동재생 정책 대응)
    unlockAudioOnce();

    // 타이틀 화면 중엔 게임 입력 차단(첫 입력은 타이틀 리스너에서 처리)
    if (!state.ui.started) return;

    // 게임 오버 중에는 재시작 입력만 받음
    if (state.ui.gameOverOpen) {
        const k = (e.key || '').toLowerCase();
        if (k === 'enter' || k === 'r') {
            e.preventDefault();
            if (typeof window.goToTitleScreen === 'function') window.goToTitleScreen();
            else window.location.reload();
        }
        return;
    }

    // ESC: 설정창 토글(항상 우선 처리)
    if (e.key === 'Escape') {
        e.preventDefault();
        toggleSettingsModal();
        return;
    }

    // 설정창이 열려있으면 게임 입력 차단
    if (state.ui.settingsOpen) return;
    if (state.ui.modalOpen) {
        // 모달이 열려있으면 게임 입력 차단
        return;
    }
    // 미사일 발사
    if (e.key.toLowerCase() === 'x') {
        // 키를 누르고 있는 동안 반복 발사되는 것 방지
        if (e.repeat) return;
        tryFireMissileFromInventory();
    }
}

function tryFireMissileFromInventory() {
    if (state.mode !== 'MAZE') return;
    if (state.inventory.missiles <= 0) return;
    if (!state.chaser.active) return;
    state.inventory.missiles -= 1;

    // SFX: 미사일 발사(키 입력 기준으로 1회만)
    playSfx('resource/missile-launch.mp3', { volume: 0.75, rate: 1.0 });

    fireMissile();
    updateUI();
}

function handleKeyUp(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        return;
    }
    if (state.ui.settingsOpen) return;
    if (state.ui.modalOpen) {
        return;
    }
}

function handleMouseMove(e) {
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
}

function handlePointerDown(e) {
    // 오디오 언락(브라우저 자동재생 정책 대응)
    unlockAudioOnce();
    // 모바일에서만 스크롤/줌 제스처로 캔버스 입력이 씹히는 것 방지
    if (state.ui.isMobile) {
        try { e.preventDefault(); } catch (_) {}
    }

    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;

    state.input.pointerDown = true;
    state.input.pointerId = e.pointerId;
    state.input.startX = e.clientX;
    state.input.startY = e.clientY;
    state.input.startMs = performance.now();
    state.input.moved = false;
}

function handlePointerMove(e) {
    // IMPORTANT:
    // 모바일에서 window-level pointermove에서 preventDefault를 걸어버리면
    // 설정 UI(셀렉트/슬라이더 등)까지 기본 동작이 막힐 수 있음.
    // -> 캔버스 위(=게임 조작)에서만 처리하고, UI 상호작용은 그대로 둔다.
    const onCanvas = (e.target === canvas);
    if (!onCanvas && !state.input.pointerDown) return;
    if (!state.ui.started) return;
    if (state.ui.settingsOpen || state.ui.modalOpen || state.ui.gameOverOpen) return;

    // 터치에서도 마우스 좌표 업데이트(모바일 조작 핵심)
    if (state.ui.isMobile && onCanvas && e.cancelable) {
        // 화면 스크롤 방지(게임 조작 우선)
        try { e.preventDefault(); } catch (_) {}
    }
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;

    // 드래그(조작) 중이면 탭(발사)로 인식하지 않도록 이동량 체크
    if (!state.input.pointerDown) return;
    if (state.input.pointerId != null && e.pointerId !== state.input.pointerId) return;
    const dx = e.clientX - state.input.startX;
    const dy = e.clientY - state.input.startY;
    if ((dx * dx + dy * dy) > (12 * 12)) state.input.moved = true;
}

function handlePointerUp(e) {
    if (!state.input.pointerDown) return;
    if (state.input.pointerId != null && e.pointerId !== state.input.pointerId) return;

    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;

    const dt = performance.now() - (state.input.startMs || 0);
    const dx = e.clientX - state.input.startX;
    const dy = e.clientY - state.input.startY;
    const dist2 = dx * dx + dy * dy;

    state.input.pointerDown = false;
    state.input.pointerId = null;

    // 짧은 탭만 "클릭"으로 인정(드래그 조작 중 미사일 오발 방지)
    const isTap = !state.input.moved && dist2 <= (12 * 12) && dt <= 250;
    if (!isTap) return;

    // 모바일: 미로에서는 탭=미사일 발사, 월드맵에서는 탭=청크 재진입
    if (state.mode === 'MAZE') {
        tryFireMissileFromInventory();
        return;
    }
    handleClick(e);
}

function handleClick(e) {
    // 오디오 언락(브라우저 자동재생 정책 대응)
    unlockAudioOnce();
    if (!state.ui.started) return;
    if (state.ui.gameOverOpen) return;
    if (state.ui.settingsOpen || state.ui.modalOpen) return;
    if (state.mode === 'WORLD') {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const offsetX = state.view.w / 2 - (CONFIG.CHUNK_COLS * CONFIG.CHUNK_SIZE) / 2;
        
        const worldX = Math.floor((mx - offsetX) / CONFIG.CHUNK_SIZE);
        // drawWorld의 screenY 수식 역산: 
        // screenY = viewH - (worldY * size - cameraY + size)
        // worldY = (viewH - screenY + cameraY) / size - 1
        const worldY = Math.ceil((state.view.h - my + state.cameraY) / CONFIG.CHUNK_SIZE) - 1;

        if (worldX < 0 || worldX >= CONFIG.CHUNK_COLS) return;
        if (worldY < 0) return;

        // 다른 청크 선택 금지: 오로지 "말판이 현재 위치한 청크"만 재진입 가능
        const curX = Math.round(state.player.worldPos.x);
        const curY = Math.round(state.player.worldPos.y);
        if (worldX !== curX || worldY !== curY) return;

        enterMaze(worldX, worldY);
    }
}

function updateUI() {
    const statusEl = document.getElementById('status');
    if (!statusEl) return; // 좌상단 범례(UI 오버레이)를 제거한 경우
    if (state.mode === 'WORLD') {
        statusEl.innerHTML = `상태: 월드 맵`;
    } else {
        const chaserOn = state.chaser.active ? '<span style="color:#ff5555;">ON</span>' : '<span style="color:#888;">OFF</span>';
        const inbound = (state.chaser.active && !state.chaser.isPresentInMaze) ? ' · <span style="color:#9ad1ff;">INBOUND</span>' : '';
        const stunned = (state.chaser.active && state.nowMs < state.chaser.stunUntilMs) ? ' · <span style="color:#ffd24d;">STUN</span>' : '';
        const speed = state.chaser.active ? (CONFIG.CHASER_SPEED * state.chaser.speedMult).toFixed(2) : '-';
        statusEl.innerHTML =
            `상태: 미로 (${state.currentChunk.x}, ${state.currentChunk.y})` +
            `<br/>추격자: ${chaserOn}${inbound}${stunned} · 속도: ${speed} · 잡힘: ${state.chaser.caughtCount}` +
            `<br/>인벤토리: 미사일 <span style="color:#ffd24d;">${state.inventory.missiles}</span> (X로 발사)`;
    }

    // HUD 버튼 표시/상태
    const hud = document.getElementById('hud');
    const missileBtn = document.getElementById('hud-missile');
    const settingsBtn = document.getElementById('hud-settings');
    const hudVisible = !!state.ui.started && !state.ui.gameOverOpen && !!state.ui.isMobile;
    if (hud) {
        hud.classList.toggle('hidden', !hudVisible);
        hud.setAttribute('aria-hidden', hudVisible ? 'false' : 'true');
    }

    // 설정 버튼은 모바일에서 시작 후 항상 표시(모달이 열려있어도 무방)
    if (settingsBtn) {
        settingsBtn.classList.toggle('hidden', !hudVisible);
    }

    // 미사일 버튼은 미로에서만 표시
    if (missileBtn) {
        const show = hudVisible && state.mode === 'MAZE';
        missileBtn.classList.toggle('hidden', !show);
        missileBtn.textContent = `미사일 발사 (${state.inventory.missiles})`;
        const canFire =
            show &&
            state.inventory.missiles > 0 &&
            state.chaser.active &&
            !state.ui.settingsOpen &&
            !state.ui.modalOpen;
        missileBtn.disabled = !canFire;
    }
}

function enterMaze(x, y, entryDir = state.nextEntryDir || 'S') {
    state.mode = 'MAZE';
    const prevChunk = state.currentChunk;
    state.currentChunk = { x, y };
    // 중요: 월드 좌표도 항상 동기화 (층수/보스 플로어 판정/이동 계산이 worldPos를 사용함)
    state.player.worldPos.x = x;
    state.player.worldPos.y = y;
    state.currentEntryDir = entryDir;
    // 입장 방향에 따라 스폰 위치(한 칸 안쪽) 결정
    state.player.mazePos = getSpawnPosForEntry(entryDir);
    state.nextEntryDir = 'S'; // 기본값으로 되돌림(다음은 보통 남쪽에서 시작)

    // 최고 층 기록
    state.ui.maxFloorReached = Math.max(1, Math.floor(state.ui.maxFloorReached ?? 1), y + 1);

    // 층수 증가(북쪽으로 이동) 시 금융/대출 카운트 반영
    if (prevChunk && Number.isFinite(prevChunk.y) && y > prevChunk.y) {
        onFloorPassed();
    }

    // 청크(맵) 전환 시 남아있는 투사체/예약발사 정리
    // - 적 투사체(state.chaserProjectiles)가 다음 맵까지 남아있는 버그 방지
    // - 플레이어 미사일/예약 발사도 좌표계가 바뀌므로 같이 정리
    state.chaserProjectiles = [];
    state.missiles = [];
    state.pendingMissileShots = [];
    // 보스 패턴(레이저, 격자 장판)도 맵 전환 시 초기화
    state.boss.lasers = [];
    state.boss.gridPatterns = [];
    // 보스 혈흔은 청크(맵) 이동 시 정리
    if (state.fx?.bloodSplats) state.fx.bloodSplats = [];

    // 추격자 부활 로직 (살상 미사일에 의해 파괴된 경우)
    if (state.chaser.active && state.chaser.deadUntilNextChunk) {
        state.chaser.deadUntilNextChunk = false;
        state.chaser.isPresentInMaze = false;
        // 다음 맵 진입 2초 후 부활 예약
        state.chaser.entryScheduledUntilMs = state.nowMs + 2000;
        state.chaser.respawnTimerMs = 3000; // 부활 전 3초 점멸 예고
        state.chaser.entryScheduledDir = 'RANDOM'; // 방향을 RANDOM으로 명시
        
        // 무작위 위치 스폰 (가장자리 제외)
        const chunk = state.chunks.get(getChunkKey(x, y));
        if (chunk) {
            const fixed = randomOpenCellInMaze(chunk.maze, `chaserRespawn:${x},${y},${state.nowMs}`);
            if (fixed) {
                state.chaser.entryScheduledPos = { x: fixed.x + 0.5, y: fixed.y + 0.5 };
            }
        }
    }

    // 추격자 규칙:
    // - 시작부터 나오지 않음
    // - 3번째 행(y=2)에 처음 도달했을 때 랜덤 위치에서 최초 스폰
    // - 그 이후부터는 청크를 넘어 계속 따라오며, 입구로 "진입" 연출
    if (state.currentChunk.y >= CONFIG.CHASER_START_ROW_Y) {
        if (!state.chaser.active) {
            initChaserFirstTimeRandomInThisChunk();
        } else {
            // 이미 활성화된 상태라면, 부활 예약('RANDOM')이 아닌 경우에만 입구 진입 예약
            if (state.chaser.entryScheduledDir !== 'RANDOM') {
                scheduleChaserEntryIntoPlayerChunk(entryDir);
            }
        }
    }
    // 청크를 넘어오면 이전 청크의 아이템은 유지되지 않도록(벽에 박히는 문제 방지)
    state.items = [];
    state.hearts = [];
    spawnItemForChunkIfNeeded();
    refillShieldOnChunkChange(prevChunk, state.currentChunk);
    updateUI();
}

function randomOpenCellInMaze(maze, seedStr) {
    const size = CONFIG.MAZE_SIZE;
    const rng = mulberry32(hashStringToUint(seedStr));
    for (let i = 0; i < 500; i++) {
        const x = Math.floor(rng() * size);
        const y = Math.floor(rng() * size);
        if (maze[y][x] !== 0) continue;
        // 너무 가장자리(출구 근처) 피하기
        if (x <= 1 || x >= size - 2 || y <= 1 || y >= size - 2) continue;
        return { x, y };
    }
    return null;
}

function initChaserFirstTimeRandomInThisChunk() {
    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    const maze = chunk.maze;
    const fixed = randomOpenCellInMaze(maze, `chaserStart:${state.currentChunk.x},${state.currentChunk.y}`);
    const pos = fixed ? { x: fixed.x + 0.5, y: fixed.y + 0.5 } : getSpawnPosForEntry(oppositeDir(state.currentEntryDir));

    state.chaser.active = true;
    state.chaser.chunk = { x: state.currentChunk.x, y: state.currentChunk.y };
    state.chaser.speedMult = 1.0;
    state.chaser.stunUntilMs = 0;
    state.chaser.caughtCount = state.chaser.caughtCount || 0;
    state.chaser.path = [];
    state.chaser.pathIndex = 0;
    state.chaser.lastRepathMs = 0;
    state.chaser.lastTargetTile = null;

    // "3번째 행에서 랜덤 지점 스폰"도 동일하게 1초 후 등장 연출 적용
    state.chaser.entryScheduledDir = 'RANDOM';
    state.chaser.entryScheduledPos = pos;
    state.chaser.isPresentInMaze = false;
    state.chaser.entryScheduledUntilMs = state.nowMs + CONFIG.CHASER_ENTRY_DELAY_MS;
    state.chaser.graceUntilMs = Math.max(state.chaser.graceUntilMs, state.chaser.entryScheduledUntilMs);
}

function getSpawnPosForEntry(entryDir) {
    const size = CONFIG.MAZE_SIZE;
    const mid = Math.floor(size / 2) + 0.5;
    const inner = 1.5;          // 가장자리에서 한 칸 안쪽(0.5가 가장자리 타일 중심)
    const innerFromEnd = size - 1.5;

    switch (entryDir) {
        case 'N': return { x: mid, y: inner };          // 위에서 들어옴 -> 북쪽 입구에서 한 칸 안쪽
        case 'S': return { x: mid, y: innerFromEnd };   // 아래에서 들어옴
        case 'W': return { x: inner, y: mid };          // 왼쪽에서 들어옴
        case 'E': return { x: innerFromEnd, y: mid };   // 오른쪽에서 들어옴
        default:  return { x: mid, y: innerFromEnd };
    }
}

function getExitEdgePos(dx, dy) {
    const size = CONFIG.MAZE_SIZE;
    const mid = Math.floor(size / 2) + 0.5;
    // 현재 플레이어 좌표를 최대한 유지하되, 경계 근처로 스냅해서 전환 시작점으로 씀
    let x = state.player.mazePos.x;
    let y = state.player.mazePos.y;

    if (dx === -1) x = 0.5;
    else if (dx === 1) x = size - 0.5;
    else x = Math.max(0.5, Math.min(size - 0.5, x));

    if (dy === 1) y = 0.5;                 // 북쪽(위)로 나감
    else if (dy === -1) y = size - 0.5;    // 남쪽(아래)로 나감
    else y = Math.max(0.5, Math.min(size - 0.5, y));

    // 만약 값이 이상하면 중앙으로 보정
    if (!Number.isFinite(x)) x = mid;
    if (!Number.isFinite(y)) y = mid;
    return { x, y };
}

function startChunkSwipeTransition({ dx, dy, nextX, nextY, entryDir }) {
    // 이미 전환 중이면 중복 방지
    if (state.transition?.active) return;

    const key = getChunkKey(nextX, nextY);
    if (!state.chunks.has(key)) state.chunks.set(key, new Chunk(nextX, nextY));

    const fromPos = getExitEdgePos(dx, dy);
    const toPos = getSpawnPosForEntry(entryDir);

    state.transition.active = true;
    state.transition.startMs = state.nowMs;
    state.transition.dx = dx;
    state.transition.dy = dy;
    state.transition.fromChunk = { x: state.currentChunk.x, y: state.currentChunk.y };
    state.transition.toChunk = { x: nextX, y: nextY };
    state.transition.entryDir = entryDir;
    state.transition.fromPos = fromPos;
    state.transition.toPos = toPos;
    state.transition.toWorldPos = { x: nextX, y: nextY };

    // 전환 중엔 움직임/충돌 업데이트를 안 하므로, 렌더 기준점을 경계로 스냅
    state.player.mazePos = { ...fromPos };
}

function updateChunkSwipeTransition() {
    if (!state.transition?.active) return;
    const tRaw = (state.nowMs - state.transition.startMs) / (state.transition.durMs || 260);
    if (tRaw < 1) return;

    // 전환 완료: 실제 청크/월드 좌표 갱신 후, 새 청크로 진입 처리
    const { toWorldPos, entryDir } = state.transition;
    if (toWorldPos) {
        state.player.worldPos.x = toWorldPos.x;
        state.player.worldPos.y = toWorldPos.y;
        enterMaze(toWorldPos.x, toWorldPos.y, entryDir);
    }

    state.transition.active = false;
    state.transition.fromChunk = null;
    state.transition.toChunk = null;
    state.transition.fromPos = null;
    state.transition.toPos = null;
    state.transition.toWorldPos = null;
}

function oppositeDir(dir) {
    switch (dir) {
        case 'N': return 'S';
        case 'S': return 'N';
        case 'W': return 'E';
        case 'E': return 'W';
        default: return 'N';
    }
}

function ensureChaserInitialized(playerEntryDir) {
    if (state.chaser.active) return;
    state.chaser.active = true;
    state.chaser.chunk = { x: state.currentChunk.x, y: state.currentChunk.y };
    state.chaser.speedMult = 1.0;
    state.chaser.stunUntilMs = 0;
    state.chaser.isPresentInMaze = false;
    // 처음에는 플레이어 입장 반대편에서 시작(박진감)
    const spawnDir = oppositeDir(playerEntryDir);
    state.chaser.pos = getSpawnPosForEntry(spawnDir);
    state.chaser.graceUntilMs = state.nowMs + CONFIG.CHASER_GRACE_MS;
    state.chaser.path = [];
    state.chaser.pathIndex = 0;
    state.chaser.lastRepathMs = 0;
    state.chaser.lastTargetTile = null;
}

function scheduleChaserEntryIntoPlayerChunk(playerEntryDir) {
    // 청크 진입 후 일정 시간 동안은 추격자가 "아예 안 보이다가"
    // 시간이 지나면 플레이어가 들어온 입구로 "진입"한 것으로 처리
    state.chaser.entryScheduledDir = playerEntryDir;
    state.chaser.entryScheduledPos = null;
    const delay = Math.max(
        CONFIG.CHASER_ENTRY_DELAY_MS,
        Math.min(CONFIG.CHASER_ENTRY_DELAY_MAX_MS, state.chaser.nextEntryDelayMs || CONFIG.CHASER_ENTRY_DELAY_MS)
    );
    state.chaser.entryScheduledUntilMs = state.nowMs + delay;
    state.chaser.isPresentInMaze = false;
    // 그 전까지는 추격 로직 자체를 멈춤
    state.chaser.graceUntilMs = Math.max(state.chaser.graceUntilMs, state.chaser.entryScheduledUntilMs);
    // 사용 후 기본값으로 되돌림
    state.chaser.nextEntryDelayMs = CONFIG.CHASER_ENTRY_DELAY_MS;
}

function materializeChaserIntoPlayerChunk(entryDir) {
    state.chaser.chunk = { x: state.currentChunk.x, y: state.currentChunk.y };
    state.chaser.respawnTimerMs = 0; // 타이머 초기화
    // 추적자 체력 복구 (부활 시)
    state.chaser.hp = CONFIG.MISSILE_DAMAGE * 5;
    state.chaser.maxHp = CONFIG.MISSILE_DAMAGE * 5;

    // 최초 스폰(RANDOM)은 예약된 좌표 사용
    if (entryDir === 'RANDOM' && state.chaser.entryScheduledPos) {
        state.chaser.pos = { ...state.chaser.entryScheduledPos };
        state.chaser.entryScheduledPos = null;
        state.chaser.entryScheduledDir = null; // 방향 초기화
        state.chaser.path = [];
        state.chaser.pathIndex = 0;
        state.chaser.lastRepathMs = 0;
        state.chaser.lastTargetTile = null;
        state.chaser.isPresentInMaze = true;
        state.chaser.graceUntilMs = Math.max(state.chaser.graceUntilMs, state.nowMs + 250);

        fxBurstMaze(state.chaser.pos.x, state.chaser.pos.y, {
            count: 32,
            color: 'rgba(255,110,80,0.95)',
            lifeMs: 650,
            speed: 6.8,
            size: 0.12,
            cone: Math.PI * 2,
            drag: 0.9,
            glow: 26,
        });
        fxFlash(0.12);
        return;
    }

    const entry = entryDir;
    const pos = getSpawnPosForEntry(entry);
    state.chaser.entryScheduledDir = null; // 방향 초기화
    // 플레이어보다 살짝 뒤(반 셀)에서 들어오게 오프셋
    const back = 0.35;
    const size = CONFIG.MAZE_SIZE;
    let cx = pos.x, cy = pos.y;
    if (entry === 'N') cy = Math.min(size - 0.5, pos.y + back);
    if (entry === 'S') cy = Math.max(0.5, pos.y - back);
    if (entry === 'W') cx = Math.min(size - 0.5, pos.x + back);
    if (entry === 'E') cx = Math.max(0.5, pos.x - back);
    state.chaser.pos = { x: cx, y: cy };
    state.chaser.path = [];
    state.chaser.pathIndex = 0;
    state.chaser.lastRepathMs = 0;
    state.chaser.lastTargetTile = null;
    state.chaser.isPresentInMaze = true;
    // 등장 직후 짧은 유예(바로 붙어버리는 거 방지)
    state.chaser.graceUntilMs = Math.max(state.chaser.graceUntilMs, state.nowMs + 250);

    // 등장(문 열고 들어오는 느낌) 이펙트
    fxBurstMaze(cx, cy, {
        count: 26,
        color: 'rgba(120,255,255,0.85)',
        lifeMs: 520,
        speed: 4.2,
        size: 0.10,
        cone: Math.PI * 2,
        drag: 0.92,
        glow: 22,
    });
    fxFlash(0.10);
}

function resetAfterCaught() {
    // 추격자에게 "잡힘" 판정으로 리셋될 때 하트가 안 깎이던 버그 수정
    // 이미 다른 충돌 분기에서 데미지를 받은 직후라면 graceUntilMs로 중복 감소를 방지
    if (state.nowMs > (state.chaser.graceUntilMs || 0)) {
        // 실드가 있으면 1회 피격 무효 + 1초 무적
        applyPlayerHit({ livesLoss: 1, canUseShield: true, flashA: 0, shake: 0 });
    }
    // 라이프가 0이면 게임오버로 넘어가므로 더 이상 리셋 로직 진행하지 않음
    if (state.ui.gameOverOpen || (state.player.lives || 0) <= 0) return;

    // 현재 청크 입구로 플레이어 리셋
    state.player.mazePos = getSpawnPosForEntry(state.currentEntryDir);
    // 추격자는 리셋 후 잠깐 유예(속도는 유지)
    state.chaser.chunk = { x: state.currentChunk.x, y: state.currentChunk.y };
    state.chaser.pos = getSpawnPosForEntry(oppositeDir(state.currentEntryDir));
    state.chaser.path = [];
    state.chaser.pathIndex = 0;
    state.chaser.lastRepathMs = 0;
    state.chaser.lastTargetTile = null;
    state.chaser.graceUntilMs = state.nowMs + CONFIG.CHASER_GRACE_MS;
    state.chaser.isPresentInMaze = false;
    state.chaser.entryScheduledDir = state.currentEntryDir;
    state.chaser.entryScheduledPos = null;
    state.chaser.entryScheduledUntilMs = state.nowMs + CONFIG.CHASER_ENTRY_DELAY_MS;
    state.chaser.caughtCount += 1;

    fxFlash(0.4);
    fxShake(3.5);
    updateUI();
}

function findNearestOpenCell(maze, sx, sy) {
    const size = CONFIG.MAZE_SIZE;
    const inRange = (x, y) => x >= 0 && x < size && y >= 0 && y < size;
    if (inRange(sx, sy) && maze[sy][sx] === 0) return { x: sx, y: sy };

    const q = [];
    const seen = Array(size).fill().map(() => Array(size).fill(false));
    if (inRange(sx, sy)) {
        q.push([sx, sy]);
        seen[sy][sx] = true;
    } else {
        // 범위 밖이면 중앙에서 시작
        const mid = Math.floor(size / 2);
        q.push([mid, mid]);
        seen[mid][mid] = true;
    }

    let head = 0;
    while (head < q.length) {
        const [x, y] = q[head++];
        if (maze[y][x] === 0) return { x, y };
        const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nbs) {
            const nx = x + dx, ny = y + dy;
            if (!inRange(nx, ny) || seen[ny][nx]) continue;
            seen[ny][nx] = true;
            q.push([nx, ny]);
        }
    }
    return null;
}

function bfsPath(maze, start, goal) {
    const size = CONFIG.MAZE_SIZE;
    const inRange = (x, y) => x >= 0 && x < size && y >= 0 && y < size;
    const key = (x, y) => `${x},${y}`;

    const s = { x: start.x, y: start.y };
    const g = { x: goal.x, y: goal.y };
    if (!inRange(s.x, s.y) || !inRange(g.x, g.y)) return [];
    if (maze[s.y][s.x] !== 0 || maze[g.y][g.x] !== 0) return [];

    const q = [[s.x, s.y]];
    const prev = new Map();
    prev.set(key(s.x, s.y), null);
    let head = 0;

    while (head < q.length) {
        const [x, y] = q[head++];
        if (x === g.x && y === g.y) break;
        const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nbs) {
            const nx = x + dx, ny = y + dy;
            const k = key(nx, ny);
            if (!inRange(nx, ny)) continue;
            if (maze[ny][nx] !== 0) continue;
            if (prev.has(k)) continue;
            prev.set(k, [x, y]);
            q.push([nx, ny]);
        }
    }

    const gk = key(g.x, g.y);
    if (!prev.has(gk)) return [];

    const path = [];
    let cur = [g.x, g.y];
    while (cur) {
        path.push({ x: cur[0], y: cur[1] });
        cur = prev.get(key(cur[0], cur[1]));
    }
    path.reverse();
    return path;
}

// --- 물리 및 업데이트 ---
function update(dt) {
    // 타이틀 화면 중에는 게임 로직을 진행하지 않음(렌더는 진행)
    if (!state.ui.started) return;
    // 게임 오버 중에는 게임 로직 정지(렌더는 모달이 담당)
    if (state.ui.gameOverOpen) return;

    // 금융/상환 등 "시간 기반" 로직은 모드/상점/설정과 무관하게 진행(게임오버 제외)
    updateEconomy(dt);
    
    // 모바일 최적화: AudioContext가 suspended 상태가 되면 주기적으로 resume 시도
    // (매 프레임 체크는 비용이 크므로 1초마다만 체크)
    if (!state.audio.lastContextCheckMs || (state.nowMs - state.audio.lastContextCheckMs) > 1000) {
        const ctx = state.audio.sfx?.ctx;
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        state.audio.lastContextCheckMs = state.nowMs;
    }
    
    // 프레임 시작: 마찰 접촉 플래그 및 마찰열 연출 리셋
    if (state.mode === 'MAZE') {
        state.audio.wallRubContactThisFrame = false;
        state.audio.wallRubIntensityThisFrame = 0;
        state.fx.wallRubHeatMs = 0;
    }

    if (state.mode === 'WORLD') {
        updateWorld(dt);
    } else {
        const dtSec = Math.min(dt, 80) / 1000;
        // 청크 전환(스와이프) 중에는 물리/추격/투사체 업데이트를 멈추고 전환만 진행
        if (state.transition?.active) {
            updateChunkSwipeTransition();
            generateVisibleChunks();
            // 전환 중엔 마찰 사운드가 유지될 이유가 거의 없으므로 천천히 꺼줌
            setWallRubContact(false, 0);
            tickWallRubAudio(state.nowMs);
            return;
        }
        if (state.ui.settingsOpen) return; // 설정창이 열려있으면 게임 일시정지
        if (state.ui.modalOpen) return; // 어빌리티 선택 중엔 게임 일시정지
        // 시간 경과에 따른 점수 감점: 1초에 1점(층수 배수 적용) - 절반으로 감소
        subScore(1 * (Math.min(dt, 80) / 1000), getFloor());
        updateMaze(dt);
        updateChaser(dt);
        updateBoss(dt);
        updateWallRegen(dt);
        processPendingMissileShots();
        updateCollectiblesAndProjectiles(dt);
        updateFx(dt);

        // 추격자 투사체 업데이트 (추적자가 있는 청크에서만)
        for (let i = state.chaserProjectiles.length - 1; i >= 0; i--) {
            const p = state.chaserProjectiles[i];
            // 미사일이 속한 청크 정보가 없으면 기본값으로 현재 추적자 청크 사용
            const projChunk = p.chunk || state.chaser.chunk;
            const projChunkKey = getChunkKey(projChunk.x, projChunk.y);
            const projChunkObj = state.chunks.get(projChunkKey);
            if (!projChunkObj) {
                // 미사일이 속한 청크가 없으면 제거
                state.chaserProjectiles.splice(i, 1);
                continue;
            }
            
            p.pos.x += p.vel.x * dtSec;
            p.pos.y += p.vel.y * dtSec;

            // 플레이어와 같은 청크에 있을 때만 충돌 체크
            const isPlayerInProjChunk = state.currentChunk.x === projChunk.x && state.currentChunk.y === projChunk.y;
            if (isPlayerInProjChunk) {
                const dx = state.player.mazePos.x - p.pos.x;
                const dy = state.player.mazePos.y - p.pos.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < CONFIG.PLAYER_RADIUS + 0.1) {
                    state.chaserProjectiles.splice(i, 1);
                    applyPlayerHit({
                        livesLoss: 1,
                        canUseShield: true,
                        flashA: 0.2,
                        flashColor: '#ff0000',
                        shake: 3.0,
                        sfx: 'resource/missile-explosion-168600.mp3',
                    });
                    continue;
                }
            }

            // 맵 밖 제거 (청크 경계를 넘어가면 제거)
            if (p.pos.x < -2 || p.pos.x > CONFIG.MAZE_SIZE + 2 || p.pos.y < -2 || p.pos.y > CONFIG.MAZE_SIZE + 2) {
                state.chaserProjectiles.splice(i, 1);
            }
        }

        // 마찰 사운드 업데이트(접촉 플래그 기반)
        const isContact = !!state.audio.wallRubContactThisFrame;
        const was = !!state.audio.wallRubWasContact;
        // 상태 변화가 있을 때만 페이드 트리거(중요: 매 프레임 재시작 방지)
        if (isContact !== was) {
            setWallRubContact(isContact, state.audio.wallRubIntensityThisFrame || 0);
        } else if (isContact) {
            // 접촉 유지 중에는 강도 변화만 반영(목표 볼륨 상향 등)
            setWallRubContact(true, state.audio.wallRubIntensityThisFrame || 0);
        }
        state.audio.wallRubWasContact = isContact;
        tickWallRubAudio(state.nowMs);
    }
    generateVisibleChunks();
}

function updateWallRegen(dt) {
    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    if (!chunk || !chunk.brokenWalls || chunk.brokenWalls.size === 0) return;

    const pX = state.player.mazePos.x;
    const pY = state.player.mazePos.y;
    const cActive = state.chaser.active && state.chaser.isPresentInMaze;
    const cX = state.chaser.pos.x;
    const cY = state.chaser.pos.y;
    const bActive = state.boss.active;
    const bX = 8.5, bY = 8.5; // 보스 중심 좌표

    for (const [key, info] of chunk.brokenWalls.entries()) {
        if (state.nowMs - info.time > CONFIG.WALL_REGEN_MS) {
            const [tx, ty] = key.split(',').map(Number);
            const midX = tx + 0.5;
            const midY = ty + 0.5;
            
            // 플레이어 체크 (반경 1타일 내)
            if (Math.abs(pX - midX) < 1.5 && Math.abs(pY - midY) < 1.5) continue;

            // 적(추격자) 체크
            if (cActive && Math.abs(cX - midX) < 1.5 && Math.abs(cY - midY) < 1.5) continue;

            // 보스 체크
            if (bActive && Math.abs(bX - midX) < 2.5 && Math.abs(bY - midY) < 2.5) continue; // 보스는 덩치가 크므로 좀 더 넓게
            
            chunk.maze[ty][tx] = info.val;
            chunk.brokenWalls.delete(key);
            chunk.mazeTex = null; // 텍스처 갱신
        }
    }
}

function updateEconomy(dt) {
    const a = state.abilities || {};
    // 1) 예금: interval마다 +1 coin, 받을 때마다 interval -0.25s (최소 1s)
    if (a.bankDeposit?.enabled) {
        a.bankDeposit.timerMs = (a.bankDeposit.timerMs || 0) + dt;
        let interval = Math.max(1000, Number(a.bankDeposit.intervalMs || 10000));
        // 과도한 루프 방지
        let guard = 0;
        while (a.bankDeposit.timerMs >= interval && guard++ < 20) {
            a.bankDeposit.timerMs -= interval;
            addCoinsSigned(1);
            interval = Math.max(1000, interval - 250);
        }
        a.bankDeposit.intervalMs = interval;
    }

    // 2) 생활비 대출 상환: 5층 통과 후 5초당 1코인 상환, 코인이 음수면 1초당 추가 상환액 +1 증가
    if (a.livingLoan?.debt > 0) {
        const loan = a.livingLoan;
        // graceFloors>0이면 층 통과를 기다림
        if ((loan.graceFloors || 0) <= 0) {
            // 기본 상환: 5초당 1
            loan.repayAccMs = (loan.repayAccMs || 0) + dt;
            while (loan.repayAccMs >= 5000 && loan.debt > 0) {
                loan.repayAccMs -= 5000;
                const pay = Math.min(1, loan.debt);
                addCoinsSigned(-pay);
                loan.debt -= pay;
            }

            // 패널티: 코인이 음수인 동안 1초마다 상환액이 1씩 증가, 그 증가분만큼 추가 상환
            if ((state.coins ?? 0) < 0 && loan.debt > 0) {
                loan.penaltyAccMs = (loan.penaltyAccMs || 0) + dt;
                while (loan.penaltyAccMs >= 1000 && loan.debt > 0) {
                    loan.penaltyAccMs -= 1000;
                    loan.penaltyRate = (loan.penaltyRate || 0) + 1;
                    const pay = Math.min(loan.penaltyRate, loan.debt);
                    addCoinsSigned(-pay);
                    loan.debt -= pay;
                }
            }
        }

        if (loan.debt <= 0) {
            loan.debt = 0;
            loan.graceFloors = 0;
            loan.repayAccMs = 0;
            loan.penaltyAccMs = 0;
            loan.penaltyRate = 0;
        }
    }
}

function updateBoss(dt) {
    const floor = getFloor();
    const isBossFloor = floor > 0 && floor % 20 === 0;
    
    if (!isBossFloor) {
        state.boss.active = false;
        return;
    }

    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    if (!chunk || chunk.cleared) {
        state.boss.active = false;
        state.boss.gridPatterns = [];
        return;
    }

    if (!state.boss.active) {
        state.boss.active = true;
        state.boss.hp = CONFIG.BOSS_HEALTH;
        state.boss.maxHp = CONFIG.BOSS_HEALTH;
        state.boss.lastAttackMs = state.nowMs;
        state.boss.missileSpawnMs = state.nowMs;
        state.boss.gridPatterns = []; // 격자 패턴 초기화
        // 보스전에서는 추격자 비활성화
        state.chaser.isPresentInMaze = false;
        // 보스전 중에는 추격자 미사일이 나오면 안됨(기존 발사체도 제거)
        state.chaserProjectiles = [];
        state.chaser.lastShotMs = state.nowMs;
    }

    const getBossLaserWarnMs = () => {
        const hpPct = (state.boss.maxHp > 0) ? (state.boss.hp / state.boss.maxHp) : 1;
        // 최대 체력: 3초, 10% 이하: 0.5초, 그 사이: 0.5초 간격으로 감소
        const t = Math.max(0, Math.min(1, (hpPct - 0.10) / 0.90));
        const rawSec = 0.5 + 2.5 * t; // 0.5..3.0
        const step = 0.5;
        const snappedSec = Math.ceil(rawSec / step) * step;
        return Math.round(snappedSec * 1000);
    };

    // 보스 패턴 (레이저 + 격자 장판)
    if (state.nowMs - state.boss.lastAttackMs > 3000) {
        state.boss.lastAttackMs = state.nowMs;
        const warnMs = getBossLaserWarnMs();
        // 무작위 패턴 생성 (0-1: 레이저, 2-4: 격자 장판)
        const pattern = Math.floor(Math.random() * 5);
        if (pattern === 0) {
            // 십자 레이저
            state.boss.lasers.push({ x: 8.5, y: 8.5, angle: 0, width: 2, lifeMs: 1500, warnMs, startMs: state.nowMs, soundPlayed: false, soundScheduled: false });
            state.boss.lasers.push({ x: 8.5, y: 8.5, angle: Math.PI / 2, width: 2, lifeMs: 1500, warnMs, startMs: state.nowMs, soundPlayed: false, soundScheduled: false });
        } else if (pattern === 1) {
            // 원형 퍼지는 레이저 (간소화해서 4방향)
            for(let i=0; i<4; i++) {
                state.boss.lasers.push({ x: 8.5, y: 8.5, angle: (Math.PI/2)*i + Math.PI/4, width: 1.5, lifeMs: 1200, warnMs, startMs: state.nowMs, soundPlayed: false, soundScheduled: false });
            }
        } else if (pattern === 2) {
            // 패턴 1: 체스판 폭발
            const tiles = [];
            for (let y = 0; y < 17; y++) {
                for (let x = 0; x < 17; x++) {
                    if ((x + y) % 2 === 0) { // 체스판 패턴
                        tiles.push({
                            x: x + 0.5,
                            y: y + 0.5,
                            state: 'warning', // 'warning' | 'active' | 'done'
                            warnStartMs: state.nowMs,
                            damageStartMs: state.nowMs + 1500,
                            damageEndMs: state.nowMs + 1800
                        });
                    }
                }
            }
            state.boss.gridPatterns.push({ type: 'chess', tiles, startMs: state.nowMs });
        } else if (pattern === 3) {
            // 패턴 2: 행/열 순차 폭발
            const isRow = Math.random() < 0.5;
            const tiles = [];
            const count = isRow ? 17 : 17;
            const delayPerStep = 500; // 각 행/열 간격
            
            for (let i = 0; i < count; i++) {
                if (isRow) {
                    // 행 순차 폭발
                    for (let x = 0; x < 17; x++) {
                        tiles.push({
                            x: x + 0.5,
                            y: i + 0.5,
                            state: 'warning',
                            warnStartMs: state.nowMs + i * delayPerStep,
                            damageStartMs: state.nowMs + i * delayPerStep + 1500,
                            damageEndMs: state.nowMs + i * delayPerStep + 1800
                        });
                    }
                } else {
                    // 열 순차 폭발
                    for (let y = 0; y < 17; y++) {
                        tiles.push({
                            x: i + 0.5,
                            y: y + 0.5,
                            state: 'warning',
                            warnStartMs: state.nowMs + i * delayPerStep,
                            damageStartMs: state.nowMs + i * delayPerStep + 1500,
                            damageEndMs: state.nowMs + i * delayPerStep + 1800
                        });
                    }
                }
            }
            state.boss.gridPatterns.push({ type: 'rowcol', tiles, startMs: state.nowMs });
        } else if (pattern === 4) {
            // 패턴 5: 랜덤 격자 폭발
            const tiles = [];
            const totalTiles = 17 * 17;
            const targetCount = Math.floor(totalTiles * 0.35); // 35% 타일
            const used = new Set();
            
            for (let i = 0; i < targetCount; i++) {
                let x, y, key;
                do {
                    x = Math.floor(Math.random() * 17);
                    y = Math.floor(Math.random() * 17);
                    key = `${x},${y}`;
                } while (used.has(key));
                used.add(key);
                
                const delay = Math.floor(Math.random() * 800); // 0~0.8초 랜덤 지연
                tiles.push({
                    x: x + 0.5,
                    y: y + 0.5,
                    state: 'warning',
                    warnStartMs: state.nowMs + delay,
                    damageStartMs: state.nowMs + delay + 1500,
                    damageEndMs: state.nowMs + delay + 3500 // 2초 대미지
                });
            }
            state.boss.gridPatterns.push({ type: 'random', tiles, startMs: state.nowMs });
        }
    }

    // 레이저 업데이트 및 피격 판정
    // 효과음 재생을 위한 그룹화 (같은 패턴의 레이저는 한 번만 재생)
    const laserSoundGroups = new Map(); // 패턴 시작 시간 -> 재생 여부
    
    for (let i = state.boss.lasers.length - 1; i >= 0; i--) {
        const laser = state.boss.lasers[i];
        const t = state.nowMs - laser.startMs;
        const warnMs = laser.warnMs ?? 500;
        if (t > warnMs + laser.lifeMs) {
            state.boss.lasers.splice(i, 1);
            continue;
        }

        // 경고 시간 후 실제 공격 - 효과음 재생 (정확한 타이밍)
        // 경고가 끝나는 정확한 시점에 재생 (warnMs에 도달하는 순간)
        if (t >= warnMs && t < warnMs + 50 && !laser.soundPlayed) {
            // 같은 패턴(같은 startMs)의 레이저들은 한 번만 재생
            const groupKey = laser.startMs;
            if (!laserSoundGroups.has(groupKey)) {
                laserSoundGroups.set(groupKey, true);
                laser.soundPlayed = true;
                playSfx('resource/laser-381976.mp3', { volume: 0.8, rate: 1.0 });
            } else {
                laser.soundPlayed = true; // 이미 재생되었으므로 표시만
            }
        }

        if (t > warnMs) {
            const px = state.player.mazePos.x;
            const py = state.player.mazePos.y;
            // 레이저 중심(8.5, 8.5)으로부터 플레이어까지의 거리와 각도 체크
            const dx = px - 8.5;
            const dy = py - 8.5;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const angle = Math.atan2(dy, dx);
            
            // 레이저 선분과의 거리 계산 (간소화)
            const angleDiff = Math.abs((angle - laser.angle + Math.PI * 3) % (Math.PI * 2) - Math.PI);
            if (angleDiff < 0.1 && dist < 10) {
                // 피격!
                state.boss.lasers.splice(i, 1);
                applyPlayerHit({ livesLoss: 1, canUseShield: true, flashA: 0.5, shake: 4 });
            }
        }
    }

    // 격자 장판 패턴 업데이트 및 피격 판정
    for (let i = state.boss.gridPatterns.length - 1; i >= 0; i--) {
        const pattern = state.boss.gridPatterns[i];
        let allDone = true;
        
        for (const tile of pattern.tiles) {
            const t = state.nowMs - tile.warnStartMs;
            
            // 경고 단계
            if (t >= 0 && t < (tile.damageStartMs - tile.warnStartMs)) {
                tile.state = 'warning';
                allDone = false;
            }
            // 대미지 단계
            else if (t >= (tile.damageStartMs - tile.warnStartMs) && t < (tile.damageEndMs - tile.warnStartMs)) {
                tile.state = 'active';
                allDone = false;
                
                // 피격 판정
                const px = state.player.mazePos.x;
                const py = state.player.mazePos.y;
                const dx = px - tile.x;
                const dy = py - tile.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 0.5) { // 타일 중심 기준 0.5 타일 반경
                    applyPlayerHit({ livesLoss: 1, canUseShield: true, flashA: 0.5, shake: 4 });
                    tile.state = 'done'; // 한 번만 피격
                }
            }
            // 종료
            else {
                tile.state = 'done';
            }
        }
        
        // 모든 타일이 완료되면 패턴 제거
        if (allDone) {
            state.boss.gridPatterns.splice(i, 1);
        }
    }

    // 미사일 리스폰 (5초마다)
    if (state.nowMs - state.boss.missileSpawnMs > CONFIG.MISSILE_RESPAWN_MS) {
        state.boss.missileSpawnMs = state.nowMs;
        if (state.inventory.missiles < 5) {
            state.inventory.missiles += 1;
            onPickupFx('missile');
        }
    }
}

function updateFx(dt) {
    const dtSec = Math.min(dt, 50) / 1000;

    // 파티클 업데이트
    for (let i = state.fx.particles.length - 1; i >= 0; i--) {
        const p = state.fx.particles[i];
        p.age += dt;
        if (p.age >= p.life) {
            state.fx.particles.splice(i, 1);
            continue;
        }
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
    }

    // 화면 흔들림/섬광 감쇠 (flash color 복구 로직 추가)
    state.fx.shake.amp = Math.max(0, state.fx.shake.amp - CONFIG.FX_SHAKE_DECAY * dtSec);
    state.fx.flash.a = Math.max(0, state.fx.flash.a - CONFIG.FX_FLASH_DECAY * dtSec);
    if (state.fx.flash.a <= 0) state.fx.flash.color = '#fff';

    // 플레이어 틴트 감쇠(서서히 사라짐)
    if (state.fx.playerTint?.a > 0.0001) {
        // 약 0.7초 정도에 걸쳐 서서히 사라지게
        state.fx.playerTint.a = Math.max(0, state.fx.playerTint.a - 1.45 * dtSec);
    }
}

function updateWorld(dt) {
    // 월드맵에서는 청크(정수 좌표) 기반으로만 이동(미로 출구로 나올 때)하도록 둡니다.
    // 실수 좌표로 움직이면 청크 생성 키가 무한히 쪼개져 성능/정합성이 깨질 수 있어 비활성화합니다.

    // 카메라 부드럽게 추적: 현재 청크가 화면 중앙에 오도록
    const cy = Math.round(state.player.worldPos.y);
    const targetCameraY = (cy + 0.5) * CONFIG.CHUNK_SIZE - state.view.h / 2;
    state.cameraY += (targetCameraY - state.cameraY) * 0.1;
}

function updateMaze(dt) {
    const cellSize = Math.min(state.view.w, state.view.h) / CONFIG.MAZE_SIZE * 0.9;
    const offsetX = state.view.w / 2 - (cellSize * CONFIG.MAZE_SIZE) / 2;
    const offsetY = state.view.h / 2 - (cellSize * CONFIG.MAZE_SIZE) / 2;

    const pScreenX = offsetX + state.player.mazePos.x * cellSize;
    const pScreenY = offsetY + state.player.mazePos.y * cellSize;
    
    let dx, dy;
    // 자이로 모드면(모바일 판정과 무관) "기울기 → 가상 마우스 오프셋"으로 이동 입력을 만듦
    // NOTE: 일부 기기/브라우저는 터치 디바이스지만 pointer/hover 판정이 달라 state.ui.isMobile이 false일 수 있음.
    //       사용자가 자이로 모드를 선택했다면 그 의도를 우선합니다.
    if (state.controls?.mobileMode === 'gyro' && state.controls.gyro?.enabled) {
        const g = state.controls.gyro;
        const beta = (g.beta || 0) - (g.hasNeutral ? (g.neutralBeta || 0) : 0);
        const gamma = (g.gamma || 0) - (g.hasNeutral ? (g.neutralGamma || 0) : 0);
        const tiltMax = Math.max(5, Number(g.tiltMaxDeg || 25));
        const sens = Math.max(0.2, Math.min(3.0, Number(g.sensitivity || 1.0)));
        const radius = Math.max(60, Math.min(320, Number(g.radiusPx || 170)));
        const nx = Math.max(-1, Math.min(1, (gamma / tiltMax) * sens));
        const ny = Math.max(-1, Math.min(1, (beta / tiltMax) * sens));
        dx = nx * radius;
        dy = ny * radius;
    } else {
        dx = state.mouse.x - pScreenX;
        dy = state.mouse.y - pScreenY;
    }

    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 10) {
        const moveScale = Math.min(dist / 100, 1.0);
        const speed = CONFIG.MOVE_SPEED * state.abilities.moveSpeedMult;
        const vx = (dx / dist) * speed * moveScale;
        const vy = (dy / dist) * speed * moveScale;
        
        // 벽 마찰 스파크 강도는 "마우스-말판 거리"에 비례:
        // 멀수록(=moveScale 1) 현재 수준, 가까울수록 작게
        applyMovementWithSliding(vx, vy, moveScale, dt);
    }

    // 문대지 않으면 벽 열이 서서히 식도록
    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    decayWallHeat(chunk, dt);
}

function updateChaser(dt) {
    if (!state.chaser.active) return;
    // 보스전 중에는 추격자 미사일/로직 자체를 진행하지 않음
    if (state.boss.active) return;
    // 보스전 직후엔 일정 시간 추격자/미사일 등장 금지
    if (state.chaser.bossCooldownUntilMs && state.nowMs < state.chaser.bossCooldownUntilMs) return;
    // 추격자는 자신의 청크에 있음 (플레이어와 다른 청크에 있을 수 있음)
    const chaserChunkKey = getChunkKey(state.chaser.chunk.x, state.chaser.chunk.y);
    const chunk = state.chunks.get(chaserChunkKey);
    if (!chunk) return; // 추격자 청크가 없으면 업데이트 불가
    const maze = chunk.maze;

    // 살상 미사일에 의해 파괴된 경우 처리
    if (state.chaser.deadUntilNextChunk) return;

    // 청크 진입 연출: 아직 등장 시간이 아니면 아예 미존재 처리
    if (!state.chaser.isPresentInMaze) {
        if (state.chaser.entryScheduledUntilMs && state.nowMs >= state.chaser.entryScheduledUntilMs) {
            const dir = state.chaser.entryScheduledDir || state.currentEntryDir || 'S';
            
            // 리스폰 타이머(3초 점멸 예고) 체크
            if (state.chaser.respawnTimerMs > 0) {
                state.chaser.respawnTimerMs -= dt;
                if (state.chaser.respawnTimerMs <= 0) {
                    materializeChaserIntoPlayerChunk(dir);
                    updateUI();
                }
                return;
            } else {
                materializeChaserIntoPlayerChunk(dir);
                updateUI();
            }
        } else {
            return;
        }
    }

    // 플레이어와 같은 청크에 있을 때만 미사일 발사 및 충돌 체크
    const isPlayerInChaserChunk = state.currentChunk.x === state.chaser.chunk.x && state.currentChunk.y === state.chaser.chunk.y;
    
    // 20렙부터 레이저 발사 (같은 청크에 있을 때만)
    if (isPlayerInChaserChunk && getFloor() >= 20 && state.nowMs - state.chaser.lastShotMs > 5000) {
        state.chaser.lastShotMs = state.nowMs;
        const dx = state.player.mazePos.x - state.chaser.pos.x;
        const dy = state.player.mazePos.y - state.chaser.pos.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const speed = CONFIG.MISSILE_SPEED / 2;
        state.chaserProjectiles.push({
            pos: { x: state.chaser.pos.x, y: state.chaser.pos.y },
            vel: { x: (dx/dist)*speed, y: (dy/dist)*speed },
            chunk: { x: state.chaser.chunk.x, y: state.chaser.chunk.y } // 미사일이 속한 청크 저장
        });
        // 추적자 미사일 발사 소리
        playSfx('resource/chaser_missile-44538.mp3', { volume: 0.7, rate: 1.0 });
    }

    // 플레이어와 직접 충돌 체크 (같은 청크에 있을 때만)
    // - 추격자가 "기절(stun)" 상태일 때는 몸박 데미지를 주지 않음
    // - (기존에는 스턴/유예와 상관없이 체크해서, 스턴 중에도 데미지가 들어갈 수 있었음)
    if (isPlayerInChaserChunk) {
        const pdx = state.player.mazePos.x - state.chaser.pos.x;
        const pdy = state.player.mazePos.y - state.chaser.pos.y;
        const pdist = Math.sqrt(pdx*pdx + pdy*pdy);
        const isStunned = state.nowMs < state.chaser.stunUntilMs;
        if (!isStunned && pdist < (CONFIG.PLAYER_RADIUS + CONFIG.CHASER_RADIUS) * 0.8) {
            // 하트 1 감소 및 일시 무적(유예) 부여
            if (state.nowMs > state.chaser.graceUntilMs) {
                applyPlayerHit({
                    livesLoss: 1,
                    canUseShield: true,
                    flashA: 0.25,
                    flashColor: '#ff0000',
                    shake: 5.0,
                    sfx: 'resource/missile-explosion-168600.mp3',
                });
                state.chaser.graceUntilMs = state.nowMs + 1500; // 1.5초 유예
            }
        }
    }

    // 스턴/유예 시간 동안은 추격자 정지
    if (state.nowMs < state.chaser.stunUntilMs) return;
    if (state.nowMs < state.chaser.graceUntilMs) return;

    const dtSec = Math.min(dt, 50) / 1000;
    let speed = CONFIG.CHASER_SPEED * state.chaser.speedMult;
    
    // 강화 화약 슬로우 효과 적용
    if (state.nowMs < state.chaser.slowUntilMs) {
        speed *= CONFIG.GUNPOWDER_SLOW_MULT;
    }
    
    const moveDist = speed * dtSec;

    const playerTile = { x: Math.floor(state.player.mazePos.x), y: Math.floor(state.player.mazePos.y) };
    const chaserTile = { x: Math.floor(state.chaser.pos.x), y: Math.floor(state.chaser.pos.y) };

    const needRepath =
        !state.chaser.lastTargetTile ||
        state.chaser.lastTargetTile.x !== playerTile.x ||
        state.chaser.lastTargetTile.y !== playerTile.y ||
        (state.nowMs - state.chaser.lastRepathMs) > CONFIG.CHASER_REPATH_MS ||
        state.chaser.path.length === 0 ||
        state.chaser.pathIndex >= state.chaser.path.length;

    if (needRepath) {
        const path = bfsPath(maze, chaserTile, targetTile);
        state.chaser.path = path;
        state.chaser.pathIndex = path.length > 1 ? 1 : 0;
        state.chaser.lastRepathMs = state.nowMs;
        state.chaser.lastTargetTile = { ...targetTile };
    }

    if (state.chaser.path.length <= 1) {
        // 경로가 없으면(드문 경우) 플레이어 방향으로 살짝 끌어당기되 충돌은 무시하지 않음
        return;
    }

    let remaining = moveDist;
    while (remaining > 0 && state.chaser.pathIndex < state.chaser.path.length) {
        const target = state.chaser.path[state.chaser.pathIndex];
        const tx = target.x + 0.5;
        const ty = target.y + 0.5;
        const dx = tx - state.chaser.pos.x;
        const dy = ty - state.chaser.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-6) {
            state.chaser.pathIndex += 1;
            continue;
        }
        const step = Math.min(remaining, dist);
        state.chaser.pos.x += (dx / dist) * step;
        state.chaser.pos.y += (dy / dist) * step;
        remaining -= step;
        if (step === dist) state.chaser.pathIndex += 1;
    }

    // 잡힘 판정
    const rx = state.chaser.pos.x - state.player.mazePos.x;
    const ry = state.chaser.pos.y - state.player.mazePos.y;
    const hitR = CONFIG.CHASER_RADIUS + CONFIG.PLAYER_RADIUS;
    if (rx * rx + ry * ry <= hitR * hitR) {
        resetAfterCaught();
    }
}

function spawnItemForChunkIfNeeded() {
    // 필드(현재 청크) 내 미사일 아이템 스폰
    // 이미 발사 중 미사일이 활성화되어 있으면 아이템 스폰 안 함
    if (state.missiles.length || state.pendingMissileShots.length) return;

    // 이미 스폰되어 있으면 유지
    if (state.items?.length) return;
    if (!state.items) state.items = [];

    // 무기고 확장 어빌리티가 있으면 새로운 확률 시스템 사용
    if (state.abilities?.missileFieldSpawnUnlocked) {
        // 확률: 1개 75%, 2개 30%, 3개 10%, 4개 5%, 5개 1%
        const probs = [0.75, 0.30, 0.10, 0.05, 0.01];
        let itemCount = 0;
        for (let i = 0; i < probs.length; i++) {
            if (Math.random() < probs[i]) {
                itemCount = i + 1;
            }
        }
        
        const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
        const maze = chunk.maze;
        const size = CONFIG.MAZE_SIZE;

        for (let n = 0; n < itemCount; n++) {
            // 랜덤 빈 칸 찾기(최대 200회)
            for (let i = 0; i < 200; i++) {
                const x = Math.floor(Math.random() * size);
                const y = Math.floor(Math.random() * size);
                if (maze[y][x] !== 0) continue;
                // 출구 중앙 줄 근처는 피하기(너무 공짜가 됨)
                if (y <= 1 || y >= size - 2 || x <= 1 || x >= size - 2) continue;
                const px = x + 0.5;
                const py = y + 0.5;
                if (checkWallCollision(px, py, 0.22, maze)) continue;
                if (state.items.some(it => (it.pos.x - px) ** 2 + (it.pos.y - py) ** 2 < 0.9 ** 2)) continue;
                state.items.push({ pos: { x: px, y: py } });
                break;
            }
        }
        return;
    }

    // 기존 시스템 (무기고 확장 없을 때)
    const mult = state.abilities?.missileSpawnChanceMult ?? 1.0;
    const bonus = Math.max(0, Math.min(1.0, state.abilities?.missileFieldSpawnBonus ?? 0));
    const chance = Math.min(0.95, CONFIG.ITEM_SPAWN_CHANCE * mult * (1 + bonus));
    const maxItems = Math.max(1, Math.floor(state.abilities?.maxFieldMissileItems ?? 1));

    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    const maze = chunk.maze;
    const size = CONFIG.MAZE_SIZE;

    for (let n = 0; n < maxItems; n++) {
        if (Math.random() > chance) continue;
        // 랜덤 빈 칸 찾기(최대 200회)
        for (let i = 0; i < 200; i++) {
            const x = Math.floor(Math.random() * size);
            const y = Math.floor(Math.random() * size);
            if (maze[y][x] !== 0) continue;
            // 출구 중앙 줄 근처는 피하기(너무 공짜가 됨)
            if (y <= 1 || y >= size - 2 || x <= 1 || x >= size - 2) continue;
            const px = x + 0.5;
            const py = y + 0.5;
            if (checkWallCollision(px, py, 0.22, maze)) continue;
            if (state.items.some(it => (it.pos.x - px) ** 2 + (it.pos.y - py) ** 2 < 0.9 ** 2)) continue;
            state.items.push({ pos: { x: px, y: py } });
            break;
        }
    }
}

function tryDropHeartInCurrentChunk() {
    const chance = Math.max(0, Math.min(0.10, state.abilities?.heartDropChance ?? 0));
    if (chance <= 0) return false;
    if (Math.random() >= chance) return false;
    if (!state.hearts) state.hearts = [];
    // 너무 많이 쌓이지 않게 제한
    if (state.hearts.length >= 5) return false;

    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    if (!chunk?.maze) return false;
    const maze = chunk.maze;
    const size = CONFIG.MAZE_SIZE;

    for (let i = 0; i < 250; i++) {
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        if (maze[y][x] !== 0) continue;
        if (x <= 1 || x >= size - 2 || y <= 1 || y >= size - 2) continue;
        const px = x + 0.5;
        const py = y + 0.5;
        if (checkWallCollision(px, py, 0.22, maze)) continue;
        // 플레이어/아이템/하트 겹침 방지
        if ((state.player.mazePos.x - px) ** 2 + (state.player.mazePos.y - py) ** 2 < 1.0 ** 2) continue;
        if (state.items?.some(it => (it.pos.x - px) ** 2 + (it.pos.y - py) ** 2 < 0.9 ** 2)) continue;
        if (state.hearts.some(h => (h.pos.x - px) ** 2 + (h.pos.y - py) ** 2 < 0.9 ** 2)) continue;
        state.hearts.push({ pos: { x: px, y: py } });
        return true;
    }
    return false;
}

function updateCollectiblesAndProjectiles(dt) {
    const dtSec = Math.min(dt, 50) / 1000;

    // 코인 획득(청크별 0~3개, 1회 스폰)
    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    if (chunk?.coins?.length) {
        for (const c of chunk.coins) {
            if (c.picked) continue;
            const dx = state.player.mazePos.x - c.x;
            const dy = state.player.mazePos.y - c.y;
            if (dx * dx + dy * dy <= (CONFIG.PLAYER_RADIUS + 0.22) ** 2) {
                c.picked = true;
                addCoins(1);
                // 동전 먹을 때 +5점
                addScore(5, getFloor());
                // SFX: 코인 획득
                playSfx('resource/pick-coin-384921.mp3', { volume: 0.60, rate: 1.0 });
                onPickupFx('coin');
                fxBurstMaze(c.x, c.y, {
                    kind: 'spark',
                    count: 10,
                    color: 'rgba(255, 210, 77, 0.95)',
                    lifeMs: 220,
                    speed: 9,
                    size: 0.025,
                    len: 0.9,
                    cone: Math.PI * 2,
                    drag: 0.86,
                    glow: 18,
                });
                fxFlash(0.05);
            }
        }
    }

    // 아이템(미사일) 획득 판정
    if (state.items?.length) {
        const r = CONFIG.PLAYER_RADIUS + 0.25;
        for (let i = state.items.length - 1; i >= 0; i--) {
            const it = state.items[i];
            const dx = state.player.mazePos.x - it.pos.x;
            const dy = state.player.mazePos.y - it.pos.y;
            if (dx * dx + dy * dy <= r * r) {
                state.items.splice(i, 1);
                state.inventory.missiles += 1;
                playSfx('resource/pick_missile-83043.mp3', { volume: 0.65, rate: 1.0 });
                onPickupFx('missile');
                updateUI();
            }
        }
    }

    // 하트 획득 판정
    if (state.hearts?.length) {
        const r = CONFIG.PLAYER_RADIUS + 0.28;
        for (let i = state.hearts.length - 1; i >= 0; i--) {
            const h = state.hearts[i];
            const dx = state.player.mazePos.x - h.pos.x;
            const dy = state.player.mazePos.y - h.pos.y;
            if (dx * dx + dy * dy <= r * r) {
                state.hearts.splice(i, 1);
                // 최대 체력까지 회복(이미 최대여도 사라짐)
                state.player.lives = (state.abilities.maxLives ?? 3);
                fxFlash(0.10, '#ff6aa8');
                updateUI();
            }
        }
    }

    // 예약된 미사일 발사(2연발)
    if (state.pendingMissileShots.length) {
        for (let i = state.pendingMissileShots.length - 1; i >= 0; i--) {
            if (state.nowMs >= state.pendingMissileShots[i].fireMs) {
                fireMissile();
                state.pendingMissileShots.splice(i, 1);
            }
        }
    }

    // 미사일(복수) 이동/히트
    if (state.missiles.length) {
        for (let i = state.missiles.length - 1; i >= 0; i--) {
            const m = state.missiles[i];

            // 유도(호밍) 및 히트 판정 대상 좌표
            let targetX, targetY;
            if (state.boss.active) {
                targetX = 8.5;
                targetY = 8.5;
            } else if (state.abilities.interceptMissileUnlocked) {
                // 요격미사일: 추적자와 추적자 미사일 중 플레이어에게 더 가까운 대상 선택
                const px = state.player.mazePos.x;
                const py = state.player.mazePos.y;
                
                let bestTarget = null;
                let bestDist = Infinity;
                
                // 추적자 체크
                if (state.chaser.active && state.chaser.isPresentInMaze) {
                    const dx = px - state.chaser.pos.x;
                    const dy = py - state.chaser.pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestTarget = { x: state.chaser.pos.x, y: state.chaser.pos.y, type: 'chaser' };
                    }
                }
                
                // 추적자 미사일 체크
                for (const proj of state.chaserProjectiles) {
                    const dx = px - proj.pos.x;
                    const dy = py - proj.pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestTarget = { x: proj.pos.x, y: proj.pos.y, type: 'projectile', proj: proj };
                    }
                }
                
                if (bestTarget) {
                    targetX = bestTarget.x;
                    targetY = bestTarget.y;
                    m.interceptTarget = bestTarget; // 타겟 정보 저장
                } else {
                    // 타겟이 없으면 기본 추적자
                    targetX = state.chaser.pos.x;
                    targetY = state.chaser.pos.y;
                    m.interceptTarget = null;
                }
            } else {
                targetX = state.chaser.pos.x;
                targetY = state.chaser.pos.y;
                m.interceptTarget = null;
            }

            const dx = targetX - m.pos.x;
            const dy = targetY - m.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const desiredVx = (dx / dist) * CONFIG.MISSILE_SPEED;
            const desiredVy = (dy / dist) * CONFIG.MISSILE_SPEED;
            const tt = 1 - Math.exp(-CONFIG.MISSILE_TURN_RATE * dtSec);
            m.vel.x += (desiredVx - m.vel.x) * tt;
            m.vel.y += (desiredVy - m.vel.y) * tt;
            const vMag = Math.sqrt(m.vel.x * m.vel.x + m.vel.y * m.vel.y) || 1;
            m.vel.x = (m.vel.x / vMag) * CONFIG.MISSILE_SPEED;
            m.vel.y = (m.vel.y / vMag) * CONFIG.MISSILE_SPEED;

            // 트레일(공유 타이머)
            if (state.nowMs - state.fx.lastTrailMs > 30) {
                state.fx.lastTrailMs = state.nowMs;
                fxBurstMaze(m.pos.x, m.pos.y, {
                    count: 1,
                    color: 'rgba(255,240,200,0.45)',
                    lifeMs: 260,
                    speed: 1.2,
                    size: 0.06,
                    cone: Math.PI * 2,
                    drag: 0.90,
                    glow: 14,
                });
            }

            m.pos.x += m.vel.x * dtSec;
            m.pos.y += m.vel.y * dtSec;

            // 벽 파괴 미사일 체크
            if (state.abilities.missileWallBreakUnlocked) {
                const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
                if (chunk && chunk.maze) {
                    const tx = Math.floor(m.pos.x);
                    const ty = Math.floor(m.pos.y);
                    const maze = chunk.maze;
                    const size = CONFIG.MAZE_SIZE;
                    if (tx >= 0 && tx < size && ty >= 0 && ty < size) {
                        const wallVal = maze[ty][tx];
                        if (wallVal > 0 && isBreakableWallTile(tx, ty)) {
                            if (Math.random() < state.abilities.missileWallBreakProb) {
                                // 벽 파괴 (applyWallRub과 유사하게 처리하지만 즉시 파괴)
                                maze[ty][tx] = 0;
                                chunk.mazeTex = null;
                                addScore(10, getFloor());
                                tryDropHeartInCurrentChunk();
                                
                                // 파괴 이펙트
                                fxBurstMaze(tx + 0.5, ty + 0.5, {
                                    kind: 'spark',
                                    count: 12,
                                    color: 'rgba(200, 245, 255, 0.95)',
                                    lifeMs: 200,
                                    speed: 8.0,
                                    size: 0.02,
                                    glow: 20
                                });
                                // 미사일 소멸 여부는 선택사항인데, 여기선 관통하는 느낌으로 유지
                            }
                        }
                    }
                }
            }

            // 히트 판정
            let hit = false;
            if (state.boss.active) {
                const hx = targetX - m.pos.x;
                const hy = targetY - m.pos.y;
                const hitR = 1.5 + 0.18;
                if (hx * hx + hy * hy <= hitR * hitR) {
                    hit = true;
                }
            } else if (m.interceptTarget && m.interceptTarget.type === 'projectile') {
                // 추적자 미사일 요격
                const hx = targetX - m.pos.x;
                const hy = targetY - m.pos.y;
                const hitR = 0.1 + 0.18; // 추적자 미사일은 작음
                if (hx * hx + hy * hy <= hitR * hitR) {
                    // 추적자 미사일 제거
                    const projIdx = state.chaserProjectiles.indexOf(m.interceptTarget.proj);
                    if (projIdx >= 0) {
                        state.chaserProjectiles.splice(projIdx, 1);
                    }
                    // 3x3 범위 벽 파괴
                    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
                    if (chunk && chunk.maze) {
                        const centerX = Math.floor(targetX);
                        const centerY = Math.floor(targetY);
                        const maze = chunk.maze;
                        const size = CONFIG.MAZE_SIZE;
                        
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const tx = centerX + dx;
                                const ty = centerY + dy;
                                if (tx >= 0 && tx < size && ty >= 0 && ty < size) {
                                    const wallVal = maze[ty][tx];
                                    if (wallVal > 0 && isBreakableWallTile(tx, ty)) {
                                        maze[ty][tx] = 0;
                                        chunk.mazeTex = null;
                                        addScore(10, getFloor());
                                        
                                        // 파괴 이펙트
                                        fxBurstMaze(tx + 0.5, ty + 0.5, {
                                            kind: 'spark',
                                            count: 12,
                                            color: 'rgba(200, 245, 255, 0.95)',
                                            lifeMs: 200,
                                            speed: 8.0,
                                            size: 0.02,
                                            glow: 20
                                        });
                                    }
                                }
                            }
                        }
                    }
                    // 요격 이펙트
                    fxBurstMaze(targetX, targetY, {
                        kind: 'spark',
                        count: 30,
                        color: 'rgba(255, 200, 100, 0.95)',
                        lifeMs: 300,
                        speed: 10.0,
                        size: 0.04,
                        glow: 30
                    });
                    playSfx('resource/missile-explosion-168600.mp3', { volume: 0.75, rate: 1.0 });
                    state.missiles.splice(i, 1);
                    continue;
                }
            } else {
                // 추적자 또는 기본 타겟
                const hx = targetX - m.pos.x;
                const hy = targetY - m.pos.y;
                const hitR = CONFIG.CHASER_RADIUS + 0.18;
                if (hx * hx + hy * hy <= hitR * hitR) {
                    hit = true;
                }
            }
            
            if (hit) {
                state.missiles.splice(i, 1);
                onMissileHitTarget(m);
                continue;
            }

            // 제거
            if (
                m.pos.x < -2 || m.pos.x > CONFIG.MAZE_SIZE + 2 ||
                m.pos.y < -2 || m.pos.y > CONFIG.MAZE_SIZE + 2
            ) {
                state.missiles.splice(i, 1);
            }
        }
    }
}

function fireMissile() {
    const count = state.abilities.missileCount || 1;
    for (let i = 0; i < count; i++) {
        const delayMs = i * 200; // 0.2초 간격
        state.pendingMissileShots.push({ fireMs: state.nowMs + delayMs });
    }
}

function processPendingMissileShots() {
    if (!state.pendingMissileShots.length) return;

    for (let i = state.pendingMissileShots.length - 1; i >= 0; i--) {
        const s = state.pendingMissileShots[i];
        if (state.nowMs >= s.fireMs) {
            state.pendingMissileShots.splice(i, 1);
            actuallyFireOneMissile();
        }
    }
}

function actuallyFireOneMissile() {
    // 강화 화약 체크
    let isEnhanced = false;
    if (state.inventory.gunpowder > 0) {
        state.inventory.gunpowder -= 1;
        isEnhanced = true;
    }

    // 플레이어 -> 추격자 방향으로 초기 발사(이후엔 유도 로직이 계속 보정)
    // 보스전일 때는 보스 중앙(8.5, 8.5)을 향함
    // 요격미사일이면 추적자/추적자 미사일 중 가까운 대상 선택
    let targetX, targetY;
    if (state.boss.active) {
        targetX = 8.5;
        targetY = 8.5;
    } else if (state.abilities.interceptMissileUnlocked) {
        const px = state.player.mazePos.x;
        const py = state.player.mazePos.y;
        
        let bestTarget = null;
        let bestDist = Infinity;
        
        if (state.chaser.active && state.chaser.isPresentInMaze) {
            const dx = px - state.chaser.pos.x;
            const dy = py - state.chaser.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) {
                bestDist = dist;
                bestTarget = { x: state.chaser.pos.x, y: state.chaser.pos.y };
            }
        }
        
        for (const proj of state.chaserProjectiles) {
            const dx = px - proj.pos.x;
            const dy = py - proj.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) {
                bestDist = dist;
                bestTarget = { x: proj.pos.x, y: proj.pos.y };
            }
        }
        
        if (bestTarget) {
            targetX = bestTarget.x;
            targetY = bestTarget.y;
        } else {
            targetX = state.chaser.pos.x;
            targetY = state.chaser.pos.y;
        }
    } else {
        targetX = state.chaser.pos.x;
        targetY = state.chaser.pos.y;
    }

    const dx = targetX - state.player.mazePos.x;
    const dy = targetY - state.player.mazePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const vx = (dx / dist) * CONFIG.MISSILE_SPEED;
    const vy = (dy / dist) * CONFIG.MISSILE_SPEED;
    state.missiles.push({
        pos: { x: state.player.mazePos.x, y: state.player.mazePos.y },
        vel: { x: vx, y: vy },
        enhanced: isEnhanced,
    });

    // 발사 이펙트
    fxBurstMaze(state.player.mazePos.x, state.player.mazePos.y, {
        count: isEnhanced ? 35 : 22,
        color: isEnhanced ? 'rgba(255, 100, 0, 0.95)' : 'rgba(255,240,200,0.95)',
        lifeMs: 420,
        speed: 5.5,
        size: 0.09,
        cone: Math.PI / 2.4,
        dir: Math.atan2(vy, vx),
        drag: 0.94,
        glow: isEnhanced ? 40 : 22,
    });
    fxFlash(0.15);
    fxShake(isEnhanced ? 2.0 : 1.2);
}

function onMissileHitTarget(m) {
    const damage = CONFIG.MISSILE_DAMAGE * (m.enhanced ? CONFIG.GUNPOWDER_DAMAGE_MULT : 1);
    
    if (state.boss.active) {
        state.boss.hp -= damage;
        // 보스 타격 시 피가 튀고, 바닥에 낭자하게 남김
        bossHitBloodFx(damage);
        if (state.boss.hp <= 0) {
            state.boss.active = false;
            state.boss.lasers = []; // 레이저 즉시 제거
            state.boss.gridPatterns = []; // 격자 장판 즉시 제거
            state.ui.bossKills = Math.max(0, Math.floor(state.ui.bossKills ?? 0)) + 1;
            const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
            if (chunk) chunk.cleared = true;
            addScore(1000, getFloor());
            // 보스 처치 보상: 층수 x 3 코인
            const floor = getFloor();
            addCoins(floor * 3);

            // 보스방 종료 직후 추격자/추격자 미사일이 튀어나오는 현상 방지:
            // - 기존 발사체 제거
            // - 최소 5초 쿨다운 부여(다음 층 진입/상점 표시 구간 포함)
            state.chaserProjectiles = [];
            state.chaser.isPresentInMaze = false;
            state.chaser.lastShotMs = state.nowMs;
            state.chaser.bossCooldownUntilMs = state.nowMs + 5000;
            // entryScheduledUntilMs가 과거로 남아있으면 즉시 등장하므로, 쿨다운 이후로 밀어둠
            state.chaser.entryScheduledUntilMs = state.chaser.bossCooldownUntilMs;

            // 보스 클리어 후 다음 층(North)으로 자동 이동 예약
            const nextX = state.currentChunk.x;
            const nextY = state.currentChunk.y + 1;
            state.ui.pendingEnter = { x: nextX, y: nextY, entryDir: 'S' };

            // 보스 클리어 보상: 어빌리티 선택창 띄우기
            setTimeout(() => {
                openAbilityModal(getFloor());
            }, 1000); 

            // 보스 처치 이펙트
            fxBurstMaze(8.5, 8.5, {
                kind: 'spark',
                count: 100,
                color: 'rgba(255, 255, 255, 0.95)',
                lifeMs: 1500,
                speed: 20,
                size: 0.1,
                glow: 100
            });
        }
    } else {
        // 치명타 미사일: 추적자에게 대미지
        if (state.abilities.killMissileUnlocked) {
            state.chaser.hp = (state.chaser.hp || CONFIG.MISSILE_DAMAGE * 5) - damage;
            state.chaser.maxHp = state.chaser.maxHp || CONFIG.MISSILE_DAMAGE * 5;
            
            // 추적자 처치
            if (state.chaser.hp <= 0) {
                state.chaser.hp = 0;
                state.chaser.isPresentInMaze = false;
                state.chaser.deadUntilNextChunk = true;
                addScore(500, getFloor());
                // 폭발 효과
                fxBurstMaze(state.chaser.pos.x, state.chaser.pos.y, {
                    kind: 'spark',
                    count: 40,
                    color: 'rgba(255, 50, 50, 0.95)',
                    lifeMs: 600,
                    speed: 12,
                    glow: 40
                });
            } else {
                // 대미지 입었지만 살아있음 - 스턴 적용
                const stunMs = CONFIG.STUN_MS + (state.abilities.missileStunBonusMs || 0);
                state.chaser.stunUntilMs = Math.max(state.chaser.stunUntilMs, state.nowMs + stunMs);
            }
        } else {
            // 기존 스턴 로직
            const stunMs = CONFIG.STUN_MS + (state.abilities.missileStunBonusMs || 0);
            state.chaser.stunUntilMs = Math.max(state.chaser.stunUntilMs, state.nowMs + stunMs);
            // ... (슬로우 등 생략)
        }
    }

    // SFX: 폭발/터짐
    playSfx('resource/missile-explosion-168600.mp3', { volume: 0.85, rate: 1.0 });

    const tx = state.boss.active ? 8.5 : state.chaser.pos.x;
    const ty = state.boss.active ? 8.5 : state.chaser.pos.y;

    // 날카로운 피격감
    fxBurstMaze(tx, ty, {
        kind: 'spark',
        count: m.enhanced ? 50 : 28,
        color: m.enhanced ? 'rgba(255, 100, 0, 0.95)' : 'rgba(200, 245, 255, 0.95)',
        lifeMs: 260,
        speed: 14.0,
        size: 0.028,
        len: 1.25,
        cone: Math.PI * 2,
        drag: 0.84,
        glow: 34,
    });
    fxFlash(m.enhanced ? 0.4 : 0.28);
    fxShake(m.enhanced ? 3.5 : 2.5);
    updateUI();
}

function applyMovementWithSliding(vx, vy, inputIntensity = 1.0, dt = 16) {
    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    const maze = chunk.maze;
    const r = CONFIG.PLAYER_RADIUS;
    const intensity = Math.max(0, Math.min(1, inputIntensity));
    // 가까운 구간에서 더 오래 작게 유지되도록 비선형(가속) 커브 적용
    const t = Math.pow(intensity, 2.2);
    // 벽을 "부수는" 배수: 마우스-말판 거리 기반 (최소 0.5배 ~ 최대 1.5배)
    const breakMult = 0.2 + 1.8 * intensity; // intensity: 0..1 => 0.2..2.0

    // X축 이동 및 충돌
    let nextX = state.player.mazePos.x + vx;
    const collidedX = checkWallCollision(nextX, state.player.mazePos.y, r, maze);
    if (!collidedX) {
        state.player.mazePos.x = nextX;
    } else {
        // 마찰 사운드: 충돌 중으로 표시(강도는 intensity로 조절)
        state.audio.wallRubContactThisFrame = true;
        state.audio.wallRubIntensityThisFrame = Math.max(state.audio.wallRubIntensityThisFrame || 0, intensity);

        // 벽 스칠 때 "날카로운 불꽃 스파크"
        if (intensity > 0.06) {
            // 문대기 누적: 목표 위치(nextX)를 기준으로 주변 타일 탐색하여 정확한 마찰 적용
            const addMs = Math.min(dt, 80) * breakMult;
            applyWallRubToCollidingTiles(state.player.mazePos.x, state.player.mazePos.y, r, maze, chunk, addMs, nextX, state.player.mazePos.y);

            const sx = state.player.mazePos.x + Math.sign(vx) * (r + 0.05);
            const sy = state.player.mazePos.y;
            const baseDir = Math.atan2(vy, vx) + Math.PI;
        fxBurstMaze(sx, sy, {
            kind: 'spark',
            count: Math.max(1, Math.round(12 * t)),
            color: 'rgba(120, 200, 255, 0.95)',
            lifeMs: 240,
            speed: 10.5 * (0.35 + 0.65 * t),
            size: 0.030 * (0.18 + 0.82 * t),
            len: 1.05 * (0.18 + 0.82 * t),
            cone: Math.PI / 3.2,
            dir: baseDir,
            drag: 0.86,
            glow: 28 * (0.18 + 0.82 * t),
        });
        // 잔불(작은 불씨)
        fxBurstMaze(sx, sy, {
            kind: 'dot',
            count: Math.max(0, Math.round(6 * t)),
            color: 'rgba(60, 255, 240, 0.55)',
            lifeMs: 420,
            speed: 3.2 * (0.55 + 0.45 * t),
            size: 0.05 * (0.18 + 0.82 * t),
            cone: Math.PI / 2.5,
            dir: baseDir,
            drag: 0.92,
            glow: 18 * (0.18 + 0.82 * t),
        });
        fxShake(0.8 * t);
        }
    }

    // Y축 이동 및 충돌
    let nextY = state.player.mazePos.y + vy;
    const collidedY = checkWallCollision(state.player.mazePos.x, nextY, r, maze);
    if (!collidedY) {
        state.player.mazePos.y = nextY;
    } else {
        // 마찰 사운드: 충돌 중으로 표시(강도는 intensity로 조절)
        state.audio.wallRubContactThisFrame = true;
        state.audio.wallRubIntensityThisFrame = Math.max(state.audio.wallRubIntensityThisFrame || 0, intensity);

        if (intensity > 0.06) {
            const addMs = Math.min(dt, 80) * breakMult;
            applyWallRubToCollidingTiles(state.player.mazePos.x, state.player.mazePos.y, r, maze, chunk, addMs, state.player.mazePos.x, nextY);

            const sx = state.player.mazePos.x;
            const sy = state.player.mazePos.y + Math.sign(vy) * (r + 0.05);
            const baseDir = Math.atan2(vy, vx) + Math.PI;
        fxBurstMaze(sx, sy, {
            kind: 'spark',
            count: Math.max(1, Math.round(12 * t)),
            color: 'rgba(120, 200, 255, 0.95)',
            lifeMs: 240,
            speed: 10.5 * (0.35 + 0.65 * t),
            size: 0.030 * (0.18 + 0.82 * t),
            len: 1.05 * (0.18 + 0.82 * t),
            cone: Math.PI / 3.2,
            dir: baseDir,
            drag: 0.86,
            glow: 28 * (0.18 + 0.82 * t),
        });
        fxBurstMaze(sx, sy, {
            kind: 'dot',
            count: Math.max(0, Math.round(6 * t)),
            color: 'rgba(60, 255, 240, 0.55)',
            lifeMs: 420,
            speed: 3.2 * (0.55 + 0.45 * t),
            size: 0.05 * (0.18 + 0.82 * t),
            cone: Math.PI / 2.5,
            dir: baseDir,
            drag: 0.92,
            glow: 18 * (0.18 + 0.82 * t),
        });
        fxShake(0.8 * t);
        }
    }

    checkExits();
}

function checkWallCollision(px, py, r, maze) {
    // 원(플레이어) vs 타일(벽) 충돌: 실제로 겹칠 때만 충돌로 봅니다.
    const size = CONFIG.MAZE_SIZE;
    const xStart = Math.floor(px - r);
    const xEnd = Math.floor(px + r);
    const yStart = Math.floor(py - r);
    const yEnd = Math.floor(py + r);

    for (let ty = yStart; ty <= yEnd; ty++) {
        for (let tx = xStart; tx <= xEnd; tx++) {
            if (tx < 0 || tx >= size || ty < 0 || ty >= size) continue; // 미로 밖은 출구 영역(충돌 없음)
            if (maze[ty][tx] <= 0) continue;

            // 타일 사각형 [tx, tx+1] x [ty, ty+1] 에 대한 원 충돌
            const closestX = clamp(px, tx, tx + 1);
            const closestY = clamp(py, ty, ty + 1);
            const dx = px - closestX;
            const dy = py - closestY;
            if (dx * dx + dy * dy < r * r) return true;
        }
    }
    return false;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function getFloor() {
    // 1층부터 표기
    return (state.currentChunk?.y ?? 0) + 1;
}

function openWallBreakNoticeModal() {
    const modal = document.getElementById('wallbreak-notice-modal');
    const textEl = document.getElementById('wallbreak-notice-text');
    const closeBtn = document.getElementById('wallbreak-notice-close');
    if (!modal || !textEl || !closeBtn) return;
    
    textEl.textContent = '10층 도달: 벽부수기 능력을 자동으로 습득했습니다.';
    modal.classList.remove('hidden');
    
    // 확인 버튼 클릭 시 모달 닫기
    const closeHandler = () => {
        modal.classList.add('hidden');
        closeBtn.removeEventListener('click', closeHandler);
    };
    closeBtn.addEventListener('click', closeHandler);
    
    // ESC 키로도 닫기
    const escHandler = (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeHandler();
            window.removeEventListener('keydown', escHandler);
        }
    };
    window.addEventListener('keydown', escHandler);
}

function ensureAutoAbilitiesForFloor(floor) {
    // 10층부터 벽부수기 자동 습득
    if (floor >= 10 && !state.abilities.wallBreakUnlocked) {
        state.abilities.wallBreakUnlocked = true;
        // 별도 모달로 표시 (스테이터스 창 대신)
        openWallBreakNoticeModal();
    }
}

/**
 * 특정 층에서의 벽 레벨 분포를 결정합니다.
 * @returns { { baseLevel: number, nextLevel: number, nextProb: number } } 
 * baseLevel: 기본 벽 레벨(index), nextLevel: 새로 등장하는 벽 레벨(index), nextProb: 새 벽의 등장 확률(0~1)
 */
function getWallLevelDistribution(floor) {
    let baseLevel = 0;
    let currentFloorThreshold = 1;

    for (let i = 1; i < CONFIG.WALL_LEVELS.length; i++) {
        const lvDef = CONFIG.WALL_LEVELS[i];
        const prevLvDef = CONFIG.WALL_LEVELS[i - 1];
        
        // 이전 레벨이 100%가 된 층 + 10층부터 새 레벨이 나타나기 시작
        // 요구사항: 파랑(레벨 1)은 21층 이후부터 등장
        const startAppearingFloor = currentFloorThreshold + (i === 1 ? 20 : 10);
        
        if (floor < startAppearingFloor) {
            // 아직 새 레벨이 등장하기 전임. 현재 baseLevel이 100%
            return { baseLevel, nextLevel: baseLevel, nextProb: 0 };
        }

        const steps = Math.floor((floor - startAppearingFloor) / 10) + 1;
        const prob = steps * lvDef.startProb;

        if (prob < 1.0) {
            // 새 레벨이 섞여 나오는 중
            return { baseLevel, nextLevel: i, nextProb: prob };
        }

        // 새 레벨이 100%가 됨. 다음 레벨 체크를 위해 업데이트
        baseLevel = i;
        // 이 레벨이 100%가 된 시점의 층수를 계산하여 threshold 업데이트
        const stepsTo100 = Math.ceil(1.0 / lvDef.startProb);
        currentFloorThreshold = startAppearingFloor + (stepsTo100 - 1) * 10;
        
        if (floor <= currentFloorThreshold) {
            return { baseLevel, nextLevel: i, nextProb: 0 };
        }
    }

    // 모든 레벨을 다 돌았으면 마지막 레벨 유지
    return { baseLevel: CONFIG.WALL_LEVELS.length - 1, nextLevel: CONFIG.WALL_LEVELS.length - 1, nextProb: 0 };
}

function getScoreMultiplierForFloor(floor) {
    // 10층 단위로 배수 2배: 1~9 => x1, 10~19 => x2, 20~29 => x4 ...
    return 2 ** Math.floor(floor / 10);
}

function addScorePopup(value, isPositive = true) {
    if (!state.fx.scorePopups) state.fx.scorePopups = [];
    state.fx.scorePopups.push({
        x: state.player.mazePos.x,
        y: state.player.mazePos.y,
        value: value,
        isPositive: isPositive,
        lifeMs: 1500,
        bornMs: state.nowMs,
        velY: -0.08, // 위로 떠오르는 속도
    });
    // 최대 10개까지만 유지
    if (state.fx.scorePopups.length > 10) {
        state.fx.scorePopups.shift();
    }
}

function addScore(base, floor = getFloor()) {
    const m = getScoreMultiplierForFloor(floor);
    const actualGain = base * m;
    state.score = Math.max(0, state.score + actualGain);
    // 점수 증감 팝업 표시 (0이 아닐 때만)
    if (actualGain > 0 && Math.floor(actualGain) > 0) {
        addScorePopup(`+${Math.floor(actualGain)}`, true);
    }
}

function subScore(base, floor = getFloor()) {
    const m = getScoreMultiplierForFloor(floor);
    const actualLoss = base * m;
    state.score = Math.max(0, state.score - actualLoss);
    // 점수 감소 팝업 표시 (0이 아닐 때만)
    if (actualLoss > 0 && Math.floor(actualLoss) > 0) {
        addScorePopup(`-${Math.floor(actualLoss)}`, false);
    }
}

function checkExits() {
    const p = state.player.mazePos;
    // 중심 좌표 기준: 유효 영역은 (0~size)이며 타일 중심은 0.5~size-0.5
    if (p.y < 0) exitMaze(0, 1); // North (Y 증가가 북쪽)
    else if (p.y > CONFIG.MAZE_SIZE) {
        // 남쪽으로 이동 가능 (아래로 진행)
        exitMaze(0, -1);
    }
    else if (p.x < 0) {
        // 맨 왼쪽 청크는 서쪽 막힘
        if (state.currentChunk.x === 0) state.player.mazePos.x = 0.5;
        else exitMaze(-1, 0);
    } else if (p.x > CONFIG.MAZE_SIZE) {
        // 맨 오른쪽 청크는 동쪽 막힘
        if (state.currentChunk.x === CONFIG.CHUNK_COLS - 1) state.player.mazePos.x = CONFIG.MAZE_SIZE - 0.5;
        else exitMaze(1, 0);
    }
}

function exitMaze(dx, dy) {
    // 전환 중이거나 이미 예약된 이동이 있으면 중복 진입 방지
    if (state.transition?.active || state.ui.pendingEnter) return;

    // 보스전 진행 중에는 나갈 수 없음
    if (state.boss.active) return;

    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    chunk.cleared = true;

    // 추격자는 이전 청크에 남아있음 (플레이어가 청크를 넘어가도 추격자는 이전 청크에 유지)
    // 추격자가 플레이어를 따라오려면 추격자도 같은 방향으로 청크를 넘어가야 함
    // 하지만 플레이어가 청크를 넘어갈 때 추격자는 이전 청크에 남아있도록 함
    // 추격자가 있는 청크는 별도로 업데이트되어야 함

    // 안전장치: 좌/우 끝 청크는 바깥으로 이동 금지
    if (dx === -1 && state.currentChunk.x === 0) return;
    if (dx === 1 && state.currentChunk.x === CONFIG.CHUNK_COLS - 1) return;
    // 남쪽(아래)로 이동 가능 (제한 제거)

    // 다음 청크 좌표 계산(정수)
    const prevWorldY = Math.round(state.player.worldPos.y);
    const nextX = Math.max(0, Math.min(CONFIG.CHUNK_COLS - 1, Math.round(state.player.worldPos.x) + dx));
    const nextY = Math.max(0, Math.round(state.player.worldPos.y) + dy); // y<0 금지

    // 점수: 층수가 올라갈 때마다 +100 (층수 배수 적용)
    if (nextY > prevWorldY) {
        const newFloor = nextY + 1;
        addScore(100, newFloor);
        onFloorPassed();
    }

    // 이동 방향의 "반대편" 입구로 다음 청크에 들어가야 함
    // 예: 서쪽으로 나감(dx=-1) -> 다음 청크는 동쪽(E)에서 들어감
    let entryDir = 'S';
    if (dx === -1 && dy === 0) entryDir = 'E';
    else if (dx === 1 && dy === 0) entryDir = 'W';
    else if (dx === 0 && dy === 1) entryDir = 'S';   // 북쪽으로 이동 -> 다음 청크는 남쪽에서 진입
    else if (dx === 0 && dy === -1) entryDir = 'N';  // 남쪽으로 이동 -> 다음 청크는 북쪽에서 진입

    state.nextEntryDir = entryDir;

    // 청크 넘어갈 때마다 추격자는 가속(누적) - 추격자가 활성화된 이후에만
    if (state.chaser.active) {
        state.chaser.speedMult = Math.min(CONFIG.CHASER_MAX_SPEED_MULT, state.chaser.speedMult + CONFIG.CHASER_SPEEDUP_PER_CHUNK);
    }

    // 다음 청크가 없으면 생성 후 바로 그 청크의 미로로 자동 진입
    const key = getChunkKey(nextX, nextY);
    if (!state.chunks.has(key)) state.chunks.set(key, new Chunk(nextX, nextY));

    // 10층마다 어빌리티 선택창(중복 방지) - 선택 후 다음 청크로 진입
    const floor = nextY + 1;
    ensureAutoAbilitiesForFloor(floor);
    if (floor % 10 === 0 && !state.ui.abilityShownFloors.has(floor)) {
        state.ui.abilityShownFloors.add(floor);
        state.ui.pendingEnter = { x: nextX, y: nextY, entryDir };
        openAbilityModal(floor);
        return;
    }

    // 즉시 진입 대신 스와이프 전환 시작 → 전환 종료 시 enterMaze 호출
    startChunkSwipeTransition({ dx, dy, nextX, nextY, entryDir });
}

function computeChaserRespawnDelayMsFromExit(chunk, dx, dy) {
    const MIN_MS = 1000;
    const MAX_MS = 5000;
    // 추격자가 아직 등장하지 않은 상태라면 최대치(5초)
    if (!state.chaser.isPresentInMaze) return MAX_MS;
    if (!chunk?.maze) return MAX_MS;

    // 출구 위치(플레이어가 나간 방향 기준)를 타일로 변환
    const exitPos = getExitEdgePos(dx, dy);
    const gx = Math.floor(exitPos.x);
    const gy = Math.floor(exitPos.y);

    // 추격자 현재 타일
    const sx = Math.floor(state.chaser.pos.x);
    const sy = Math.floor(state.chaser.pos.y);

    const start = findNearestOpenCell(chunk.maze, sx, sy) || { x: sx, y: sy };
    const goal = findNearestOpenCell(chunk.maze, gx, gy) || { x: gx, y: gy };
    const path = bfsPath(chunk.maze, start, goal);
    const dist = (path && path.length) ? Math.max(0, path.length - 1) : null;
    if (dist == null) return MAX_MS;

    // 거리→시간 매핑: 가까울수록 빠르게(최소 1초), 멀수록 느리게(최대 5초)
    // 20칸 이상이면 5초로 클램프
    const t = Math.max(0, Math.min(1, dist / 20));
    return Math.round(MIN_MS + (MAX_MS - MIN_MS) * t);
}

function onFloorPassed() {
    const a = state.abilities || {};
    // 적금: N층 통과마다 +10, 받을 때마다 N-1 (최소 1)
    if (a.bankSaving?.enabled) {
        a.bankSaving.progress = (a.bankSaving.progress || 0) + 1;
        const need = Math.max(1, Math.floor(a.bankSaving.targetFloors || 5));
        if (a.bankSaving.progress >= need) {
            a.bankSaving.progress = 0;
            a.bankSaving.targetFloors = Math.max(1, need - 1);
            addCoinsSigned(10);
        }
    }
    // 생활비 대출: graceFloors 감소
    if (a.livingLoan?.debt > 0 && (a.livingLoan.graceFloors || 0) > 0) {
        a.livingLoan.graceFloors = Math.max(0, (a.livingLoan.graceFloors || 0) - 1);
    }
}

// --- 렌더링 ---
function draw() {
    // 1. DPR 변환 초기화 후 물리 픽셀 단위로 전체 배경 클리어
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0a0a'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. 다시 DPR 스케일 적용하여 논리 좌표계로 드로잉
    const dpr = state.view.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (state.mode === 'WORLD') drawWorld();
    else drawMaze();

    // 마찰열 연출 (1.5초 이상 문대면 화면이 점점 빨개짐)
    if (state.mode === 'MAZE' && state.fx.wallRubHeatMs > 1500) {
        const heat = state.fx.wallRubHeatMs;
        const target = state.fx.wallRubTargetMs;
        // 1.5s ~ 파괴직전(target) 구간에서 0..1로 변화
        const range = Math.max(500, target - 1500);
        const t = Math.max(0, Math.min(1, (heat - 1500) / range));
        
        ctx.save();
        // 비네팅(가장자리) 스타일의 흰색 오버레이
        const grad = ctx.createRadialGradient(
            state.view.w / 2, state.view.h / 2, state.view.h * 0.2,
            state.view.w / 2, state.view.h / 2, Math.max(state.view.w, state.view.h) * 0.7
        );
        grad.addColorStop(0, `rgba(255, 255, 255, 0)`);
        grad.addColorStop(1, `rgba(255, 255, 255, ${t * 0.25})`); 
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, state.view.w, state.view.h);
        
        // 화면 전체에 아주 옅은 흰색 필터
        if (t > 0.5) {
            const innerT = (t - 0.5) * 2; 
            ctx.fillStyle = `rgba(255, 255, 255, ${innerT * 0.06})`;
            ctx.fillRect(0, 0, state.view.w, state.view.h);
        }
        ctx.restore();
    }

    if (state.mode === 'MAZE') {
        const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
        if (chunk && chunk.brokenWalls) {
            const cellSize = Math.min(state.view.w, state.view.h) / CONFIG.MAZE_SIZE * 0.9;
            const offsetX = state.view.w / 2 - (cellSize * CONFIG.MAZE_SIZE) / 2;
            const offsetY = state.view.h / 2 - (cellSize * CONFIG.MAZE_SIZE) / 2;
            
            // 부서진 벽 이미지 사용 가능 여부 확인
            const useBrokeImages = WALL_BROKE_IMGS[0].complete && WALL_BROKE_IMGS[0].naturalWidth > 0;
            
            for (const [key, info] of chunk.brokenWalls.entries()) {
                const [tx, ty] = key.split(',').map(Number);
                const remain = CONFIG.WALL_REGEN_MS - (state.nowMs - info.time);
                
                ctx.save();
                
                if (useBrokeImages) {
                    // 부서진 벽 이미지 랜덤 선택
                    const brokeIdx = (tx * 31 + ty * 17) % WALL_BROKE_IMGS.length;
                    const brokeImg = WALL_BROKE_IMGS[brokeIdx];
                    if (brokeImg.complete && brokeImg.naturalWidth > 0) {
                        const alpha = remain < 3000 ? (0.3 + 0.7 * Math.abs(Math.sin(state.nowMs * (0.01 + (3000-remain)*0.00005)))) : 0.4;
                        ctx.globalAlpha = alpha;
                        ctx.drawImage(brokeImg, offsetX + tx * cellSize, offsetY + ty * cellSize, cellSize, cellSize);
                    } else {
                        // 폴백: 기존 방식
                        const color = CONFIG.WALL_LEVELS[(info.val === 100 ? 0 : info.val - 1)]?.color || [100, 100, 100];
                        const alpha = remain < 3000 ? (0.3 + 0.7 * Math.abs(Math.sin(state.nowMs * (0.01 + (3000-remain)*0.00005)))) : 0.4;
                        ctx.globalAlpha = alpha;
                        ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
                        ctx.fillRect(offsetX + tx * cellSize + cellSize*0.2, offsetY + ty * cellSize + cellSize*0.2, cellSize*0.6, cellSize*0.6);
                    }
                } else {
                    // 폴백: 기존 방식
                    const color = CONFIG.WALL_LEVELS[(info.val === 100 ? 0 : info.val - 1)]?.color || [100, 100, 100];
                    const alpha = remain < 3000 ? (0.3 + 0.7 * Math.abs(Math.sin(state.nowMs * (0.01 + (3000-remain)*0.00005)))) : 0.4;
                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
                    ctx.fillRect(offsetX + tx * cellSize + cellSize*0.2, offsetY + ty * cellSize + cellSize*0.2, cellSize*0.6, cellSize*0.6);
                }
                
                ctx.restore();
            }
        }
    }

    drawHUD();
}

function drawHUD() {
    // 좌상단 상태 패널(상시 유지)
    ctx.save();
    ctx.setTransform(state.view.dpr, 0, 0, state.view.dpr, 0, 0);
    ctx.globalAlpha = 0.95;

    const iconR = 8; 
    const segS = 0.8; 
    const digitH = 18 * segS;
    const rowH = 24;
    const pad = 12;
    const innerGap = 10;

    const floor = getFloor();
    const coins = state.coins ?? 0;
    const missiles = state.inventory?.missiles ?? 0;
    const gunpowder = state.inventory?.gunpowder ?? 0;
    
    const wCoins = measureSevenSegNumberWidth(coins, segS);
    const wMsl = measureSevenSegNumberWidth(missiles, segS);
    const wGpw = measureSevenSegNumberWidth(gunpowder, segS);
    const wFloor = measureSevenSegNumberWidth(floor, segS);
    
    const maxTextW = Math.max(wCoins, wMsl, wGpw, wFloor);
    const leftW = iconR * 2 + innerGap + maxTextW;
    const mini = Math.max(72, Math.min(110, Math.floor(Math.min(state.view.w, state.view.h) * 0.16)));
    const bw = pad * 2 + leftW + innerGap + mini;
    const bh = Math.max(rowH * 4 + pad, pad * 2 + mini);

    const rx = 20;
    const ry = 20;
    const rd = 8;

    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.roundRect(rx, ry, bw, bh, rd);
    ctx.fillStyle = 'rgba(20, 20, 25, 0.88)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const contentLeft = rx + pad;
    const iconX = contentLeft + iconR;
    const textX = iconX + iconR + innerGap;

    // 1행: 층수
    const row1Y = ry + pad/2 + rowH * 0.5;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('F', iconX, row1Y + 4);
    drawSevenSegNumber(ctx, textX, row1Y - digitH / 2, floor, segS, 'rgba(200,255,200,0.95)', 1);

    // 2행: 코인
    const row2Y = ry + pad/2 + rowH * 1.5;
    drawCoinIcon(ctx, iconX, row2Y, iconR, 1);
    drawSevenSegNumber(ctx, textX, row2Y - digitH / 2, coins, segS, 'rgba(255,230,140,0.95)', 1);

    // 3행: 미사일
    const row3Y = ry + pad/2 + rowH * 2.5;
    drawMissileIcon(ctx, iconX, row3Y, iconR, 1);
    drawSevenSegNumber(ctx, textX, row3Y - digitH / 2, missiles, segS, 'rgba(180,245,255,0.95)', 1);

    // 4행: 화약
    const row4Y = ry + pad/2 + rowH * 3.5;
    drawGunpowderIcon(ctx, iconX, row4Y, iconR, 1);
    drawSevenSegNumber(ctx, textX, row4Y - digitH / 2, gunpowder, segS, 'rgba(160,160,160,0.95)', 1);

    // 미니맵(좌상단 패널 내부)
    const mx = contentLeft + leftW + innerGap;
    const my = ry + pad;
    drawMiniMap(mx, my, mini, mini);

    ctx.restore();

    const maxLives = Math.max(0, state.abilities?.maxLives ?? 3);
    // 모바일 버그 수정: lives 값을 명시적으로 Number로 변환하여 정확히 읽기
    const lives = Math.max(0, Math.min(maxLives, Number(state.player.lives) || 0));

    // 오른쪽 위: 목숨 표시 (최대 목숨만큼 하트 슬롯 표시)
    // 화면이 좁아도 잘 보이도록 자동 줄바꿈
    const heartX = state.view.w - 20;
    const heartY = 20;
    const stepX = 28;
    const stepY = 26;
    const perRow = Math.max(1, Math.floor((state.view.w - 40) / stepX));

    ctx.font = '24px Arial';
    ctx.textAlign = 'right';
    for (let i = 0; i < maxLives; i++) {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        ctx.fillStyle = i < lives ? '#ff4444' : '#333';
        ctx.fillText('❤', heartX - col * stepX, heartY + row * stepY);
    }

    // 보스전 체력바
    if (state.boss.active) {
        const bw = state.view.w * 0.6;
        const bh = 14;
        const bx = state.view.w / 2 - bw / 2;
        const by = 60;
        
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        const hpPct = Math.max(0, state.boss.hp / state.boss.maxHp);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(bx, by, bw * hpPct, bh);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(bx, by, bw, bh);
        
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS HP', state.view.w/2, by + 11);
    }

    // 12시 방향: 점수 표시 (화려한 이펙트)
    ctx.save();
    ctx.setTransform(state.view.dpr, 0, 0, state.view.dpr, 0, 0);
    const scoreX = state.view.w / 2;
    const scoreY = 30;
    const score = Math.max(0, Math.floor(state.score ?? 0));
    
    // 점수 변화 애니메이션 (상승/하강)
    if (!state.ui.scoreDisplayY) state.ui.scoreDisplayY = scoreY;
    if (!state.ui.lastScore) state.ui.lastScore = score;
    const scoreDiff = score - state.ui.lastScore;
    if (Math.abs(scoreDiff) > 0.1) {
        // 점수가 증가하면 위로, 감소하면 아래로
        state.ui.scoreDisplayY = Math.max(scoreY - 15, Math.min(scoreY + 15, state.ui.scoreDisplayY - scoreDiff * 0.5));
        state.ui.lastScore = score;
    } else {
        // 원래 위치로 복귀
        const targetY = scoreY;
        state.ui.scoreDisplayY += (targetY - state.ui.scoreDisplayY) * 0.15;
    }
    
    // 배경 글로우 효과
    ctx.shadowBlur = 30;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    
    // 멋진 폰트로 점수 표시
    ctx.font = 'bold 32px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 그라데이션 효과
    const gradient = ctx.createLinearGradient(scoreX - 100, state.ui.scoreDisplayY - 20, scoreX + 100, state.ui.scoreDisplayY + 20);
    gradient.addColorStop(0, '#FFD700'); // 금색
    gradient.addColorStop(0.5, '#FFA500'); // 주황색
    gradient.addColorStop(1, '#FF6347'); // 토마토색
    ctx.fillStyle = gradient;
    
    // 외곽선
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText(score.toLocaleString(), scoreX, state.ui.scoreDisplayY);
    ctx.fillText(score.toLocaleString(), scoreX, state.ui.scoreDisplayY);
    
    // "SCORE" 레이블
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeText('SCORE', scoreX, state.ui.scoreDisplayY - 25);
    ctx.fillText('SCORE', scoreX, state.ui.scoreDisplayY - 25);
    
    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawMiniMap(x, y, w, h) {
    // 월드 청크 미니맵: 주변 청크를 작게 표시
    const cols = CONFIG.CHUNK_COLS;
    const cx = Math.round(state.player.worldPos.x);
    const cy = Math.round(state.player.worldPos.y);
    const rangeY = 2; // 위/아래 2칸 => 5줄
    const rows = rangeY * 2 + 1;

    const cellW = w / cols;
    const cellH = h / rows;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    for (let ry = 0; ry < rows; ry++) {
        const wy = cy + (rangeY - ry);
        if (wy < 0) continue;
        for (let wx = 0; wx < cols; wx++) {
            const k = getChunkKey(wx, wy);
            const ch = state.chunks.get(k);
            const isBoss = ((wy + 1) % 20 === 0);

            let fill = 'rgba(40,40,40,0.7)';
            if (!ch) fill = 'rgba(0,0,0,0.55)';
            else if (ch.cleared) fill = 'rgba(26,75,26,0.75)';
            else fill = isBoss ? 'rgba(120,30,30,0.70)' : 'rgba(60,60,65,0.75)';

            const px = x + wx * cellW;
            const py = y + ry * cellH;
            ctx.fillStyle = fill;
            ctx.fillRect(px + 1, py + 1, cellW - 2, cellH - 2);

            // 현재 위치 강조
            if (wx === cx && wy === cy) {
                ctx.strokeStyle = 'rgba(0,255,255,0.95)';
                ctx.lineWidth = 2;
                ctx.strokeRect(px + 1.5, py + 1.5, cellW - 3, cellH - 3);
            }
        }
    }

    ctx.restore();
}

function drawChunkMapOverlay() {
    ctx.save();

    // 반투명 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, state.view.w, state.view.h);

    // 현재 위치(현재 청크)가 화면 정중앙에 오도록 임시 카메라로 월드맵 렌더링
    const cy = state.currentChunk.y;
    const centeredCameraY = (cy + 0.5) * CONFIG.CHUNK_SIZE - state.view.h / 2;
    drawWorld(centeredCameraY, { showMouseLine: false, showPlayer: true });

    // 상단 안내 텍스트
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '16px Arial';
    ctx.fillText('청크 맵 (Tab 누르는 동안 표시)', 30, 40);

    ctx.restore();
}

function drawWorld(cameraY = state.cameraY, opts = {}) {
    const { showMouseLine = true, showPlayer = true } = opts;
    // DPR 대응: 실제 canvas.width는 물리 픽셀이라, 레이아웃은 논리 픽셀 기준(state.view) 사용
    const viewW = state.view.w;
    const viewH = state.view.h;
    const offsetX = viewW / 2 - (CONFIG.CHUNK_COLS * CONFIG.CHUNK_SIZE) / 2;
    
    // 배경 그리드
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for(let i=0; i<=CONFIG.CHUNK_COLS; i++) {
        const x = offsetX + i * CONFIG.CHUNK_SIZE;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, viewH); ctx.stroke();
    }

    state.chunks.forEach(chunk => {
        const screenX = offsetX + chunk.x * CONFIG.CHUNK_SIZE;
        const screenY = viewH - (chunk.y * CONFIG.CHUNK_SIZE - cameraY + CONFIG.CHUNK_SIZE);
        
        if (screenY + CONFIG.CHUNK_SIZE < -100 || screenY > viewH + 100) return;

        // 청크 상자
        ctx.fillStyle = chunk.cleared ? '#1a331a' : '#1a1a1a';
        ctx.fillRect(screenX + 5, screenY + 5, CONFIG.CHUNK_SIZE - 10, CONFIG.CHUNK_SIZE - 10);
        
        ctx.strokeStyle = (state.currentChunk.x === chunk.x && state.currentChunk.y === chunk.y) ? '#00ffff' : '#444';
        ctx.lineWidth = (state.currentChunk.x === chunk.x && state.currentChunk.y === chunk.y) ? 3 : 1;
        ctx.strokeRect(screenX + 5, screenY + 5, CONFIG.CHUNK_SIZE - 10, CONFIG.CHUNK_SIZE - 10);
        
        // (삭제) 청크 좌표 텍스트
    });

    if (showPlayer) {
        // 플레이어 (월드 맵)
        const pX = offsetX + state.player.worldPos.x * CONFIG.CHUNK_SIZE + CONFIG.CHUNK_SIZE / 2;
        const pY = viewH - (state.player.worldPos.y * CONFIG.CHUNK_SIZE - cameraY + CONFIG.CHUNK_SIZE / 2);
        
        // 마우스 가이드 라인 (조작 활성화 시)
        // 오버레이(탭 맵)에서는 인게임 가이드 라인을 그리지 않음
        if (showMouseLine) {
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(pX, pY);
            ctx.lineTo(state.mouse.x, state.mouse.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 나선환(에너지 오브) 플레이어 - 월드맵은 가볍게(low)
        drawSpiralPlayer(ctx, pX, pY, 10, state.nowMs, { quality: 'low', spin: 0.0012 });
    }
}

function drawMaze() {
    // 청크 스와이프 전환 중: 이전/다음 청크를 동시에 그려 슬라이드
    if (state.transition?.active && state.transition.fromChunk && state.transition.toChunk) {
        const cellSize = Math.min(state.view.w, state.view.h) / CONFIG.MAZE_SIZE * 0.9;
        const baseX = state.view.w / 2 - (cellSize * CONFIG.MAZE_SIZE) / 2;
        const baseY = state.view.h / 2 - (cellSize * CONFIG.MAZE_SIZE) / 2;
        const W = cellSize * CONFIG.MAZE_SIZE;
        const H = cellSize * CONFIG.MAZE_SIZE;
        const peek = Math.min(92, Math.max(34, cellSize * 2.2));
        const slideW = Math.max(1, W - peek);
        const slideH = Math.max(1, H - peek);

        // 배경(기존 drawMaze와 동일 톤)
        const outer = 14;
        const bgGrad = ctx.createLinearGradient(0, baseY - outer, 0, baseY + H + outer);
        bgGrad.addColorStop(0, '#0b0705');
        bgGrad.addColorStop(1, '#050302');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(baseX - outer, baseY - outer, W + outer * 2, H + outer * 2);

        const tr = state.transition;
        const tRaw = (state.nowMs - tr.startMs) / (tr.durMs || 260);
        const t = easeInOutCubic(tRaw);

        // 가로/세로 스와이프 방향 매핑:
        // dx: (플레이어 이동) 동쪽=+1이면 화면은 왼쪽으로(월드가 반대로 밀림)
        // dy: 코드상 북쪽 이동이 dy=+1인데, 화면 y는 아래로 증가하므로 별도 매핑
        // "인접 실루엣(peek)" 상태에서 자연스럽게 이어지도록, 이동 거리는 (W/H - peek)만큼만 사용
        const fromTx = -tr.dx * t * slideW;
        const toTx = tr.dx * (1 - t) * slideW;
        const fromTy = tr.dy * t * slideH;
        const toTy = -tr.dy * (1 - t) * slideH;

        const fromChunk = state.chunks.get(getChunkKey(tr.fromChunk.x, tr.fromChunk.y));
        const toChunk = state.chunks.get(getChunkKey(tr.toChunk.x, tr.toChunk.y));

        // terrain만 가볍게(전환은 짧게)
        if (fromChunk) {
            ctx.save();
            ctx.translate(fromTx, fromTy);
            // 미로 텍스처
            const tex = buildChunkMazeTexture(fromChunk);
            ctx.imageSmoothingEnabled = false;
            if (tex && typeof tex._pad === 'number') {
                ctx.drawImage(tex, tex._pad, tex._pad, tex._innerW, tex._innerH, baseX, baseY, W, H);
            } else {
                ctx.drawImage(tex, baseX, baseY, W, H);
            }
            ctx.imageSmoothingEnabled = true;
            ctx.restore();
        }
        if (toChunk) {
            ctx.save();
            ctx.translate(toTx, toTy);
            const tex = buildChunkMazeTexture(toChunk);
            ctx.imageSmoothingEnabled = false;
            if (tex && typeof tex._pad === 'number') {
                ctx.drawImage(tex, tex._pad, tex._pad, tex._innerW, tex._innerH, baseX, baseY, W, H);
            } else {
                ctx.drawImage(tex, baseX, baseY, W, H);
            }
            ctx.imageSmoothingEnabled = true;
            ctx.restore();
        }

        // 플레이어는 출구 위치 -> 다음 청크 스폰 위치로 자연스럽게 이동
        const fromPos = tr.fromPos || getExitEdgePos(tr.dx, tr.dy);
        const toPos = tr.toPos || getSpawnPosForEntry(tr.entryDir);

        const pFromX = (baseX + fromPos.x * cellSize) + fromTx;
        const pFromY = (baseY + fromPos.y * cellSize) + fromTy;
        const pToX = (baseX + toPos.x * cellSize) + toTx;
        const pToY = (baseY + toPos.y * cellSize) + toTy;

        const pX = lerp(pFromX, pToX, t);
        const pY = lerp(pFromY, pToY, t);
        drawSpiralPlayer(ctx, pX, pY, cellSize * CONFIG.PLAYER_RADIUS, state.nowMs, { quality: 'low', spin: 0.0016 });

        return;
    }

    const chunk = state.chunks.get(getChunkKey(state.currentChunk.x, state.currentChunk.y));
    const cellSize = Math.min(state.view.w, state.view.h) / CONFIG.MAZE_SIZE * 0.9;
    const offsetX = state.view.w / 2 - (cellSize * CONFIG.MAZE_SIZE) / 2;
    const offsetY = state.view.h / 2 - (cellSize * CONFIG.MAZE_SIZE) / 2;
    const W = cellSize * CONFIG.MAZE_SIZE;
    const H = cellSize * CONFIG.MAZE_SIZE;
    const peek = Math.min(92, Math.max(34, cellSize * 2.2));
    const slideW = Math.max(1, W - peek);
    const slideH = Math.max(1, H - peek);

    // 화면 흔들림(미로 내부 연출)
    let shakeX = 0, shakeY = 0;
    if (state.fx.shake.amp > 0.001) {
        const t = state.fx.shake.t + state.nowMs * 0.02;
        shakeX = Math.sin(t) * state.fx.shake.amp * 6;
        shakeY = Math.cos(t * 1.3) * state.fx.shake.amp * 6;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 미로 외곽 배경(흙/그라운드 느낌)
    const outer = 14;
    const bgGrad = ctx.createLinearGradient(0, offsetY - outer, 0, offsetY + cellSize * CONFIG.MAZE_SIZE + outer);
    bgGrad.addColorStop(0, '#0b0705');
    bgGrad.addColorStop(1, '#050302');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(offsetX - outer, offsetY - outer, cellSize * CONFIG.MAZE_SIZE + outer * 2, cellSize * CONFIG.MAZE_SIZE + outer * 2);

    // 청크 미로 텍스처(흙 언덕/흙길) 렌더
    const tex = buildChunkMazeTexture(chunk);
    // 마인크래프트 느낌: 확대/축소 시에도 픽셀 블록이 살아있게 smoothing OFF
    ctx.imageSmoothingEnabled = false;
    // tex에는 pad가 포함되어 있으므로, 타일 영역만 잘라서 그려야 타일/오버레이 정렬이 맞음
    if (tex && typeof tex._pad === 'number') {
        ctx.drawImage(
            tex,
            tex._pad, tex._pad,
            tex._innerW, tex._innerH,
            offsetX, offsetY,
            cellSize * CONFIG.MAZE_SIZE,
            cellSize * CONFIG.MAZE_SIZE
        );
    } else {
        // (예전 캐시 등) 메타가 없으면 전체를 그리되, 다음 프레임에 캐시가 재생성되면서 맞춰짐
        ctx.drawImage(
            tex,
            offsetX, offsetY,
            cellSize * CONFIG.MAZE_SIZE,
            cellSize * CONFIG.MAZE_SIZE
        );
    }
    // 이후 이펙트(원/글로우)는 부드럽게 보이도록 다시 ON
    ctx.imageSmoothingEnabled = true;

    // --- 인접 청크 실루엣(상/하/좌/우) ---
    // 현재 청크 주변 맵이 "살짝 보이는" 느낌을 위해, 가장자리 스트립만 낮은 알파/필터로 그립니다.
    const drawNeighborStrip = (nx, ny, dir) => {
        if (nx < 0 || nx >= CONFIG.CHUNK_COLS) return;
        if (ny < 0) return;
        const key = getChunkKey(nx, ny);
        if (!state.chunks.has(key)) state.chunks.set(key, new Chunk(nx, ny));
        const nChunk = state.chunks.get(key);
        if (!nChunk) return;
        const tex = buildChunkMazeTexture(nChunk);
        if (!tex) return;

        // src(텍스처 내부 타일 영역)
        const sx0 = (tex && typeof tex._pad === 'number') ? tex._pad : 0;
        const sy0 = (tex && typeof tex._pad === 'number') ? tex._pad : 0;
        const sw = (tex && typeof tex._innerW === 'number') ? tex._innerW : tex.width;
        const sh = (tex && typeof tex._innerH === 'number') ? tex._innerH : tex.height;

        // 스트립을 여러 슬라이스로 나눠 알파를 점진적으로 줄여 "실루엣 페이드" 구현
        const slices = 6;
        const aBase = 0.16;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // 실루엣 느낌: 채도 제거 + 어둡게
        ctx.filter = 'grayscale(1) brightness(0.55) contrast(1.08)';

        if (dir === 'L') {
            // 왼쪽: 이웃의 오른쪽 끝(W-peek..W)이 현재의 왼쪽(peek)에 보임
            for (let i = 0; i < slices; i++) {
                const t = i / (slices - 1);
                const alpha = aBase * (1 - t);
                const sliceW = peek / slices;
                const xLocal0 = i * sliceW;                 // 0..peek
                const neighLocal0 = (W - peek) + xLocal0;   // W-peek..W
                const sx = sx0 + (neighLocal0 / W) * sw;
                const sW = (sliceW / W) * sw;
                const dx = offsetX + xLocal0;
                const dW = sliceW;
                ctx.globalAlpha = alpha;
                ctx.drawImage(tex, sx, sy0, sW, sh, dx, offsetY, dW, H);
            }
        } else if (dir === 'R') {
            // 오른쪽: 이웃의 왼쪽(0..peek)이 현재의 오른쪽(peek)에 보임
            for (let i = 0; i < slices; i++) {
                const t = i / (slices - 1);
                const alpha = aBase * (1 - t);
                const sliceW = peek / slices;
                const xLocal0 = i * sliceW; // 0..peek
                const sx = sx0 + (xLocal0 / W) * sw;
                const sW = (sliceW / W) * sw;
                const dx = offsetX + (W - peek) + xLocal0;
                ctx.globalAlpha = alpha;
                ctx.drawImage(tex, sx, sy0, sW, sh, dx, offsetY, sliceW, H);
            }
        } else if (dir === 'U') {
            // 위쪽: 이웃의 아래쪽(H-peek..H)이 현재의 위쪽(peek)에 보임
            for (let i = 0; i < slices; i++) {
                const t = i / (slices - 1);
                const alpha = aBase * (1 - t);
                const sliceH = peek / slices;
                const yLocal0 = i * sliceH;
                const neighLocal0 = (H - peek) + yLocal0;
                const sy = sy0 + (neighLocal0 / H) * sh;
                const sH = (sliceH / H) * sh;
                const dy = offsetY + yLocal0;
                ctx.globalAlpha = alpha;
                ctx.drawImage(tex, sx0, sy, sw, sH, offsetX, dy, W, sliceH);
            }
        } else if (dir === 'D') {
            // 아래쪽: 이웃의 위쪽(0..peek)이 현재의 아래쪽(peek)에 보임
            for (let i = 0; i < slices; i++) {
                const t = i / (slices - 1);
                const alpha = aBase * (1 - t);
                const sliceH = peek / slices;
                const yLocal0 = i * sliceH;
                const sy = sy0 + (yLocal0 / H) * sh;
                const sH = (sliceH / H) * sh;
                const dy = offsetY + (H - peek) + yLocal0;
                ctx.globalAlpha = alpha;
                ctx.drawImage(tex, sx0, sy, sw, sH, offsetX, dy, W, sliceH);
            }
        }

        ctx.restore();
    };

    // 좌/우는 x-1, x+1. 상/하는 "북쪽이 y+1(위쪽 출구)" 규칙에 맞춰 위= y+1, 아래= y-1
    drawNeighborStrip(state.currentChunk.x - 1, state.currentChunk.y, 'L');
    drawNeighborStrip(state.currentChunk.x + 1, state.currentChunk.y, 'R');
    drawNeighborStrip(state.currentChunk.x, state.currentChunk.y + 1, 'U');
    drawNeighborStrip(state.currentChunk.x, state.currentChunk.y - 1, 'D');

    // 벽 "열" 시각화: 오래 문댈수록 점점 빨개짐
    if (chunk.wallHeat?.size) {
        for (const [k, v] of chunk.wallHeat.entries()) {
            const [txS, tyS] = k.split(',');
            const tx = Number(txS);
            const ty = Number(tyS);
            if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
            const tHeat = Math.max(0, Math.min(1, v.heatMs / CONFIG.WALL_RUB_BREAK_MS));
            const a = 0.55 * tHeat;
            ctx.fillStyle = `rgba(255, 60, 60, ${a})`;
            ctx.fillRect(
                offsetX + tx * cellSize,
                offsetY + ty * cellSize,
                cellSize,
                cellSize
            );
        }
    }

    // 보스 피격 혈흔(바닥 데칼) - 벽 위/파티클 아래 레이어
    if (state.fx?.bloodSplats?.length) {
        ctx.save();
        // 피 얼룩은 바닥에 스며든 느낌이 좋으므로 multiply 계열로 어둡게
        ctx.globalCompositeOperation = 'multiply';
        for (let i = state.fx.bloodSplats.length - 1; i >= 0; i--) {
            const s = state.fx.bloodSplats[i];
            const age = state.nowMs - (s.bornMs || 0);
            const life = Math.max(1, s.lifeMs || 90000);
            if (age >= life) {
                state.fx.bloodSplats.splice(i, 1);
                continue;
            }
            const t = 1 - Math.max(0, Math.min(1, age / life));
            const a = (s.a ?? 0.7) * (0.35 + 0.65 * t);

            const px = offsetX + s.x * cellSize;
            const py = offsetY + s.y * cellSize;
            const rr = (s.r ?? 0.25) * cellSize;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(s.rot || 0);
            ctx.scale(s.rx || 1, s.ry || 1);
            ctx.globalAlpha = a;

            const g = ctx.createRadialGradient(0, 0, rr * 0.12, 0, 0, rr);
            g.addColorStop(0, 'rgba(120, 0, 0, 0.90)');
            g.addColorStop(0.55, 'rgba(140, 0, 0, 0.45)');
            g.addColorStop(1, 'rgba(120, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, rr, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    // 파티클 렌더(벽 위/플레이어 아래 레이어)
    if (state.fx.particles.length) {
        ctx.save();
        // 불꽃/스파크는 밝게 겹치도록 additive 느낌
        ctx.globalCompositeOperation = 'lighter';
        for (const p of state.fx.particles) {
            const t = Math.max(0, Math.min(1, 1 - (p.age / p.life)));
            const px = offsetX + p.x * cellSize;
            const py = offsetY + p.y * cellSize;
            ctx.globalAlpha = t;
            ctx.fillStyle = p.c;
            ctx.shadowBlur = p.glow * t;
            ctx.shadowColor = p.c;
            if (p.kind === 'spark') {
                const vx = p.vx || 0;
                const vy = p.vy || 0;
                const mag = Math.sqrt(vx * vx + vy * vy) || 1;
                const tail = (p.len || 0.7) * t;
                const x2 = offsetX + (p.x - (vx / mag) * tail) * cellSize;
                const y2 = offsetY + (p.y - (vy / mag) * tail) * cellSize;
                ctx.strokeStyle = p.c;
                ctx.lineWidth = Math.max(1, cellSize * p.r * 0.65);
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(px, py, cellSize * p.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    // 마우스 가이드 라인 - 플레이어 위치 기준
    // 자이로 모드에서는 커서 개념이 약하므로 라인을 표시하지 않음
    const isGyroMode = !!(state.ui?.isMobile && state.controls?.mobileMode === 'gyro' && state.controls?.gyro?.enabled);
    if (!isGyroMode) {
        const pGuideX = offsetX + state.player.mazePos.x * cellSize;
        const pGuideY = offsetY + state.player.mazePos.y * cellSize;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.25)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(pGuideX, pGuideY);
        ctx.lineTo(state.mouse.x, state.mouse.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 플레이어 (미로 내부)
    const pScreenX = offsetX + state.player.mazePos.x * cellSize;
    const pScreenY = offsetY + state.player.mazePos.y * cellSize;

    // 나선환 플레이어(미로 내부)
    drawSpiralPlayer(
        ctx,
        pScreenX,
        pScreenY,
        cellSize * CONFIG.PLAYER_RADIUS,
        state.nowMs,
        { quality: 'mid', spin: 0.0016 }
    );

    // 점수 증감 팝업 (플레이어 위에 표시)
    if (state.fx.scorePopups?.length) {
        ctx.save();
        for (let i = state.fx.scorePopups.length - 1; i >= 0; i--) {
            const popup = state.fx.scorePopups[i];
            const age = state.nowMs - popup.bornMs;
            if (age >= popup.lifeMs) {
                state.fx.scorePopups.splice(i, 1);
                continue;
            }
            
            const t = age / popup.lifeMs;
            const alpha = 1 - Math.pow(t, 2); // 빠르게 페이드아웃
            const yOffset = -cellSize * 0.8 - (t * 60); // 위로 떠오름
            const scale = 1 + (1 - t) * 0.3; // 시작 시 크게
            
            const px = offsetX + popup.x * cellSize;
            const py = offsetY + popup.y * cellSize + yOffset;
            
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(px, py);
            ctx.scale(scale, scale);
            
            // 단순한 폰트
            ctx.font = `bold ${24 * scale}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // 단순한 색상 (그라데이션 제거)
            ctx.fillStyle = popup.isPositive ? '#FFD700' : '#FF4444';
            
            // 얇은 외곽선
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeText(popup.value, 0, 0);
            ctx.fillText(popup.value, 0, 0);
            
            ctx.restore();
        }
        ctx.restore();
    }

    // 아이템 획득 시 플레이어 노란 틴트(서서히 사라짐)
    if (state.fx.playerTint?.a > 0.001) {
        const a = Math.max(0, Math.min(1, state.fx.playerTint.a));
        const rr = cellSize * CONFIG.PLAYER_RADIUS * 2.1;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * a;
        const g = ctx.createRadialGradient(pScreenX, pScreenY, rr * 0.12, pScreenX, pScreenY, rr);
        const tr = state.fx.playerTint.r ?? 255;
        const tg = state.fx.playerTint.g ?? 210;
        const tb = state.fx.playerTint.b ?? 77;
        g.addColorStop(0, rgb(tr, tg, tb, 0.92));
        g.addColorStop(0.55, rgb(tr, tg, tb, 0.34));
        g.addColorStop(1, rgb(tr, tg, tb, 0.00));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pScreenX, pScreenY, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 아이템 획득 직후 1초간: 캐릭터 위에 코인/미사일 보유량(아이콘 + 세그먼트 숫자)
    if ((state.ui.pickupBadgeUntilMs || 0) > state.nowMs) {
        const remain = (state.ui.pickupBadgeUntilMs - state.nowMs);
        const t = Math.max(0, Math.min(1, remain / 1000));
        const alpha = 0.95 * (t < 0.25 ? (t / 0.25) : 1); // 시작은 빠르게 페이드인 느낌
        const fadeOut = Math.max(0, Math.min(1, remain / 260)); // 끝 0.26초 페이드아웃
        const a = alpha * fadeOut;

        // UI 배치 최적화 (플레이어 머리 위 고정 거리 + 약간의 떠오르는 애니메이션)
        const yOff = cellSize * 0.9 + (1 - t) * 15;
        const bx = pScreenX;
        const by = pScreenY - yOff;

        ctx.save();
        ctx.globalAlpha = a;

        // 고정된 UI 스케일링 (가독성 확보를 위해 cellSize에 너무 민감하지 않게 조정)
        const iconR = 8; 
        const segS = 0.8; 
        const digitH = 18 * segS;
        const rowH = 24;
        const pad = 12;
        const innerGap = 10;

        const coins = state.ui.pickupBadgeCoins ?? 0;
        const missiles = state.ui.pickupBadgeMissiles ?? 0;
        const gunpowder = state.ui.pickupBadgeGunpowder ?? 0;
        const wCoins = measureSevenSegNumberWidth(coins, segS);
        const wMsl = measureSevenSegNumberWidth(missiles, segS);
        const wGpw = measureSevenSegNumberWidth(gunpowder, segS);
        
        const maxTextW = Math.max(wCoins, wMsl, wGpw);
        const bw = iconR * 2 + innerGap + maxTextW + pad * 2;
        const bh = rowH * 3 + pad;

        // 배경: 깔끔한 라운드 박스 + 외곽선 + 그림자
        const rx = bx - bw / 2;
        const ry = by - bh;
        const rd = 8;

        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        
        ctx.beginPath();
        ctx.moveTo(rx + rd, ry);
        ctx.lineTo(rx + bw - rd, ry);
        ctx.quadraticCurveTo(rx + bw, ry, rx + bw, ry + rd);
        ctx.lineTo(rx + bw, ry + bh - rd);
        ctx.quadraticCurveTo(rx + bw, ry + bh, rx + bw - rd, ry + bh);
        ctx.lineTo(rx + rd, ry + bh);
        ctx.quadraticCurveTo(rx, ry + bh, rx, ry + bh - rd);
        ctx.lineTo(rx, ry + rd);
        ctx.quadraticCurveTo(rx, ry, rx + rd, ry);
        ctx.closePath();
        
        ctx.fillStyle = 'rgba(20, 20, 25, 0.88)';
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 내용물 정렬 (아이콘과 텍스트 수직 중앙 맞춤)
        const contentLeft = rx + pad;
        const iconX = contentLeft + iconR;
        const textX = iconX + iconR + innerGap;

        // 1행: 코인
        const row1CenterY = ry + pad/2 + rowH * 0.5;
        drawCoinIcon(ctx, iconX, row1CenterY, iconR, 1);
        drawSevenSegNumber(ctx, textX, row1CenterY - digitH / 2, coins, segS, 'rgba(255,230,140,0.95)', 1);

        // 2행: 미사일
        const row2CenterY = ry + pad/2 + rowH * 1.5;
        drawMissileIcon(ctx, iconX, row2CenterY, iconR, 1);
        drawSevenSegNumber(ctx, textX, row2CenterY - digitH / 2, missiles, segS, 'rgba(180,245,255,0.95)', 1);

        // 3행: 화약
        const row3CenterY = ry + pad/2 + rowH * 2.5;
        drawGunpowderIcon(ctx, iconX, row3CenterY, iconR, 1);
        drawSevenSegNumber(ctx, textX, row3CenterY - digitH / 2, gunpowder, segS, 'rgba(160,160,160,0.95)', 1);

        ctx.restore();
    }

    // 보스 (미로 내부)
    if (state.boss.active) {
        const cX = offsetX + 8.5 * cellSize;
        const ty = 8.5 * cellSize;
        const cY = offsetY + ty;

        // 보스 이미지(없으면 기존 원 형태 폴백)
        const bossImgReady = !!(BOSS_IMG && BOSS_IMG.complete && BOSS_IMG.naturalWidth > 0);
        if (bossImgReady) {
            const size = cellSize * 3.3;
            const pulse = 0.98 + 0.04 * Math.sin(state.nowMs * 0.006);
            ctx.save();
            ctx.translate(cX, cY);
            ctx.rotate(state.nowMs * 0.0007);
            ctx.shadowBlur = 28;
            ctx.shadowColor = 'rgba(255, 40, 40, 0.75)';
            ctx.globalAlpha = 0.98;
            ctx.drawImage(BOSS_IMG, -size * pulse / 2, -size * pulse / 2, size * pulse, size * pulse);
            ctx.restore();
        } else {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
            ctx.shadowBlur = 40;
            ctx.shadowColor = 'red';
            ctx.beginPath();
            ctx.arc(cX, cY, cellSize * 1.5, 0, Math.PI * 2);
            ctx.fill();
            
            // 보스 코어
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(cX, cY, cellSize * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 레이저 렌더 (경고 점멸 → 발사)
        for (const laser of state.boss.lasers) {
            const lx = offsetX + laser.x * cellSize;
            const ly = offsetY + laser.y * cellSize;
            const t = (state.nowMs - laser.startMs);
            const warnMs = laser.warnMs ?? 500;
            const isWarning = t < warnMs;
            
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(laser.angle);
            
            if (isWarning) {
                // 경고(가이드선): 더 굵게/더 밝게/양방향으로(가시성 강화)
                const blink = 0.35 + 0.65 * Math.abs(Math.sin(state.nowMs * 0.018));
                const len = cellSize * 20;
                ctx.lineCap = 'round';
                ctx.setLineDash([cellSize * 0.45, cellSize * 0.55]);
                ctx.shadowBlur = 22;
                ctx.shadowColor = 'rgba(255, 40, 40, 0.95)';

                // 바깥 레드 글로우
                ctx.strokeStyle = `rgba(255, 60, 60, ${0.35 + 0.45 * blink})`;
                ctx.lineWidth = Math.max(2, cellSize * (laser.width || 1.6) * 0.45);
                ctx.beginPath();
                ctx.moveTo(-len, 0);
                ctx.lineTo(len, 0);
                ctx.stroke();

                // 안쪽 하이라이트(거의 흰색)
                ctx.shadowBlur = 0;
                ctx.setLineDash([cellSize * 0.35, cellSize * 0.55]);
                ctx.strokeStyle = `rgba(255, 245, 245, ${0.25 + 0.35 * blink})`;
                ctx.lineWidth = Math.max(1, cellSize * 0.12);
                ctx.beginPath();
                ctx.moveTo(-len, 0);
                ctx.lineTo(len, 0);
                ctx.stroke();
            } else {
                // 실제 레이저
                const activeT = (t - warnMs);
                const lifePct = 1 - (activeT / Math.max(1, laser.lifeMs));
                const len = cellSize * 20;
                ctx.lineCap = 'round';
                ctx.strokeStyle = `rgba(255, 50, 50, ${Math.max(0.22, lifePct)})`;
                ctx.lineWidth = (laser.width || 1.6) * cellSize * Math.max(0.55, lifePct);
                ctx.shadowBlur = 32;
                ctx.shadowColor = 'rgba(255, 30, 30, 0.95)';
                ctx.beginPath();
                ctx.moveTo(-len, 0);
                ctx.lineTo(len, 0);
                ctx.stroke();

                // 코어 라인(밝게)
                ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(255, 245, 245, ${Math.max(0.10, lifePct * 0.55)})`;
                ctx.lineWidth = Math.max(1, cellSize * 0.16);
                ctx.beginPath();
                ctx.moveTo(-len, 0);
                ctx.lineTo(len, 0);
                ctx.stroke();
            }
            ctx.restore();
        }

        // 격자 장판 렌더
        for (const pattern of state.boss.gridPatterns) {
            for (const tile of pattern.tiles) {
                if (tile.state === 'done') continue;
                
                const tileX = offsetX + tile.x * cellSize;
                const tileY = offsetY + tile.y * cellSize;
                const tileSize = cellSize;
                
                ctx.save();
                
                if (tile.state === 'warning') {
                    // 경고: 빨간색 반투명 + 점멸
                    const t = state.nowMs - tile.warnStartMs;
                    const warnDur = tile.damageStartMs - tile.warnStartMs;
                    const progress = Math.min(1, t / warnDur);
                    const blink = 0.4 + 0.6 * Math.abs(Math.sin(state.nowMs * 0.015));
                    
                    ctx.fillStyle = `rgba(255, 40, 40, ${0.3 + 0.4 * blink * (1 - progress * 0.5)})`;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = 'rgba(255, 60, 60, 0.6)';
                    ctx.fillRect(tileX - tileSize / 2, tileY - tileSize / 2, tileSize, tileSize);
                    
                    // 외곽선
                    ctx.strokeStyle = `rgba(255, 100, 100, ${0.6 + 0.4 * blink})`;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(tileX - tileSize / 2, tileY - tileSize / 2, tileSize, tileSize);
                } else if (tile.state === 'active') {
                    // 대미지: 주황색/노란색 플래시
                    const t = state.nowMs - tile.damageStartMs;
                    const damageDur = tile.damageEndMs - tile.damageStartMs;
                    const progress = Math.min(1, t / damageDur);
                    const pulse = Math.abs(Math.sin(state.nowMs * 0.025));
                    
                    // 배경
                    ctx.fillStyle = `rgba(255, 100, 0, ${0.6 + 0.4 * pulse})`;
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'rgba(255, 150, 0, 0.8)';
                    ctx.fillRect(tileX - tileSize / 2, tileY - tileSize / 2, tileSize, tileSize);
                    
                    // 코어
                    ctx.fillStyle = `rgba(255, 255, 100, ${0.8 + 0.2 * pulse})`;
                    ctx.shadowBlur = 0;
                    ctx.fillRect(tileX - tileSize / 4, tileY - tileSize / 4, tileSize / 2, tileSize / 2);
                }
                
                ctx.restore();
            }
        }
    }

    // 추격자 (미로 내부) - 플레이어와 같은 청크에 있을 때만 렌더링
    const isChaserInPlayerChunk = state.chaser.chunk.x === state.currentChunk.x && state.chaser.chunk.y === state.currentChunk.y;
    if (state.chaser.active && state.chaser.isPresentInMaze && isChaserInPlayerChunk && !state.boss.active && !state.chaser.deadUntilNextChunk) {
        const cX = offsetX + state.chaser.pos.x * cellSize;
        const cY = offsetY + state.chaser.pos.y * cellSize;
        
        // 부활 예고 점멸 처리
        let alpha = (state.nowMs < state.chaser.graceUntilMs) ? 0.35 : 0.95;
        if (state.chaser.respawnTimerMs > 0) {
            alpha *= (Math.sin(state.nowMs * 0.02) * 0.5 + 0.5);
        }

        // 진행 방향(오른쪽이 전방) 기준 회전 각도 계산
        let ang = 0;
        try {
            const path = state.chaser.path || [];
            const idx = state.chaser.pathIndex ?? 0;
            if (path.length > 0 && idx < path.length) {
                const tgt = path[Math.min(idx, path.length - 1)];
                const tx = (tgt.x ?? 0) + 0.5;
                const ty = (tgt.y ?? 0) + 0.5;
                const dx = tx - state.chaser.pos.x;
                const dy = ty - state.chaser.pos.y;
                ang = Math.atan2(dy, dx);
            } else {
                // 폴백: 플레이어 방향
                const dx = state.player.mazePos.x - state.chaser.pos.x;
                const dy = state.player.mazePos.y - state.chaser.pos.y;
                ang = Math.atan2(dy, dx);
            }
        } catch (_) {}

        // 이미지가 아직 로드되지 않았으면 기존 원 형태로 폴백
        const imgReady = !!(CHASER_IMG && CHASER_IMG.complete && CHASER_IMG.naturalWidth > 0);
        const chaserSize = cellSize * CONFIG.CHASER_RADIUS * 3; // 이미지/원 모두 동일한 크기 배율 적용
        if (imgReady) {
            ctx.save();
            ctx.translate(cX, cY);
            ctx.rotate(ang);
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 18;
            ctx.shadowColor = 'rgba(255, 80, 80, 0.65)';
            ctx.drawImage(CHASER_IMG, -chaserSize / 2, -chaserSize / 2, chaserSize, chaserSize);
            ctx.restore();
        } else {
        ctx.fillStyle = `rgba(255, 80, 80, ${alpha})`;
        ctx.shadowBlur = 25;
        ctx.shadowColor = 'rgba(255, 80, 80, 0.9)';
        ctx.beginPath();
        ctx.arc(cX, cY, chaserSize / 2, 0, Math.PI * 2); // size는 직경이므로 반지름은 /2
        ctx.fill();
        ctx.shadowBlur = 0;
        }

        // 스턴 링(맞았을 때)
        if (state.nowMs < state.chaser.stunUntilMs) {
            // ... (기존 스턴 링 로직)
            const totalStunMs = CONFIG.STUN_MS + (state.abilities.missileStunBonusMs || 0);
            const remaining = state.chaser.stunUntilMs - state.nowMs;
            const k = 1 - Math.max(0, Math.min(1, remaining / totalStunMs));
            
            const rr = (CONFIG.CHASER_RADIUS + 0.10 + k * 0.45) * cellSize;
            ctx.strokeStyle = 'rgba(255, 210, 77, 0.75)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cX, cY, Math.max(0, rr), 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // 추격자 투사체 렌더
    for (const p of state.chaserProjectiles) {
        const px = offsetX + p.pos.x * cellSize;
        const py = offsetY + p.pos.y * cellSize;
        const vx = p.vel?.x ?? 0;
        const vy = p.vel?.y ?? 0;
        const ang = Math.atan2(vy, vx);
        const imgReady = !!(CHASER_MISSILE_IMG && CHASER_MISSILE_IMG.complete && CHASER_MISSILE_IMG.naturalWidth > 0);
        if (imgReady) {
            const size = cellSize * 1.95; // 0.65 * 3 = 1.95 (3배 증가)
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(ang);
            ctx.globalAlpha = 0.95;
            ctx.shadowBlur = 12;
            ctx.shadowColor = 'rgba(255, 80, 80, 0.8)';
            ctx.drawImage(CHASER_MISSILE_IMG, -size / 2, -size / 2, size, size);
            ctx.restore();
        } else {
        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'red';
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2); // 4 * 3 = 12 (3배 증가)
        ctx.fill();
        ctx.restore();
        }
    }

    // 코인 렌더(애니메이션)
    if (chunk.coins?.length) {
        for (const c of chunk.coins) {
            if (c.picked) continue;
            const x = offsetX + c.x * cellSize;
            const y = offsetY + c.y * cellSize;
            const bob = Math.sin((state.nowMs + c.x * 1000) * 0.006) * (cellSize * 0.04);
            const s = cellSize * 0.48; // 크기 3배 증가 (0.16 -> 0.48)
            
            // 코인 애니메이션: coin_front -> coin_45 -> coin_side -> coin_45(좌우반전) -> coin_front 반복
            // 각 프레임당 약 150ms (총 600ms 사이클)
            const animSpeed = 150; // ms per frame
            const animTime = (state.nowMs + c.x * 1000) % (animSpeed * 4);
            const frame = Math.floor(animTime / animSpeed);
            
            // 명도 점멸 효과 (시인성 향상)
            const blinkSpeed = 800; // ms per cycle
            const blinkTime = (state.nowMs + c.x * 500) % blinkSpeed;
            const blinkT = Math.sin((blinkTime / blinkSpeed) * Math.PI * 2);
            const brightness = 0.85 + 0.15 * blinkT; // 0.85 ~ 1.0 사이에서 변화
            
            let coinImg = null;
            let flipX = false;
            
            if (frame === 0) {
                coinImg = COIN_FRONT_IMG;
            } else if (frame === 1) {
                coinImg = COIN_45_IMG;
            } else if (frame === 2) {
                coinImg = COIN_SIDE_IMG;
            } else if (frame === 3) {
                coinImg = COIN_45_IMG;
                flipX = true; // 좌우 반전
            }
            
            ctx.save();
            ctx.translate(x, y + bob);
            
            // 이미지가 로드되었는지 확인
            const imgReady = coinImg && coinImg.complete && coinImg.naturalWidth > 0;
            
            if (imgReady) {
                ctx.imageSmoothingEnabled = true;
                // 명도 점멸 효과 적용
                ctx.globalAlpha = brightness;
                if (flipX) {
                    ctx.scale(-1, 1);
                    ctx.drawImage(coinImg, -s / 2, -s / 2, s, s);
                } else {
                    ctx.drawImage(coinImg, -s / 2, -s / 2, s, s);
                }
                ctx.globalAlpha = 1.0;
            } else {
                // 폴백: 이미지가 로드되지 않았을 때 기존 픽셀 블록 렌더링
                ctx.imageSmoothingEnabled = false;
                // 명도 점멸 효과 적용
                ctx.globalAlpha = brightness;
                ctx.fillStyle = 'rgba(255, 210, 77, 0.95)';
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 2;
                ctx.fillRect(-s / 2, -s / 2, s, s);
                ctx.strokeRect(-s / 2 + 0.5, -s / 2 + 0.5, s - 1, s - 1);
                ctx.fillStyle = 'rgba(255,255,255,0.65)';
                ctx.fillRect(-s / 2 + 2, -s / 2 + 2, 3, 3);
                ctx.globalAlpha = 1.0;
            }
            
            ctx.restore();
        }
    }

    // 미사일/아이템 스프라이트(미사일 모양)
    function drawMissileSprite(x, y, angle, scale, isItem) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // 이미지가 있으면 이미지를 우선 사용(오른쪽이 전방)
        const imgReady = !!(MISSILE_IMG && MISSILE_IMG.complete && MISSILE_IMG.naturalWidth > 0);
        if (imgReady) {
            const size = scale * (isItem ? 2.2 : 2.6);
            ctx.globalAlpha = 0.98;
            ctx.shadowBlur = isItem ? 14 : 20;
            ctx.shadowColor = isItem ? 'rgba(255,210,77,0.85)' : 'rgba(255,240,200,0.85)';
            ctx.drawImage(MISSILE_IMG, -size / 2, -size / 2, size, size);
            ctx.restore();
            return;
        }

        const L = scale * (isItem ? 1.25 : 1.55);
        const W = scale * (isItem ? 0.45 : 0.55);

        // 글로우
        ctx.shadowBlur = isItem ? 16 : 22;
        ctx.shadowColor = isItem ? 'rgba(255,210,77,0.9)' : 'rgba(255,240,200,0.9)';

        // 외곽선(픽셀 느낌: 선명한 대비)
        ctx.lineWidth = Math.max(1, scale * 0.12);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';

        // 몸통(캡슐)
        ctx.fillStyle = isItem ? 'rgba(255,210,77,0.95)' : 'rgba(235,235,235,0.95)';
        ctx.beginPath();
        ctx.moveTo(-L / 2 + W / 2, -W / 2);
        ctx.lineTo(L / 2 - W / 2, -W / 2);
        ctx.arc(L / 2 - W / 2, 0, W / 2, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-L / 2 + W / 2, W / 2);
        ctx.arc(-L / 2 + W / 2, 0, W / 2, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 노즈(앞쪽 삼각)
        ctx.fillStyle = isItem ? 'rgba(255,235,160,0.95)' : 'rgba(255,90,90,0.95)';
        ctx.beginPath();
        ctx.moveTo(L / 2, 0);
        ctx.lineTo(L / 2 - W * 0.55, -W * 0.40);
        ctx.lineTo(L / 2 - W * 0.55, W * 0.40);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 꼬리/날개
        ctx.fillStyle = 'rgba(90,90,90,0.95)';
        ctx.beginPath();
        ctx.moveTo(-L / 2 + W * 0.10, -W * 0.55);
        ctx.lineTo(-L / 2 + W * 0.65, -W * 0.20);
        ctx.lineTo(-L / 2 + W * 0.10, -W * 0.10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-L / 2 + W * 0.10, W * 0.55);
        ctx.lineTo(-L / 2 + W * 0.65, W * 0.20);
        ctx.lineTo(-L / 2 + W * 0.10, W * 0.10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 창(작은 점)
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(80,180,255,0.9)';
        ctx.beginPath();
        ctx.arc(L * 0.05, -W * 0.12, Math.max(1.2, scale * 0.12), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // 아이템 (미사일) - 여러 개 가능
    if (state.items?.length) {
        for (const it of state.items) {
            const iX = offsetX + it.pos.x * cellSize;
            const iY = offsetY + it.pos.y * cellSize;
            const bob = Math.sin((state.nowMs + (it.pos.x + it.pos.y) * 123.4) * 0.006) * (cellSize * 0.05);
            drawMissileSprite(iX, iY + bob, -Math.PI / 2, cellSize * 0.22 * 3, true);
        }
    }

    // 하트 드롭 렌더
    if (state.hearts?.length) {
        for (const h of state.hearts) {
            const hx = offsetX + h.pos.x * cellSize;
            const hy = offsetY + h.pos.y * cellSize;
            const bob = Math.sin((state.nowMs + (h.pos.x + h.pos.y) * 77.7) * 0.006) * (cellSize * 0.05);
            ctx.save();
            ctx.fillStyle = '#ff4d7a';
            ctx.font = `${Math.max(14, cellSize * 0.9)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 14;
            ctx.shadowColor = 'rgba(255, 80, 120, 0.9)';
            ctx.fillText('❤', hx, hy + bob);
            ctx.restore();
        }
    }

    // 미사일(복수)
    if (state.missiles.length) {
        for (const m of state.missiles) {
            const mX = offsetX + m.pos.x * cellSize;
            const mY = offsetY + m.pos.y * cellSize;
            const ang = Math.atan2(m.vel.y, m.vel.x);
            drawMissileSprite(mX, mY, ang, cellSize * 0.18 * 3, false);
        }
    }

    // 위기 비네팅(추격자가 가까울수록 붉은 테두리)
    if (state.chaser.active && state.chaser.isPresentInMaze) {
        const dx = state.chaser.pos.x - state.player.mazePos.x;
        const dy = state.chaser.pos.y - state.player.mazePos.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const t = Math.max(0, Math.min(1, (6.5 - d) / 6.5));
        if (t > 0.01) {
            const g = ctx.createRadialGradient(
                state.view.w / 2, state.view.h / 2, Math.min(state.view.w, state.view.h) * 0.18,
                state.view.w / 2, state.view.h / 2, Math.min(state.view.w, state.view.h) * 0.55
            );
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, `rgba(255,60,60,${0.28 * t})`);
            ctx.fillStyle = g;
            ctx.fillRect(-shakeX, -shakeY, state.view.w, state.view.h);
        }
    }

    // 섬광(폭발/발사)
    if (state.fx.flash.a > 0.001) {
        const col = state.fx.flash.color || '#fff';
        // RGB 값 추출 및 처리 (간단하게)
        if (col === '#ff0000') ctx.fillStyle = `rgba(255,0,0,${0.35 * state.fx.flash.a})`;
        else ctx.fillStyle = `rgba(255,255,255,${0.35 * state.fx.flash.a})`;
        ctx.fillRect(-shakeX, -shakeY, state.view.w, state.view.h);
    }

    ctx.restore();
}

let rafId = null;

function gameLoop(time) {
    const dt = time - state.lastTime;
    state.lastTime = time;
    state.nowMs = time;

    update(dt);
    draw();
    // 텍스처 생성으로 인한 프레임 드랍을 줄이기 위해, 매 프레임 소량만 처리
    processMazeTexQueue(6);
    rafId = requestAnimationFrame(gameLoop);
}

// 메모리 누수 방지: 페이지 언로드 시 정리
function cleanup() {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    // 오디오 정리
    // WebAudio wallRub 정리
    if (state.audio?.wallRub?.sourceNode) {
        try {
            state.audio.wallRub.sourceNode.stop();
            state.audio.wallRub.sourceNode.disconnect();
        } catch {}
        state.audio.wallRub.sourceNode = null;
    }
    if (state.audio?.wallRub?.gainNode) {
        try {
            state.audio.wallRub.gainNode.disconnect();
        } catch {}
        state.audio.wallRub.gainNode = null;
    }
    // 레거시 Audio 엘리먼트 정리
    if (state.audio?.wallRub?.el) {
        try {
            state.audio.wallRub.el.pause();
            state.audio.wallRub.el.src = '';
        } catch {}
    }
    if (state.audio?.bgm?.el) {
        try {
            state.audio.bgm.el.pause();
            state.audio.bgm.el.src = '';
        } catch {}
    }
    // 오디오 컨텍스트 정리
    if (state.audio?.sfx?.ctx) {
        try {
            state.audio.sfx.ctx.close();
        } catch {}
    }
}

window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);

init();
updateUI();
