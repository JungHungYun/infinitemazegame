// 어빌리티(상점) UI/로직 - game.js에서 분리
// 주의: CONFIG는 config.js에서 먼저 로드되어 있어야 합니다.

function initAbilityModalUI() {
    const modal = document.getElementById('ability-modal');
    const rerollBtn = document.getElementById('ability-reroll');
    const skipBtn = document.getElementById('ability-skip');
    const rerollCostEl = document.getElementById('ability-reroll-cost');

    if (!modal || !rerollBtn || !skipBtn) return;

    rerollBtn.addEventListener('click', () => {
        if (!state.ui.modalOpen) return;
        const freeLeft = Math.max(0, Math.floor(state.ui.freeRerollsLeft ?? 0));
        const cost = state.ui.abilityRerollCost;
        // 무료 티켓이 있으면 코인 소모 없이 리롤(리롤 비용은 "올랐다가" 무료 소진 후 원복)
        if (freeLeft > 0) {
            state.ui.freeRerollsLeft = freeLeft - 1;
            state.ui.abilityRerollCost += 1; // 리롤할 때마다 비용 증가(무료도 동일하게 증가시키되)
            if ((state.ui.freeRerollsLeft ?? 0) <= 0) {
                // 무료 소진 후 구매 직전 비용으로 복구
                const restore = Math.max(1, Math.floor(state.ui.freeRerollRestoreCost ?? state.ui.abilityRerollCost));
                state.ui.abilityRerollCost = restore;
            }
        } else {
            if (state.coins < cost) return;
            state.coins -= cost;
            state.ui.abilityRerollCost += 1; // 리롤할 때마다 비용 증가
        }
        state.ui.boughtAbilities.clear(); // 리롤하면 다시 구매 가능
        rollAbilityChoices();

        // 현재 표시 중인 층수를 유지하기 위해 텍스트에서 추출하거나 state에서 가져옴
        const floorText = document.getElementById('ability-floor')?.textContent;
        const floor = floorText ? parseInt(floorText) : getFloor();
        renderAbilityModal(floor);
    });

    skipBtn.addEventListener('click', () => {
        closeAbilityModal();
    });
}

