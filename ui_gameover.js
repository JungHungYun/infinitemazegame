// 게임 오버 UI (game.js에서 분리)
// 주의: 이 파일은 game.js보다 먼저/나중 어느 쪽에 로드되어도 동작하도록,
// 실제 실행(호출)은 런타임에만 일어나게 설계되어 있습니다.

function initGameOverUI() {
    const modal = document.getElementById('gameover-modal');
    const restartBtn = document.getElementById('gameover-restart');
    if (!modal || !restartBtn) return;

    restartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.restartRun === 'function') window.restartRun();
        else window.location.reload();
    });
}

function closeGameOverModal() {
    const modal = document.getElementById('gameover-modal');
    if (modal) modal.classList.add('hidden');
    // state는 game.js에 정의됨
    if (typeof state !== 'undefined' && state?.ui) state.ui.gameOverOpen = false;
}

function formatTimeMMSS(totalSec) {
    const s = Math.max(0, Math.floor(totalSec || 0));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

function openGameOverModal() {
    if (typeof state === 'undefined' || !state?.ui) return;
    if (state.ui.gameOverOpen) return;
    state.ui.gameOverOpen = true;

    // 다른 모달/대기 진입은 정리 (게임오버에서 다시 진행되지 않게)
    state.ui.pendingEnter = null;
    state.ui.modalOpen = false;

    const abilityModal = document.getElementById('ability-modal');
    if (abilityModal) abilityModal.classList.add('hidden');

    // closeSettingsModal은 game.js에 정의됨(없어도 안전)
    if (typeof closeSettingsModal === 'function') closeSettingsModal();

    const modal = document.getElementById('gameover-modal');
    if (modal) modal.classList.remove('hidden');

    const floor = Math.max(1, Math.floor(state.ui.maxFloorReached ?? (typeof getFloor === 'function' ? getFloor() : 1) ?? 1));
    const score = Math.max(0, Math.floor(state.score ?? 0));
    const coins = Math.max(0, Math.floor(state.coins ?? 0));
    const caught = Math.max(0, Math.floor(state.chaser?.caughtCount ?? 0));
    const bossKills = Math.max(0, Math.floor(state.ui.bossKills ?? 0));

    const runStart = (state.ui.runStartMs ?? state.nowMs);
    const timeSec = Math.max(0, (state.nowMs - runStart) / 1000);

    const setText = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(v);
    };

    setText('gameover-floor', floor);
    setText('gameover-score', score);
    setText('gameover-coins', coins);
    setText('gameover-time', formatTimeMMSS(timeSec));
    setText('gameover-caught', caught);
    setText('gameover-boss-kills', bossKills);

    // 사운드 정리(마찰음은 유지할 이유가 없음)
    if (typeof setWallRubContact === 'function') setWallRubContact(false, 0);

    // 게임 오버 효과음
    if (typeof playSfx === 'function') {
        try { playSfx('resource/game-over-arcade-6435.mp3'); } catch (_) {}
    }

    // 리더보드 업로드(로그인한 경우에만)
    if (typeof window.leaderboardSubmitScore === 'function') {
        window.leaderboardSubmitScore({ score, floor }).catch?.(() => {});
    }
}


