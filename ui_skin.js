// 캐릭터 스킨 선택 UI - game.js에서 분리
// 주의: CONFIG는 config.js에서 먼저 로드되어 있어야 합니다.

let selectedSkinId = null;

function openSkinSelectModal() {
    console.log('openSkinSelectModal called');
    const modal = document.getElementById('skin-select-modal');
    if (!modal) {
        console.warn('skin-select-modal element not found');
        return;
    }
    
    console.log('Opening skin select modal');
    modal.classList.remove('hidden');
    if (typeof state !== 'undefined' && state.ui) {
        state.ui.modalOpen = true;
    }
    renderSkinChoices();
}

function closeSkinSelectModal() {
    const modal = document.getElementById('skin-select-modal');
    if (!modal) return;
    
    modal.classList.add('hidden');
    if (typeof state !== 'undefined' && state.ui) {
        state.ui.modalOpen = false;
    }
}

// 전역 함수로 즉시 노출 (game.js에서 호출하기 위해)
window.openSkinSelectModal = openSkinSelectModal;
window.closeSkinSelectModal = closeSkinSelectModal;

function renderSkinChoices() {
    const container = document.getElementById('skin-choices');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!CONFIG.CHARACTER_SKINS || CONFIG.CHARACTER_SKINS.length === 0) {
        container.innerHTML = '<div class="ability-status">사용 가능한 스킨이 없습니다.</div>';
        return;
    }
    
    // 기본 선택값 설정 (저장된 값이 없으면 첫 번째 스킨)
    if (!selectedSkinId) {
        selectedSkinId = CONFIG.CHARACTER_SKINS[0]?.id || null;
    }
    
    CONFIG.CHARACTER_SKINS.forEach(skin => {
        const isUnlocked = skin.unlocked !== false; // 기본값은 true
        const isSelected = selectedSkinId === skin.id;
        
        const card = document.createElement('div');
        card.className = `ability-card-item ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
        
        card.innerHTML = `
            <div class="ability-card-header">
                <div class="ability-card-name">${skin.name}</div>
            </div>
            <div class="ability-card-desc">
                ${!isUnlocked ? '(잠금 해제 필요)' : ''}
            </div>
        `;
        
        if (isUnlocked) {
            card.addEventListener('click', () => {
                selectedSkinId = skin.id;
                renderSkinChoices(); // 선택 상태 업데이트
            });
        }
        
        container.appendChild(card);
    });
}

function initSkinSelectUI() {
    const modal = document.getElementById('skin-select-modal');
    const confirmBtn = document.getElementById('skin-select-confirm');
    
    if (!modal || !confirmBtn) return;
    
    confirmBtn.addEventListener('click', () => {
        if (!selectedSkinId) {
            // 기본값으로 첫 번째 스킨 선택
            selectedSkinId = CONFIG.CHARACTER_SKINS[0]?.id || null;
        }
        
        // 선택된 스킨 저장 (나중에 게임에서 사용)
        if (selectedSkinId && typeof state !== 'undefined' && state.player) {
            state.player.selectedSkin = selectedSkinId;
        }
        
        closeSkinSelectModal();
        
        // 스킨 선택 완료 후 게임 시작
        if (typeof window.startGameAfterSkinSelect === 'function') {
            window.startGameAfterSkinSelect();
        } else if (typeof startGameAfterSkinSelect === 'function') {
            startGameAfterSkinSelect();
        }
    });
    
    // ESC 키로 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeSkinSelectModal();
        }
    });
}

// DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSkinSelectUI);
} else {
    initSkinSelectUI();
}