const ABILITY_DEFS = [
    // ===== 금융 어빌리티(추가 비용 상승 없음) =====
    {
        id: 'bank_deposit',
        name: '예금',
        desc: '10초에 한번 1코인 획득. 획득할 때마다 -0.25초(최대 -9초, 최소 1초).',
        rarity: 'RARE',
        cost: 5,
        noExtraCost: true,
        available: () => !state.abilities.bankDeposit?.enabled,
        apply: () => {
            state.abilities.bankDeposit = { enabled: true, intervalMs: 10000, timerMs: 0 };
        },
    },
    {
        id: 'bank_saving',
        name: '적금',
        desc: '다섯개 층 통과할 때마다 이자 10코인. 획득할 때마다 필요 층수 -1(최소 1층).',
        rarity: 'EPIC',
        cost: 20,
        noExtraCost: true,
        available: () => !state.abilities.bankSaving?.enabled,
        apply: () => {
            state.abilities.bankSaving = { enabled: true, targetFloors: 5, progress: 0 };
        },
    },
    {
        id: 'living_loan',
        name: '생활비 대출',
        desc: '즉시 +20코인. 5개 층 통과 이후 5초당 1코인 상환. 코인이 음수면 1초당 추가 상환액 +1 증가.',
        rarity: 'EPIC',
        cost: -20, // 보너스(코인 지급)
        noExtraCost: true,
        available: () => true,
        apply: () => {
            if (!state.abilities.livingLoan) state.abilities.livingLoan = { debt: 0, graceFloors: 0, repayAccMs: 0, penaltyAccMs: 0, penaltyPayAccMs: 0, penaltyRate: 0 };
            state.abilities.livingLoan.debt = (state.abilities.livingLoan.debt || 0) + 20;
            state.abilities.livingLoan.graceFloors = Math.max(state.abilities.livingLoan.graceFloors || 0, 5);
        },
    },
    {
        id: 'life_loan',
        name: '생명담보대출',
        desc: '즉시 +50코인. 목숨 2개 즉시 소모. 목숨이 0 이하가 되면 게임 오버.',
        rarity: 'EPIC',
        cost: -50, // 보너스(코인 지급)
        noExtraCost: true,
        available: () => true,
        apply: () => {
            state.player.lives = (state.player.lives || 0) - 2;
            if (state.player.lives <= 0) {
                state.player.lives = 0;
                if (typeof openGameOverModal === 'function') openGameOverModal();
            }
            if (typeof updateUI === 'function') updateUI();
        },
    },
    {
        id: 'small_luck',
        name: '작은 행운',
        desc: '즉시 +5코인.',
        rarity: 'COMMON',
        cost: -5, // 보너스(코인 지급)
        noExtraCost: true,
        available: () => true,
        apply: () => {},
    },
    {
        id: 'free_ticket',
        name: '무료 티켓',
        desc: '리롤 비용을 3회 무료로 만듭니다. 무료 소진 후엔 구매 직전 리롤 비용으로 되돌립니다.',
        rarity: 'COMMON',
        cost: 3,
        noExtraCost: true,
        available: () => true,
        apply: () => {
            const add = 3;
            state.ui.freeRerollsLeft = (state.ui.freeRerollsLeft || 0) + add;
            // 기존 티켓이 없다면 "구매 직전" 비용을 기록(이미 티켓이 있으면 더 이른 비용을 유지)
            const cur = Math.max(1, Math.floor(state.ui.abilityRerollCost || 1));
            const prevRestore = state.ui.freeRerollRestoreCost;
            state.ui.freeRerollRestoreCost = (typeof prevRestore === 'number')
                ? Math.min(prevRestore, cur)
                : cur;
        },
    },

    {
        id: 'wall_break_speed',
        name: '벽부수기 속도 +10%',
        desc: `벽을 더 빠르게 부숩니다. (MAX x${CONFIG.MAX_WALL_BREAK_SPEED_MULT})`,
        rarity: 'RARE',
        cost: 5,
        // 예전에는 wallBreakUnlocked가 false면 "아예 뽑히지 않아서" 누락처럼 보였음.
        // 이제는 뽑힐 수는 있게 하되(설명/잠김 표시), 구매는 선행 조건을 만족해야 가능하게 합니다.
        available: () => state.abilities.wallBreakSpeedMult < CONFIG.MAX_WALL_BREAK_SPEED_MULT,
        requires: () => !!state.abilities.wallBreakUnlocked,
        lockedText: '선행: 벽부수기 능력 필요',
        apply: () => {
            state.abilities.wallBreakSpeedMult = Math.min(CONFIG.MAX_WALL_BREAK_SPEED_MULT, state.abilities.wallBreakSpeedMult + 0.1);
        },
    },
    {
        id: 'missile_spawn',
        name: '미사일 아이템 확률 +5%',
        desc: `미사일 아이템 등장 확률이 5% 증가합니다. (MAX x${CONFIG.MAX_MISSILE_SPAWN_CHANCE_MULT})`,
        rarity: 'COMMON',
        cost: 3,
        available: () => state.abilities.missileSpawnChanceMult < CONFIG.MAX_MISSILE_SPAWN_CHANCE_MULT,
        apply: () => {
            state.abilities.missileSpawnChanceMult = Math.min(CONFIG.MAX_MISSILE_SPAWN_CHANCE_MULT, state.abilities.missileSpawnChanceMult + 0.05);
        },
    },
    {
        id: 'coin_field_spawn',
        name: '코인 확률 증가',
        desc: '필드 내 코인 등장 확률 증가(+15%). 최대 코인 개수도 증가합니다. (최대 20회)',
        rarity: 'RARE',
        cost: 5,
        available: () => (state.abilities.coinFieldSpawnBonus ?? 0) < 3.0,
        apply: () => {
            state.abilities.coinFieldSpawnBonus = Math.min(3.0, (state.abilities.coinFieldSpawnBonus ?? 0) + 0.15);
        },
    },
    {
        id: 'missile_field_spawn',
        name: '미사일 확률 증가',
        desc: '필드 내 미사일 아이템 등장 확률 +2.5% (최대 +100%). 최초 획득 시 필드 내 최대 5개까지 등장.',
        rarity: 'EPIC',
        cost: 15,
        available: () => (state.abilities.missileFieldSpawnBonus ?? 0) < 1.0,
        apply: () => {
            const cur = state.abilities.missileFieldSpawnBonus ?? 0;
            if ((state.abilities.maxFieldMissileItems ?? 1) < 5) state.abilities.maxFieldMissileItems = 5;
            state.abilities.missileFieldSpawnBonus = Math.min(1.0, cur + 0.025);
        },
    },
    {
        id: 'missile_stun',
        name: '미사일 스턴 +0.2초',
        desc: '미사일로 기절시키는 시간이 0.2초 증가합니다. (Max 5초)',
        rarity: 'COMMON',
        cost: 3,
        available: () => state.abilities.missileStunBonusMs < CONFIG.MAX_MISSILE_STUN_BONUS_MS,
        apply: () => {
            state.abilities.missileStunBonusMs = Math.min(CONFIG.MAX_MISSILE_STUN_BONUS_MS, state.abilities.missileStunBonusMs + 200);
        },
    },
    {
        id: 'missile_count',
        name: '미사일 투사체 +1',
        desc: '미사일 발사 시 투사체 개수가 1개 늘어납니다. (Max 5개)',
        rarity: 'EPIC',
        cost: 15,
        available: () => state.abilities.missileCount < CONFIG.MAX_MISSILE_COUNT,
        apply: () => {
            state.abilities.missileCount = Math.min(CONFIG.MAX_MISSILE_COUNT, state.abilities.missileCount + 1);
        },
    },
    {
        id: 'move_speed',
        name: '이동속도 +2.5%',
        desc: `이동 속도가 2.5% 증가합니다. (MAX x${CONFIG.MAX_MOVE_SPEED_MULT})`,
        rarity: 'COMMON',
        cost: 3,
        available: () => state.abilities.moveSpeedMult < CONFIG.MAX_MOVE_SPEED_MULT,
        apply: () => {
            state.abilities.moveSpeedMult = Math.min(CONFIG.MAX_MOVE_SPEED_MULT, state.abilities.moveSpeedMult + 0.025);
        },
    },
    {
        id: 'gold_wall',
        name: '코인 벽',
        desc: '코인이 포함된 벽이 생성될 확률 + 1% (MIN 10%, MAX 25%)',
        rarity: 'EPIC',
        cost: 10,
        available: () => !state.abilities.goldWallUnlocked || state.abilities.goldWallProb < 0.25,
        apply: () => {
            if (!state.abilities.goldWallUnlocked) {
                state.abilities.goldWallUnlocked = true;
                state.abilities.goldWallProb = Math.max(0.10, state.abilities.goldWallProb || 0);
                state.abilities.coinWallCoinAmount = state.abilities.coinWallCoinAmount ?? 5;
            } else {
                state.abilities.goldWallProb = Math.min(0.25, (state.abilities.goldWallProb || 0) + 0.01);
            }
        },
    },
    {
        id: 'coin_wall_coin_plus',
        name: '코인 벽 코인 +1',
        desc: '코인 벽(사금벽) 파괴 시 코인 획득량 +1 (기본 5에서 증가)',
        rarity: 'COMMON',
        cost: 3,
        available: () => true,
        requires: () => !!state.abilities.goldWallUnlocked,
        lockedText: '선행: 코인 벽 필요',
        apply: () => {
            state.abilities.coinWallCoinAmount = (state.abilities.coinWallCoinAmount ?? 5) + 1;
        },
    },
    {
        id: 'coin_gain_plus',
        name: '코인 획득량 +1',
        desc: '코인을 얻을 때마다 추가로 +1을 더 획득합니다.',
        rarity: 'COMMON',
        cost: 3,
        available: () => true,
        apply: () => {
            state.abilities.coinGainBonus = (state.abilities.coinGainBonus ?? 0) + 1;
        },
    },
    {
        id: 'missile_wall_break',
        name: '벽파괴 미사일',
        desc: '미사일이 벽에 부딪힐 때 일정 확률로 벽을 파괴합니다.',
        rarity: 'EPIC',
        cost: 20,
        available: () => true,
        apply: () => {
            if (!state.abilities.missileWallBreakUnlocked) {
                state.abilities.missileWallBreakUnlocked = true;
            } else {
                state.abilities.missileWallBreakProb += 0.01;
            }
        },
    },
    {
        id: 'talisman',
        name: '부적',
        desc: '일반 확률 -6%, 희귀+3%, 영웅+2.5%, 전설+0.5% 증가 (최대 3회)',
        rarity: 'LEGENDARY',
        cost: 20,
        available: () => state.abilities.talismanCount < 3,
        apply: () => {
            state.abilities.rarityBonus.COMMON -= 0.06;
            state.abilities.rarityBonus.RARE += 0.03;
            state.abilities.rarityBonus.EPIC += 0.025;
            state.abilities.rarityBonus.LEGENDARY += 0.005;
            state.abilities.talismanCount++;
        },
    },
    {
        id: 'shop_slot',
        name: '상점 슬롯 +1',
        desc: '어빌리티 선택창의 슬롯이 1개 증가합니다. (최대 6개)',
        rarity: 'LEGENDARY',
        cost: 30,
        available: () => state.abilities.shopSlots < CONFIG.MAX_SHOP_SLOTS,
        apply: () => {
            state.abilities.shopSlots = Math.min(CONFIG.MAX_SHOP_SLOTS, state.abilities.shopSlots + 1);
        },
    },
    {
        id: 'missile_gunpowder',
        name: '화약 벽 (강화 화약)',
        desc: '벽을 부수면 강화 화약을 얻을 확률이 증가합니다. (MIN 10%, MAX 20%)',
        rarity: 'RARE',
        cost: 5,
        available: () => (state.abilities.missileGunpowderProb ?? 0) < 0.20,
        apply: () => {
            const cur = state.abilities.missileGunpowderProb ?? 0;
            if (cur <= 0) state.abilities.missileGunpowderProb = 0.10;
            else state.abilities.missileGunpowderProb = Math.min(0.20, cur + 0.01);
            // 확률이 변했으므로 모든 청크의 미로 텍스처 무효화(화약 점 표시 갱신)
            state.chunks.forEach(c => c.mazeTex = null);
        },
    },
    {
        id: 'weaken_wall_common',
        name: '일반 벽 약화',
        desc: '갈색/파랑/녹색 벽 내구도 1% 감소',
        rarity: 'COMMON',
        cost: 3,
        available: () => true,
        apply: () => {
            state.abilities.wallDurabilityMultCommon = Math.max(0.10, (state.abilities.wallDurabilityMultCommon ?? 1.0) * 0.99);
        },
    },
    {
        id: 'weaken_wall_rare',
        name: '희귀 벽 약화',
        desc: '보라/노랑/주황 벽 내구도 1% 감소',
        rarity: 'RARE',
        cost: 5,
        available: () => true,
        apply: () => {
            state.abilities.wallDurabilityMultRare = Math.max(0.10, (state.abilities.wallDurabilityMultRare ?? 1.0) * 0.99);
        },
    },
    {
        id: 'weaken_wall_epic',
        name: '영웅 벽 약화',
        desc: '회색/흰색 벽 내구도 1% 감소',
        rarity: 'EPIC',
        cost: 15,
        available: () => true,
        apply: () => {
            state.abilities.wallDurabilityMultEpic = Math.max(0.10, (state.abilities.wallDurabilityMultEpic ?? 1.0) * 0.99);
        },
    },
    {
        id: 'weaken_wall_legendary',
        name: '전설 벽 약화',
        desc: '검정(레벨) 벽 내구도 1% 감소',
        rarity: 'LEGENDARY',
        cost: 30,
        available: () => true,
        apply: () => {
            state.abilities.wallDurabilityMultLegendary = Math.max(0.10, (state.abilities.wallDurabilityMultLegendary ?? 1.0) * 0.99);
        },
    },
    {
        id: 'gain_life',
        name: '목숨 +1',
        desc: '하트를 1개 회복합니다.',
        rarity: 'COMMON',
        cost: 1,
        available: () => state.player.lives < state.abilities.maxLives, // 최대 체력이면 구매 불가
        apply: () => {
            state.player.lives = Math.min(state.abilities.maxLives, state.player.lives + 1);
        },
    },
    {
        id: 'max_lives',
        name: '최대 목숨 증가 +1',
        desc: '최대 하트 개수가 1개 늘어납니다. (최대 10회)',
        rarity: 'EPIC',
        cost: 20,
        available: () => (state.abilities.maxLives - 3) < 10,
        apply: () => {
            state.abilities.maxLives++;
            state.player.lives++;
        },
    },
    {
        id: 'lethal_missile',
        name: '살상 미사일',
        desc: '미사일이 추격자를 파괴할 수 있습니다. (다음 맵에서 무작위 부활)',
        rarity: 'LEGENDARY',
        cost: 30,
        available: () => !state.abilities.killMissileUnlocked,
        apply: () => {
            state.abilities.killMissileUnlocked = true;
        },
    },
    {
        id: 'shield',
        name: '실드',
        desc: '1회 피격 무효. 피격 후 1초 무적. 다음 청크로 넘어가면 최대치로 재충전됩니다. (최대 3개)',
        rarity: 'LEGENDARY',
        cost: 50,
        available: () => (state.abilities.shieldMax ?? 0) < 3,
        apply: () => {
            state.abilities.shieldMax = Math.min(3, (state.abilities.shieldMax ?? 0) + 1);
            // 구매 즉시 1개 지급(청크 내 자동 재충전은 없지만 구매는 "획득"으로 처리)
            state.player.shieldCharges = Math.min(state.abilities.shieldMax, (state.player.shieldCharges ?? 0) + 1);
        },
    },
    {
        id: 'heart_drop',
        name: '하트 드롭',
        desc: '필드에 낮은 확률로 하트가 드롭됩니다. 획득 시 최대 체력까지 회복. (0.1%p씩 증가, 최대 10%)',
        rarity: 'LEGENDARY',
        cost: 50,
        available: () => (state.abilities.heartDropChance ?? 0) < 0.10,
        apply: () => {
            state.abilities.heartDropChance = Math.min(0.10, (state.abilities.heartDropChance ?? 0) + 0.001);
        },
    },
];

