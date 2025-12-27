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
        // 무료 티켓: 리롤 3회 무료
        const freeLeft = Math.max(0, Math.floor(state.ui.freeRerollsLeft ?? 0));
        const isFree = freeLeft > 0;
        const cost = isFree ? 0 : state.ui.abilityRerollCost;
        if (!isFree) {
            if (state.coins < cost) return;
            state.coins -= cost;
            state.ui.abilityRerollCost += 1; // 유료 리롤: 비용 증가
        } else {
            state.ui.freeRerollsLeft = freeLeft - 1;
            // 무료 소진 시 티켓 구매 직전 비용으로 복구
            if ((state.ui.freeRerollsLeft ?? 0) <= 0) {
                state.ui.abilityRerollCost = Math.max(1, Math.floor(state.ui.freeRerollRestoreCost ?? state.ui.abilityRerollCost ?? 1));
            }
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
        name: '자동 저금통',
        desc: '일정 시간마다 자동으로 코인을 획득합니다. 초기 간격은 10초이며, 코인을 받을 때마다 간격이 0.25초씩 감소합니다. 최소 간격은 1초까지 가능하며, 최대 9초까지 단축됩니다. 게임이 진행되는 동안 지속적으로 작동합니다.',
        rarity: 'RARE',
        cost: 5,
        noExtraCost: true,
        available: () => !state.abilities?.bankDeposit?.enabled,
        apply: () => {
            state.abilities.bankDeposit.enabled = true;
            state.abilities.bankDeposit.timerMs = 0;
            state.abilities.bankDeposit.intervalMs = Math.max(1000, Number(state.abilities.bankDeposit.intervalMs || 10000));
        },
    },
    {
        id: 'bank_saving',
        name: '오르막 이자',
        desc: '특정 층수를 통과할 때마다 이자로 10코인을 획득합니다. 초기에는 5층마다 지급되며, 이자를 받을 때마다 필요 층수가 1층씩 감소합니다. 최소 1층마다 지급되며, 계속 획득할수록 더 자주 받을 수 있습니다.',
        rarity: 'EPIC',
        cost: 20,
        noExtraCost: true,
        available: () => !state.abilities?.bankSaving?.enabled,
        apply: () => {
            state.abilities.bankSaving.enabled = true;
            state.abilities.bankSaving.targetFloors = Math.max(1, Math.floor(state.abilities.bankSaving.targetFloors || 5));
            state.abilities.bankSaving.progress = 0;
        },
    },
    {
        id: 'living_loan',
        name: '신용카드',
        desc: '즉시 20코인을 받지만, 이후 상환해야 합니다. 5개 층을 통과한 후부터 5초마다 1코인씩 자동 상환됩니다. 만약 코인이 음수가 되면 패널티가 발생하여 1초마다 추가 상환액이 1씩 증가하며, 그만큼 더 많이 상환해야 합니다. 위험하지만 즉시 자금이 필요한 상황에 유용합니다.',
        rarity: 'EPIC',
        cost: -20, // 보너스(코인 지급)
        noExtraCost: true,
        available: () => true,
        apply: () => {
            // 실제 상환/패널티는 game.js의 updateEconomy/onFloorPassed가 처리
            const loan = state.abilities.livingLoan;
            loan.debt = Math.max(0, Math.floor(loan.debt || 0)) + 20;
            loan.graceFloors = Math.max(Math.floor(loan.graceFloors || 0), 5);
        },
    },
    {
        id: 'life_loan',
        name: '죽음의 거래',
        desc: '즉시 50코인을 받지만, 목숨 2개를 즉시 소모합니다. 목숨이 0 이하가 되면 즉시 게임 오버됩니다. 매우 위험한 거래이지만 큰 자금이 필요할 때 사용할 수 있습니다. 목숨이 충분할 때만 고려하세요.',
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
        name: '행운의 동전',
        desc: '즉시 5코인을 획득합니다. 추가 효과는 없지만 즉시 사용 가능한 자금을 제공합니다.',
        rarity: 'COMMON',
        cost: -5, // 보너스(코인 지급)
        noExtraCost: true,
        available: () => true,
        apply: () => {},
    },
    {
        id: 'free_ticket',
        name: '리롤 쿠폰',
        desc: '어빌리티 리롤을 3회 무료로 사용할 수 있는 티켓을 획득합니다. 티켓은 다음 상점에서도 사용할 수 있으며, 무료 티켓을 모두 사용하면 리롤 비용이 구매 직전 상태로 복구됩니다. 리롤 비용이 계속 증가하는 상황에서 유용합니다.',
        rarity: 'COMMON',
        cost: 3,
        noExtraCost: true,
        available: () => true,
        apply: () => {
            const add = 3;
            const curTickets = Math.max(0, Math.floor(state.abilities.freeRerollTickets || 0));
            // 티켓이 없던 상태에서 처음 구매하는 경우에만 "구매 직전 비용"을 저장
            if (curTickets <= 0) {
                state.abilities.freeRerollRestoreCost = Math.max(1, Math.floor(state.ui.abilityRerollCost || 1));
            }
            state.abilities.freeRerollTickets = curTickets + add;
        },
    },

    {
        id: 'wall_break_speed',
        name: '파워 해머',
        desc: `벽을 문대는 속도가 10% 증가합니다. 벽을 부수는 데 걸리는 시간이 줄어들어 더 빠르게 진행할 수 있습니다. 최대 ${CONFIG.MAX_WALL_BREAK_SPEED_MULT}배까지 강화 가능하며, 벽부수기 능력을 먼저 획득해야 합니다.`,
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
        name: '탄약 발견',
        desc: `필드에 미사일 아이템이 등장할 확률이 5% 증가합니다. 미사일을 더 자주 획득할 수 있어 전투력이 향상됩니다. 최대 ${CONFIG.MAX_MISSILE_SPAWN_CHANCE_MULT}배까지 강화 가능합니다.`,
        rarity: 'COMMON',
        cost: 3,
        available: () => state.abilities.missileSpawnChanceMult < CONFIG.MAX_MISSILE_SPAWN_CHANCE_MULT,
        apply: () => {
            state.abilities.missileSpawnChanceMult = Math.min(CONFIG.MAX_MISSILE_SPAWN_CHANCE_MULT, state.abilities.missileSpawnChanceMult + 0.05);
        },
    },
    {
        id: 'coin_field_spawn',
        name: '황금빛 길',
        desc: '각 청크(맵)에 코인이 등장할 확률이 15% 증가하고, 동시에 등장할 수 있는 최대 코인 개수도 증가합니다. 최대 20회까지 강화 가능하며, 코인 수집이 더 쉬워집니다.',
        rarity: 'RARE',
        cost: 5,
        available: () => (state.abilities.coinFieldSpawnBonus ?? 0) < 3.0,
        apply: () => {
            state.abilities.coinFieldSpawnBonus = Math.min(3.0, (state.abilities.coinFieldSpawnBonus ?? 0) + 0.15);
        },
    },
    {
        id: 'missile_field_spawn',
        name: '무기고 확장',
        desc: '필드에 미사일 아이템이 등장할 확률이 2.5% 증가합니다. 최대 100%까지 강화 가능하며, 최초 획득 시 한 청크에 동시에 등장할 수 있는 미사일 최대 개수가 5개로 증가합니다. 미사일을 더 많이 수집할 수 있습니다.',
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
        name: '녹다운 펀치',
        desc: '미사일로 추격자를 맞췄을 때 기절시키는 시간이 0.2초 증가합니다. 추격자가 더 오래 멈춰있어 도망치거나 전략을 세우기 쉬워집니다. 최대 5초까지 강화 가능합니다.',
        rarity: 'COMMON',
        cost: 3,
        available: () => state.abilities.missileStunBonusMs < CONFIG.MAX_MISSILE_STUN_BONUS_MS,
        apply: () => {
            state.abilities.missileStunBonusMs = Math.min(CONFIG.MAX_MISSILE_STUN_BONUS_MS, state.abilities.missileStunBonusMs + 200);
        },
    },
    {
        id: 'missile_count',
        name: '다연발 미사일',
        desc: '미사일을 발사할 때 한 번에 나가는 투사체 개수가 1개 증가합니다. 여러 개의 미사일을 동시에 발사하여 더 강력한 공격이 가능합니다. 최대 5개까지 발사할 수 있습니다.',
        rarity: 'EPIC',
        cost: 15,
        available: () => state.abilities.missileCount < CONFIG.MAX_MISSILE_COUNT,
        apply: () => {
            state.abilities.missileCount = Math.min(CONFIG.MAX_MISSILE_COUNT, state.abilities.missileCount + 1);
        },
    },
    {
        id: 'move_speed',
        name: '질주',
        desc: `플레이어의 이동 속도가 2.5% 영구적으로 증가합니다. 추격자로부터 도망치거나 맵을 빠르게 탐색하는 데 유용합니다. 최대 ${CONFIG.MAX_MOVE_SPEED_MULT}배까지 강화 가능합니다.`,
        rarity: 'COMMON',
        cost: 3,
        available: () => state.abilities.moveSpeedMult < CONFIG.MAX_MOVE_SPEED_MULT,
        apply: () => {
            state.abilities.moveSpeedMult = Math.min(CONFIG.MAX_MOVE_SPEED_MULT, state.abilities.moveSpeedMult + 0.025);
        },
    },
    {
        id: 'gold_wall',
        name: '보물 벽',
        desc: '일반 벽 대신 코인이 포함된 특수 벽(사금벽)이 생성될 확률이 1% 증가합니다. 사금벽을 부수면 코인을 획득할 수 있습니다. 최초 획득 시 10% 확률로 시작하며, 최대 25%까지 강화 가능합니다.',
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
        name: '더 많은 보물',
        desc: '사금벽을 파괴했을 때 획득하는 코인 양이 1개 증가합니다. 기본적으로 5코인을 주지만, 이 어빌리티를 획득하면 6코인, 7코인...으로 계속 증가합니다. 코인 벽 어빌리티를 먼저 획득해야 합니다.',
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
        name: '돈벌이+',
        desc: '필드에서 코인을 획득할 때마다 추가로 1코인을 더 받습니다. 모든 코인 획득에 적용되므로 코인 수집 효율이 크게 향상됩니다. 중첩 가능합니다.',
        rarity: 'COMMON',
        cost: 3,
        available: () => true,
        apply: () => {
            state.abilities.coinGainBonus = (state.abilities.coinGainBonus ?? 0) + 1;
        },
    },
    {
        id: 'missile_wall_break',
        name: '벽 뚫기',
        desc: '미사일이 벽에 부딪혔을 때 일정 확률로 벽을 즉시 파괴합니다. 최초 획득 시 10% 확률로 시작하며, 이후 획득할 때마다 확률이 1%씩 증가합니다. 미사일로 벽을 부수면서 진행할 수 있어 전략적 유연성이 증가합니다.',
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
        name: '행운의 부적',
        desc: '어빌리티 선택창에서 고급 어빌리티가 나올 확률을 조정합니다. 일반 어빌리티 확률이 6% 감소하고, 희귀 +3%, 영웅 +2.5%, 전설 +0.5% 증가합니다. 최대 3회까지 획득 가능하며, 더 강력한 어빌리티를 얻을 기회가 늘어납니다.',
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
        name: '선택의 폭',
        desc: '어빌리티 선택창에서 한 번에 볼 수 있는 어빌리티 개수가 1개 증가합니다. 더 많은 선택지 중에서 원하는 어빌리티를 고를 수 있어 전략의 폭이 넓어집니다. 최대 6개까지 증가 가능합니다.',
        rarity: 'LEGENDARY',
        cost: 30,
        available: () => state.abilities.shopSlots < CONFIG.MAX_SHOP_SLOTS,
        apply: () => {
            state.abilities.shopSlots = Math.min(CONFIG.MAX_SHOP_SLOTS, state.abilities.shopSlots + 1);
        },
    },
    {
        id: 'missile_gunpowder',
        name: '폭발 벽',
        desc: '벽을 부수면 강화 화약을 얻을 확률이 증가합니다. 강화 화약을 사용한 미사일은 더 강한 데미지와 슬로우 효과를 가집니다. 최초 획득 시 10% 확률로 시작하며, 최대 20%까지 강화 가능합니다. 벽에 작은 점으로 표시됩니다.',
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
        name: '초보 벽 파괴',
        desc: '갈색, 파랑, 녹색 벽의 내구도가 2% 영구적으로 감소합니다. 벽을 부수는 데 걸리는 시간이 줄어들어 더 빠르게 진행할 수 있습니다. 중첩 가능하며, 최대 50%까지 감소시킬 수 있습니다.',
        rarity: 'COMMON',
        cost: 3,
        available: () => true,
        apply: () => {
            state.abilities.wallDurabilityMultCommon = Math.max(0.50, (state.abilities.wallDurabilityMultCommon ?? 1.0) * 0.98);
        },
    },
    {
        id: 'weaken_wall_rare',
        name: '중급 벽 파괴',
        desc: '보라색, 노랑색, 주황색 벽의 내구도가 2% 영구적으로 감소합니다. 중간 단계 벽들을 더 쉽게 부술 수 있어 진행 속도가 향상됩니다. 중첩 가능하며, 최대 50%까지 감소시킬 수 있습니다.',
        rarity: 'RARE',
        cost: 5,
        available: () => true,
        apply: () => {
            state.abilities.wallDurabilityMultRare = Math.max(0.50, (state.abilities.wallDurabilityMultRare ?? 1.0) * 0.98);
        },
    },
    {
        id: 'weaken_wall_epic',
        name: '고급 벽 파괴',
        desc: '회색, 흰색 벽의 내구도가 2% 영구적으로 감소합니다. 고급 벽들을 더 빠르게 부술 수 있어 후반 진행이 수월해집니다. 중첩 가능하며, 최대 50%까지 감소시킬 수 있습니다.',
        rarity: 'EPIC',
        cost: 15,
        available: () => true,
        apply: () => {
            state.abilities.wallDurabilityMultEpic = Math.max(0.50, (state.abilities.wallDurabilityMultEpic ?? 1.0) * 0.98);
        },
    },
    {
        id: 'weaken_wall_legendary',
        name: '전설 벽 파괴',
        desc: '검정색 벽의 내구도가 2% 영구적으로 감소합니다. 가장 강한 벽을 더 쉽게 부술 수 있어 최고층 진행이 가능해집니다. 중첩 가능하며, 최대 50%까지 감소시킬 수 있습니다.',
        rarity: 'LEGENDARY',
        cost: 30,
        available: () => true,
        apply: () => {
            state.abilities.wallDurabilityMultLegendary = Math.max(0.50, (state.abilities.wallDurabilityMultLegendary ?? 1.0) * 0.98);
        },
    },
    {
        id: 'gain_life',
        name: '생명의 물약',
        desc: '현재 목숨을 1개 회복합니다. 최대 목숨 수를 초과할 수 없으며, 이미 최대치라면 구매할 수 없습니다. 위험한 상황에서 생존력을 높이는 데 유용합니다.',
        rarity: 'COMMON',
        cost: 1,
        available: () => state.player.lives < state.abilities.maxLives, // 최대 체력이면 구매 불가
        apply: () => {
            state.player.lives = Math.min(state.abilities.maxLives, state.player.lives + 1);
        },
    },
    {
        id: 'max_lives',
        name: '생명력 확장',
        desc: '최대 목숨(하트) 개수가 1개 영구적으로 증가하고, 현재 목숨도 1개 회복됩니다. 기본 3개에서 시작하여 최대 10회까지 강화 가능하며, 총 13개까지 늘릴 수 있습니다. 생존력이 크게 향상됩니다.',
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
        name: '치명타',
        desc: '미사일로 추격자를 맞추면 추격자를 일시적으로 파괴할 수 있습니다. 파괴된 추격자는 다음 청크(맵)로 이동할 때 무작위 위치에서 부활합니다. 추격자로부터 안전하게 도망칠 시간을 벌 수 있는 강력한 능력입니다.',
        rarity: 'LEGENDARY',
        cost: 30,
        available: () => !state.abilities.killMissileUnlocked,
        apply: () => {
            state.abilities.killMissileUnlocked = true;
        },
    },
    {
        id: 'shield',
        name: '보호막',
        desc: '피격을 1회 무효화하는 실드를 획득합니다. 실드가 피격을 막으면 1초간 무적 상태가 됩니다. 다음 청크로 넘어가면 실드가 최대치로 자동 재충전됩니다. 최대 3개까지 보유할 수 있으며, 구매 시 즉시 1개가 지급됩니다.',
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
        name: '생명의 선물',
        desc: '필드에 하트 아이템이 드롭될 확률이 0.1% 증가합니다. 하트를 획득하면 최대 체력까지 완전히 회복됩니다. 최대 10%까지 강화 가능하며, 생존에 큰 도움이 됩니다. 각 청크에서 낮은 확률로 하트가 등장합니다.',
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
    // 무료 티켓: 남아있는 티켓을 이번 상점에 반영
    state.ui.freeRerollsLeft = Math.max(0, Math.floor(state.abilities?.freeRerollTickets ?? 0));
    // 무료 티켓이 없을 때만 리롤 비용 초기화 (무료 티켓이 있으면 이전 상점의 비용 유지)
    if (state.ui.freeRerollsLeft <= 0) {
        state.ui.abilityRerollCost = 1; // 층마다 리롤 비용 초기화 (무료 티켓 없을 때만)
    }
    // 티켓이 없던 상태에서 처음 구매하는 경우를 위해 현재 리롤 비용 저장
    if ((state.abilities?.freeRerollTickets ?? 0) <= 0) {
        state.ui.freeRerollRestoreCost = Math.max(1, Math.floor(state.ui.abilityRerollCost || 1));
    }
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

    // 무료 티켓 잔여를 능력치에 다시 반영
    state.abilities.freeRerollTickets = Math.max(0, Math.floor(state.ui.freeRerollsLeft ?? 0));
    // 무료 티켓이 남아있으면 restoreCost 유지, 없으면 초기화
    if ((state.abilities.freeRerollTickets ?? 0) <= 0) {
        state.abilities.freeRerollRestoreCost = 1;
    }
    state.ui.freeRerollsLeft = 0;
    state.ui.freeRerollRestoreCost = 1;

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
                : `리롤 (비용: ${state.ui.abilityRerollCost} 코인)`);
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
            // 금융 어빌리티 등은 "추가 비용 상승 없음": 구매 횟수에도 반영하지 않음
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


