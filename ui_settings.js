// 설정 모달(UI) - game.js에서 분리

function initSettingsModalUI() {
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-close');
    const sfxSlider = document.getElementById('settings-sfx');
    const bgmSlider = document.getElementById('settings-bgm');
    const sfxVal = document.getElementById('settings-sfx-val');
    const bgmVal = document.getElementById('settings-bgm-val');

    if (!modal || !closeBtn || !sfxSlider || !bgmSlider || !sfxVal || !bgmVal) return;

    const render = () => {
        const sfxPct = Math.round((state.audio.sfx.master ?? 0.85) * 100);
        const bgmPct = Math.round((state.audio.bgm.volume ?? 0.35) * 100);
        sfxSlider.value = String(sfxPct);
        bgmSlider.value = String(bgmPct);
        sfxVal.textContent = `${sfxPct}%`;
        bgmVal.textContent = `${bgmPct}%`;
    };

    const setSfx = (pct) => {
        const v = Math.max(0, Math.min(100, pct)) / 100;
        state.audio.sfx.master = v;
        sfxVal.textContent = `${Math.round(v * 100)}%`;
    };

    const setBgm = (pct) => {
        const v = Math.max(0, Math.min(100, pct)) / 100;
        setBgmVolume(v);
        bgmVal.textContent = `${Math.round(v * 100)}%`;
    };

    sfxSlider.addEventListener('input', () => setSfx(Number(sfxSlider.value)));
    bgmSlider.addEventListener('input', () => setBgm(Number(bgmSlider.value)));

    closeBtn.addEventListener('click', () => closeSettingsModal());

    render();
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('hidden');
    state.ui.settingsOpen = true;
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
    state.ui.settingsOpen = false;
}

function toggleSettingsModal() {
    if (state.ui.settingsOpen) closeSettingsModal();
    else openSettingsModal();
}


