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

// 스킨 미리보기 이미지 생성 함수
function createSkinPreview(skinColor) {
    const canvas = document.createElement('canvas');
    const size = 80;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // buildPlayerOrbSprite와 유사한 방식으로 미리보기 생성
    const r = size * 0.3;
    const pad = 10;
    const centerX = size / 2;
    const centerY = size / 2;
    
    // 색상을 RGB로 변환
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 255, b: 255 };
    };
    const rgb = hexToRgb(skinColor);
    
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.globalCompositeOperation = 'lighter';
    
    // 코어 글로우
    ctx.shadowBlur = 12;
    ctx.shadowColor = skinColor;
    const core = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r * 1.25);
    core.addColorStop(0.00, 'rgba(255,255,255,0.98)');
    core.addColorStop(0.12, `rgba(${Math.min(255, rgb.r + 100)},${Math.min(255, rgb.g + 100)},${Math.min(255, rgb.b + 100)},0.80)`);
    core.addColorStop(0.35, `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`);
    core.addColorStop(1.00, `rgba(${rgb.r},${rgb.g},${rgb.b},0.00)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    ctx.fill();
    
    // 내부 하얀 코어
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    
    // 외곽 링
    ctx.shadowBlur = 10;
    ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.18)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.03, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
    
    return canvas.toDataURL();
}

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
        
        // 스킨 미리보기 이미지 생성
        const previewImg = skin.color ? createSkinPreview(skin.color) : '';
        
        card.innerHTML = `
            <div class="ability-card-header">
                <div class="ability-card-name">${skin.name}</div>
            </div>
            ${previewImg ? `<div class="skin-preview" style="text-align: center; margin: 10px 0;">
                <img src="${previewImg}" alt="${skin.name} 미리보기" style="width: 80px; height: 80px; image-rendering: pixelated;">
            </div>` : ''}
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

