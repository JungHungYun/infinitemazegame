// 설정 모달(UI) - game.js에서 분리

function initSettingsModalUI() {
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-close');
    const sfxSlider = document.getElementById('settings-sfx');
    const bgmSlider = document.getElementById('settings-bgm');
    const sfxVal = document.getElementById('settings-sfx-val');
    const bgmVal = document.getElementById('settings-bgm-val');
    const controlRow = document.getElementById('settings-control-row');
    const touchBtn = document.getElementById('settings-control-touch');
    const gyroBtn = document.getElementById('settings-control-gyro');
    const gyroCal = document.getElementById('settings-gyro-calibrate');
    const controlMsg = document.getElementById('settings-control-msg');

    if (!modal || !closeBtn || !sfxSlider || !bgmSlider || !sfxVal || !bgmVal) return;

    const render = () => {
        const sfxPct = Math.round((state.audio.sfx.master ?? 0.85) * 100);
        const bgmPct = Math.round((state.audio.bgm.volume ?? 0.35) * 100);
        sfxSlider.value = String(sfxPct);
        bgmSlider.value = String(bgmPct);
        sfxVal.textContent = `${sfxPct}%`;
        bgmVal.textContent = `${bgmPct}%`;

        // 모바일(터치 기기)에서만 조작 방식 노출
        const isMobile = !!state.ui.isMobile || ((navigator.maxTouchPoints || 0) > 0);
        if (controlRow) controlRow.classList.toggle('hidden', !isMobile);
        if (controlMsg) controlMsg.classList.toggle('hidden', !isMobile);
        const mode = String(state.controls?.mobileMode || 'touch');
        if (touchBtn) touchBtn.classList.toggle('active', mode === 'touch');
        if (gyroBtn) gyroBtn.classList.toggle('active', mode === 'gyro');
        if (gyroCal) gyroCal.classList.toggle('hidden', !(isMobile && (state.controls?.mobileMode === 'gyro')));

        if (controlMsg && isMobile) {
            if (state.controls?.mobileMode === 'gyro') {
                controlMsg.textContent = '자이로 모드: 기기를 기울여 이동합니다. iOS는 처음 1회 권한 허용이 필요할 수 있어요.';
            } else {
                controlMsg.textContent = '';
            }
        }
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

    async function setMobileMode(next) {
        if (!state.controls) state.controls = { mobileMode: 'touch', gyro: { enabled: false } };
        if (next === 'gyro') {
            try {
                state.controls.mobileMode = 'gyro';
                if (typeof window.enableGyroControls === 'function') {
                    await window.enableGyroControls();
                } else if (typeof enableGyroControls === 'function') {
                    await enableGyroControls();
                } else {
                    throw new Error('자이로 초기화 함수가 없습니다.');
                }
            } catch (e) {
                // 실패 시 터치로 롤백
                state.controls.mobileMode = 'touch';
                try { if (typeof disableGyroControls === 'function') disableGyroControls(); } catch (_) {}
                if (controlMsg) controlMsg.textContent = `자이로 활성화 실패: ${String(e?.message || e)}`;
            }
        } else {
            state.controls.mobileMode = 'touch';
            try { if (typeof disableGyroControls === 'function') disableGyroControls(); } catch (_) {}
        }
        render();
    }

    if (touchBtn) touchBtn.addEventListener('click', () => setMobileMode('touch'));
    if (gyroBtn) gyroBtn.addEventListener('click', () => setMobileMode('gyro'));

    if (gyroCal) {
        gyroCal.addEventListener('click', () => {
            try {
                if (typeof calibrateGyroNeutral === 'function') calibrateGyroNeutral();
                if (controlMsg) controlMsg.textContent = '중립값을 저장했습니다.';
            } catch (e) {
                if (controlMsg) controlMsg.textContent = `중립 설정 실패: ${String(e?.message || e)}`;
            }
            render();
        });
    }

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