function openAbilityModal(floor) {
    state.ui.modalOpen = true;
    // 층이 바뀌면 공지 메시지는 1회만 보여주도록(없으면 빈 문자열)
    if (!state.ui.abilityNotice) state.ui.abilityNotice = '';
    // 화면은 월드로 두고(정지), 모달만 표시
    state.mode = 'WORLD';
    state.ui.abilityRerollCost = 1; // 층마다 리롤 비용 초기화
    state.ui.boughtAbilities.clear();
    rollAbilityChoices();
    renderAbilityModal(floor);
    const modal = document.getElementById('ability-modal');
    if (modal) modal.classList.remove('hidden');

    // 상점 진입 효과음 재생 (1회)
    playBgmFile('resource/cute-level-up-2-189851.mp3', false);
}

function closeAbilityModal() {
    const modal = document.getElementById('ability-modal');
    if (modal) modal.classList.add('hidden');
    state.ui.modalOpen = false;
    // 공지는 닫을 때 초기화(다음 상점에서 재사용 방지)
    state.ui.abilityNotice = '';

    // 대기 중인 청크 진입이 있으면 실행
    if (state.ui.pendingEnter) {
        const { x, y, entryDir } = state.ui.pendingEnter;
        state.ui.pendingEnter = null;
        enterMaze(x, y, entryDir);
    } else {
        // 만약 대기 중인 진입이 없는데 모드가 WORLD라면 MAZE로 복구 시도 (세이프가드)
        if (state.mode === 'WORLD') {
            state.mode = 'MAZE';
        }
    }
    updateUI();

    // 일반 게임 BGM으로 복귀 (다음 트랙 재생)
    playNextBgmTrack();
}

