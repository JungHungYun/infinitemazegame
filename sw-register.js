// Service Worker 등록 + 업데이트 감지
// - SW가 업데이트되면 사용자에게 새로고침 안내를 띄웁니다.

function showUpdateHint() {
  const msgEl = document.getElementById('leaderboard-msg');
  if (!msgEl) return;
  msgEl.textContent = '새 버전이 감지되었습니다. 새로고침하면 최신 버전이 적용됩니다.';
  msgEl.style.color = '#9ad1ff';
}

async function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

    // 매 로드마다 업데이트 체크(기본 24h 대기 문제 회피)
    reg.update().catch(() => {});

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // 기존 컨트롤러가 있는 상태에서 새 SW가 설치 완료면 업데이트 안내
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateHint();
        }
      });
    });
  } catch (_) {
    // SW 등록 실패는 치명적이지 않으므로 조용히 무시
  }
}

registerSw();


