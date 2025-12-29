// 게임 설정(CONFIG) - game.js에서 분리
// 주의: 다른 스크립트(game.js, ui_ability.js 등)보다 먼저 로드되어야 합니다.

const CONFIG = {
    CHUNK_COLS: 5,
    CHUNK_SIZE: 180, // 월드 맵에서 청크의 크기
    MAZE_SIZE: 17,   // 청크 내부 미로의 칸 수 (홀수가 좋음)
    PLAYER_RADIUS: 0.3, // 셀 크기 대비 플레이어 반지름
    MOVE_SPEED: 0.2, // 셀 단위 속도 (상향)
    FPS: 60,
    START_CHUNK_X: 2,
    START_CHUNK_Y: 0,
    CHASER_START_ROW_Y: 2, // 3번째 행(y=2)부터 추격자 활성/스폰
    // 추격자(몹) 설정
    CHASER_SPEED: 2.0, // 셀/초 (기본)
    CHASER_RADIUS: 0.495, // 셀 단위 반지름 (1.5배 증가: 0.33 * 1.5)
    CHASER_REPATH_MS: 250,
    CHASER_GRACE_MS: 650, // 리셋 직후 유예 시간
    CHASER_ENTRY_DELAY_MS: 1000, // 청크 진입 후 추격자가 "등장"하기까지 딜레이
    CHASER_ENTRY_DELAY_PER_CELL_MS: 180, // 청크 클리어 시 거리(셀) 1당 추가 딜레이
    CHASER_ENTRY_DELAY_MAX_MS: 4200, // 최대 등장 딜레이
    CHASER_SPEEDUP_PER_CHUNK: 0.12, // 청크 넘어갈 때마다 가속(배수에 더해짐)
    CHASER_MAX_SPEED_MULT: 3.0,

    // 아이템/미사일
    ITEM_SPAWN_CHANCE: 0.55, // 청크당 아이템 등장 확률(임시)
    MISSILE_SPEED: 9.0, // 셀/초
    MISSILE_TURN_RATE: 16.0, // 1초당 방향 보정 강도(클수록 더 즉각적으로 유도)
    STUN_MS: 1200,
    SLOW_MULT_ON_HIT: 0.75, // 맞을 때 속도 배수 감소(곱)

    // 이펙트(연출)
    FX_PARTICLE_MAX: 100,
    FX_SHAKE_DECAY: 14.0, // 1초당 감소
    FX_FLASH_DECAY: 3.6,  // 1초당 감소
    FX_SCALE: 0.33, // 전체 이펙트 크기(반지름/꼬리/글로우/쉐이크) 스케일

    // 벽 파괴(문대기)
    WALL_RUB_BREAK_MS: 5000,
    WALL_RUB_DECAY_PER_SEC: 0.9, // 초당 감소량(문대지 않으면 서서히 식음)
    WALL_UNBREAKABLE_MARGIN: 1, // 청크 외곽 벽(테두리) 파괴 금지 두께(1이면 가장자리 1칸)

    // 벽 레벨별 설정 (내구도 배수 및 색상)
    WALL_LEVELS: [
        { name: '갈색', color: [72, 50, 34], durability: 1, startProb: 1.0 },
        { name: '파랑', color: [34, 50, 120], durability: 2, startProb: 0.20 },
        { name: '녹색', color: [34, 120, 50], durability: 4, startProb: 0.15 },
        { name: '보라색', color: [100, 34, 120], durability: 8, startProb: 0.12 },
        { name: '노랑색', color: [130, 120, 30], durability: 16, startProb: 0.10 },
        { name: '주황색', color: [140, 80, 30], durability: 32, startProb: 0.08 },
        { name: '빨강색', color: [140, 30, 30], durability: 64, startProb: 0.07 },
        { name: '회색', color: [80, 80, 80], durability: 128, startProb: 0.06 },
        { name: '흰색', color: [210, 210, 210], durability: 256, startProb: 0.05 },
        { name: '검정색', color: [25, 25, 25], durability: 512, startProb: 0.05 }
    ],

    // 능력치 상한값
    MAX_WALL_BREAK_SPEED_MULT: 100.0,
    MAX_MISSILE_SPAWN_CHANCE_MULT: 5.0,
    MAX_MISSILE_STUN_BONUS_MS: 5000,
    MAX_MOVE_SPEED_MULT: 3.0,
    MAX_MISSILE_COUNT: 5,
    MAX_SHOP_SLOTS: 6,

    // 보스전 설정
    BOSS_HEALTH: 50,
    MISSILE_DAMAGE: 5,
    GUNPOWDER_DAMAGE_MULT: 3,
    GUNPOWDER_SLOW_MULT: 0.8,
    GUNPOWDER_SLOW_DUR_MS: 10000,
    WALL_REGEN_MS: 10000,
    MISSILE_RESPAWN_MS: 5000,

    // 어빌리티 희귀도 확률
    RARITY_PROBS: {
        COMMON: 0.71,
        RARE: 0.20,
        EPIC: 0.08,
        LEGENDARY: 0.01,
        CURSE: 0.03 // 저주 등급은 3% 고정 확률
    },

    // 캐릭터 스킨 설정
    CHARACTER_SKINS: [
        { id: 'default', name: '기본', unlocked: true },
        // 추가 스킨은 나중에 구현
    ],

    DEBUG: false, // 디버그 모드 (true 설정 시 벽부수기 해제, 코인/미사일 1000개 시작)
};