function rollAbilityChoices() {
    const choices = [];
    const used = new Set();
    const slotCount = state.abilities.shopSlots || 3;
    // "보여줄 수 있는" 후보: 선행 조건(requires)은 만족하지 않아도 표시하되,
    // 구매 버튼에서 잠김/사유를 명확히 보여준다.
    const isEligibleToShow = (a) => a.available();

    // 슬롯 개수만큼 뽑기
    for (let slot = 0; slot < slotCount; slot++) {
        // 희귀도 결정
        const r = Math.random();
        const probs = CONFIG.RARITY_PROBS;
        const bonus = state.abilities.rarityBonus;

        const pLeg = (probs.LEGENDARY + bonus.LEGENDARY);
        const pEpic = pLeg + (probs.EPIC + bonus.EPIC);
        const pRare = pEpic + (probs.RARE + bonus.RARE);

        let rarity = 'COMMON';
        if (r < pLeg) rarity = 'LEGENDARY';
        else if (r < pEpic) rarity = 'EPIC';
        else if (r < pRare) rarity = 'RARE';

        // 해당 희귀도의 가능한 어빌리티 풀 구성
        let pool = ABILITY_DEFS.filter(a => a.rarity === rarity && isEligibleToShow(a) && !used.has(a.id));

        // 만약 해당 희귀도에 남은 어빌리티가 없으면 하위 희귀도로 시도
        if (pool.length === 0) {
            const rarities = ['LEGENDARY', 'EPIC', 'RARE', 'COMMON'];
            const curIdx = rarities.indexOf(rarity);
            for (let i = curIdx + 1; i < rarities.length; i++) {
                pool = ABILITY_DEFS.filter(a => a.rarity === rarities[i] && isEligibleToShow(a) && !used.has(a.id));
                if (pool.length > 0) break;
            }
        }

        // 여전히 풀이 비어있다면(거의 불가능하지만) 전체 풀에서 가용한 것 중 하나
        if (pool.length === 0) {
            pool = ABILITY_DEFS.filter(a => isEligibleToShow(a) && !used.has(a.id));
        }

        if (pool.length > 0) {
            const a = pool[Math.floor(Math.random() * pool.length)];
            used.add(a.id);
            choices.push(a.id);
        }
    }
    state.ui.abilityChoices = choices;
}

