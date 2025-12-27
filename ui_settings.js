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

        // 조작 방식(터치/자이로)은 "터치 디바이스" 뿐 아니라 "자이로 지원" 기기에서도 노출
        const isTouch = ((navigator.maxTouchPoints || 0) > 0) || ('ontouchstart' in window);
        const canGyro = (typeof DeviceOrientationEvent !== 'undefined');
        const showControls = !!state.ui.isMobile || isTouch || canGyro;
        if (controlRow) controlRow.classList.toggle('hidden', !showControls);
        if (controlMsg) controlMsg.classList.toggle('hidden', !showControls);
        const mode = String(state.controls?.mobileMode || 'touch');
        if (touchBtn) touchBtn.classList.toggle('active', mode === 'touch');
        if (gyroBtn) gyroBtn.classList.toggle('active', mode === 'gyro');
        if (gyroCal) gyroCal.classList.toggle('hidden', !(showControls && (state.controls?.mobileMode === 'gyro')));

        if (controlMsg && showControls) {
            if (state.controls?.mobileMode === 'gyro') {
                const g = state.controls?.gyro || state.controls?.gyro;
                const last = state.controls?.gyro?._lastEventTs;
                const hasEvents = (state.controls?.gyro?._eventCount || 0) > 0;
                const tail = !canGyro
                    ? ' (이 브라우저/기기는 DeviceOrientation을 지원하지 않습니다)'
                    : (!hasEvents ? ' (센서 데이터가 아직 들어오지 않아요: 권한 허용/HTTPS/사파리 설정을 확인하세요)' : '');
                controlMsg.textContent = `자이로 모드: 기기를 기울여 이동합니다. iOS는 처음 1회 권한 허용이 필요할 수 있어요.${tail}`;
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
                if (typeof DeviceOrientationEvent === 'undefined') {
                    throw new Error('이 기기는 자이로(DeviceOrientation)를 지원하지 않습니다.');
                }
                if (typeof window.enableGyroControls === 'function') {
                    await window.enableGyroControls();
                } else if (typeof enableGyroControls === 'function') {
                    await enableGyroControls();
                } else {
                    throw new Error('자이로 초기화 함수가 없습니다.');
                }
                state.controls.mobileMode = 'gyro';
                // 센서 이벤트가 실제로 들어오는지 간단 점검(안 들어오면 "안 바뀌는 것처럼" 보일 수 있음)
                const g = state.controls.gyro;
                const before = g?._eventCount || 0;
                await new Promise((r) => setTimeout(r, 400));
                const after = g?._eventCount || 0;
                if (controlMsg && after <= before) {
                    controlMsg.textContent = '자이로는 켰지만 센서 데이터가 들어오지 않습니다. iOS/Safari는 설정에서 “동작 및 방향 접근” 허용 + HTTPS가 필요할 수 있어요.';
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
                const g = state.controls?.gyro;
                if (!g?.enabled) throw new Error('자이로 모드를 먼저 켜주세요.');
                if ((g._eventCount || 0) <= 0) throw new Error('센서 데이터가 아직 없습니다. 권한을 허용한 뒤 다시 시도하세요.');
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