function renderAbilityModal(floor = getFloor()) {
    const coinsEl = document.getElementById('ability-coin-count');
    const floorEl = document.getElementById('ability-floor');
    const listEl = document.getElementById('ability-choices');
    const rerollBtn = document.getElementById('ability-reroll');
    const rerollCostEl = document.getElementById('ability-reroll-cost');
    const statusEl = document.getElementById('ability-status');

    if (coinsEl) coinsEl.textContent = String(state.coins);
    if (floorEl) floorEl.textContent = String(floor);
    const freeLeft = Math.max(0, Math.floor(state.ui.freeRerollsLeft ?? 0));
    if (rerollCostEl) {
        rerollCostEl.textContent = (freeLeft > 0)
            ? `0 (무료 ${freeLeft})`
            : String(state.ui.abilityRerollCost);
    }
    if (rerollBtn) rerollBtn.disabled = (freeLeft > 0) ? false : (state.coins < state.ui.abilityRerollCost);
    if (rerollBtn) {
        rerollBtn.title = (freeLeft > 0)
            ? `무료 리롤 ${freeLeft}회 남음`
            : ((state.coins < state.ui.abilityRerollCost)
                ? `코인이 부족합니다. (필요: ${state.ui.abilityRerollCost})`
                : '');
    }

    if (statusEl) {
        const probs = CONFIG.RARITY_PROBS;
        const bonus = state.abilities.rarityBonus;
        const stats = [
            { label: '이속 보너스', val: `+${((state.abilities.moveSpeedMult - 1) * 100).toFixed(1)}%` },
            { label: '벽부수기', val: state.abilities.wallBreakUnlocked ? 'ON' : '10층부터 자동' },
            { label: '벽부수기 속도', val: `x${state.abilities.wallBreakSpeedMult.toFixed(2)}` },
            { label: '미사일 확률', val: `x${state.abilities.missileSpawnChanceMult.toFixed(2)}` },
            { label: '기절 보너스', val: `+${(state.abilities.missileStunBonusMs / 1000).toFixed(1)}s` },
            { label: '미사일 투사체', val: `${state.abilities.missileCount}개` },
            { label: '코인 벽 확률', val: state.abilities.goldWallUnlocked ? `${(state.abilities.goldWallProb * 100).toFixed(1)}%` : '잠김' },
            { label: '코인 벽 코인', val: `${state.abilities.coinWallCoinAmount ?? 5}` },
            { label: '코인 보너스', val: `+${state.abilities.coinGainBonus ?? 0}` },
            { label: '강화 화약 확률', val: state.abilities.missileGunpowderProb > 0 ? `${(state.abilities.missileGunpowderProb * 100).toFixed(1)}%` : '잠김' },
            { label: '실드', val: `${state.player.shieldCharges ?? 0}/${state.abilities.shieldMax ?? 0}` },
            { label: '상점 슬롯', val: `${state.abilities.shopSlots}개` },
            { label: '확률(일/희/영/전)', val: `${((probs.COMMON+bonus.COMMON)*100).toFixed(0)}/${((probs.RARE+bonus.RARE)*100).toFixed(0)}/${((probs.EPIC+bonus.EPIC)*100).toFixed(0)}/${((probs.LEGENDARY+bonus.LEGENDARY)*100).toFixed(1)}%` },
        ];
        const notice = (state.ui?.abilityNotice)
            ? `<div class="ability-notice">${state.ui.abilityNotice}</div>`
            : '';
        statusEl.innerHTML =
            notice +
            stats.map(s => `<div class="stat-item">${s.label}: <span class="stat-val">${s.val}</span></div>`).join('');
    }

    if (!listEl) return;
    listEl.innerHTML = '';

    for (const id of state.ui.abilityChoices) {
        const def = ABILITY_DEFS.find(a => a.id === id);
        if (!def) continue;

        const isBought = state.ui.boughtAbilities.has(id);

        const el = document.createElement('div');
        el.className = `ability-choice rarity-${def.rarity.toLowerCase()}`;
        if (isBought) el.style.opacity = '0.4';

        const rarityBadge = document.createElement('div');
        rarityBadge.className = `rarity-badge bg-${def.rarity.toLowerCase()}`;
        rarityBadge.textContent = def.rarity === 'COMMON' ? '일반' : def.rarity === 'RARE' ? '희귀' : def.rarity === 'EPIC' ? '영웅' : '전설';

        const name = document.createElement('div');
        name.className = 'ability-name';
        name.textContent = def.name;

        const desc = document.createElement('div');
        desc.className = 'ability-desc';
        desc.textContent = def.desc;

        const costEl = document.createElement('div');
        const extraCost = (def.noExtraCost)
            ? 0
            : (state.abilities.boughtCountByRarity[def.rarity] || 0) * (def.rarity === 'COMMON' ? 1 : def.rarity === 'RARE' ? 2 : def.rarity === 'EPIC' ? 5 : 10);
        const finalCost = def.cost + extraCost;
        const meetsReq = (typeof def.requires === 'function') ? !!def.requires() : true;
        const canBuy = state.coins >= finalCost && def.available() && meetsReq && !isBought;

        costEl.className = 'ability-cost';
        costEl.textContent = `비용: ${finalCost}`;
        if (!isBought && !canBuy && meetsReq && state.coins < finalCost) {
            costEl.classList.add('insufficient');
        }

        const btn = document.createElement('button');
        btn.className = 'btn btn-buy';
        btn.textContent = isBought
            ? '구매 완료'
            : (canBuy
                ? '구매'
                : (!meetsReq
                    ? (def.lockedText || '잠김')
                    : (def.available() ? '코인 부족' : '구매 불가')));
        btn.disabled = !canBuy;
        btn.title = !canBuy
            ? (isBought
                ? ''
                : (!meetsReq ? (def.lockedText || '잠김')
                    : (state.coins < finalCost ? `코인 부족 (필요: ${finalCost})`
                        : (def.available() ? '구매 불가' : '최대/비활성'))))
            : '';
        btn.addEventListener('click', () => {
            if (!state.ui.modalOpen) return;
            if (state.coins < finalCost) return;
            if (!def.available() || state.ui.boughtAbilities.has(id)) return;
            if ((typeof def.requires === 'function') && !def.requires()) return;

            state.coins -= finalCost;
            // 금융 어빌리티 등은 "추가비용 상승 없음": 구매 횟수에도 반영하지 않음
            if (!def.noExtraCost) state.abilities.boughtCountByRarity[def.rarity]++;
            state.ui.boughtAbilities.add(id);
            def.apply();
            renderAbilityModal(floor);
            updateUI();
        });

        el.appendChild(rarityBadge);
        el.appendChild(name);
        el.appendChild(desc);
        el.appendChild(costEl);
        el.appendChild(btn);
        listEl.appendChild(el);
    }
}


