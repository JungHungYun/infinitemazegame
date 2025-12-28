// 로그인/회원가입 UI (Supabase Auth)
// 비밀번호를 직접 SQL 테이블에 저장하지 않습니다. (보안상 금지)

function setAuthMsg(msg, isError = false) {
    const el = document.getElementById('auth-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#ff9aa2' : '#9ad1ff';
}

function setAuthStatus(text) {
    const el = document.getElementById('auth-status');
    if (el) el.textContent = text || '';
}

function toggleAuthButtons(isSignedIn) {
    const signInBtn = document.getElementById('auth-signin');
    const signUpBtn = document.getElementById('auth-signup');
    const signOutBtn = document.getElementById('auth-signout');
    if (signInBtn) signInBtn.classList.toggle('hidden', !!isSignedIn);
    if (signUpBtn) signUpBtn.classList.toggle('hidden', !!isSignedIn);
    if (signOutBtn) signOutBtn.classList.toggle('hidden', !isSignedIn);
}

function clearAuthInputs() {
    const emailEl = document.getElementById('auth-email');
    const pwEl = document.getElementById('auth-password');
    const nameEl = document.getElementById('auth-username');
    if (emailEl) emailEl.value = '';
    if (pwEl) pwEl.value = '';
    if (nameEl) nameEl.value = '';
}

async function upsertProfile(userId, username) {
    if (!username) return;
    const sb = window.supabaseClient;
    if (!sb) return;
    const name = String(username).trim().slice(0, 24);
    if (!name) return;

    // profiles: id(uuid) PK, username(text)
    const { error } = await sb.from('profiles').upsert({ id: userId, username: name });
    if (error) {
        // unique violation
        if (String(error.code) === '23505') {
            setAuthMsg('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력하세요.', true);
            return;
        }
        setAuthMsg(error.message, true);
    }
}

async function ensureProfileFromUser(user, usernameFromInput = '') {
    if (!user?.id) return;
    const fromInput = String(usernameFromInput || '').trim();
    const fromMeta = String(user?.user_metadata?.username || '').trim();
    const name = (fromInput || fromMeta).trim();
    if (!name) return;
    await upsertProfile(user.id, name);
}

function toggleAuthInputs(show) {
    const emailEl = document.getElementById('auth-email');
    const pwEl = document.getElementById('auth-password');
    const nameEl = document.getElementById('auth-username');
    if (emailEl) emailEl.style.display = show ? '' : 'none';
    if (pwEl) pwEl.style.display = show ? '' : 'none';
    if (nameEl) nameEl.style.display = show ? '' : 'none';
}

async function refreshAuthUI() {
    const sb = window.supabaseClient;
    if (!sb) {
        setAuthStatus('Supabase 미설정: URL/anon key를 넣어주세요.');
        toggleAuthButtons(false);
        toggleAuthInputs(true);
        return;
    }
    const { data } = await sb.auth.getUser();
    const user = data?.user || null;
    window.currentUser = user;
    if (user) {
        setAuthStatus(`로그인됨: ${user.email}`);
        toggleAuthButtons(true);
        // 로그인 상태에서는 입력값을 남겨둘 이유가 없으므로 정리
        clearAuthInputs();
        // 로그인 후 텍스트 박스 숨기기
        toggleAuthInputs(false);
    } else {
        setAuthStatus('로그인하면 점수가 리더보드에 기록됩니다.');
        toggleAuthButtons(false);
        // 로그아웃 시 텍스트 박스 다시 보이기
        toggleAuthInputs(true);
    }
}

function initAuthUI() {
    const form = document.getElementById('auth-form');
    const signInBtn = document.getElementById('auth-signin');
    const signUpBtn = document.getElementById('auth-signup');
    const signOutBtn = document.getElementById('auth-signout');
    if (!form || !signInBtn || !signUpBtn || !signOutBtn) return;

    const sb = window.supabaseClient;
    if (!sb) {
        refreshAuthUI();
        return;
    }

    const getVals = () => {
        const email = document.getElementById('auth-email')?.value || '';
        const password = document.getElementById('auth-password')?.value || '';
        const username = document.getElementById('auth-username')?.value || '';
        return { email: email.trim(), password, username: username.trim() };
    };

    // Enter로 폼 제출 시 "로그인"이 기본 동작(UX)
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        signInBtn.click();
    });

    signUpBtn.addEventListener('click', async () => {
        setAuthMsg('');
        const { email, password, username } = getVals();
        if (!email || !password) return setAuthMsg('이메일/비밀번호를 입력하세요.', true);
        if (!username) return setAuthMsg('닉네임은 필수입니다.', true);
        if (String(password).length < 6) return setAuthMsg('비밀번호는 최소 6자 이상이어야 합니다.', true);

        // 이메일 인증(Confirm email)이 켜져 있으면 session이 null일 수 있음.
        // username은 user_metadata로도 저장해두고(추후 로그인 후 profiles에 반영),
        // session이 있는 경우에만 profiles upsert를 시도합니다.
        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                data: { username: username || null },
            },
        });
        if (error) return setAuthMsg(error.message, true);

        // 이메일 인증이 필요한 경우: 아직 로그인 상태가 아니어서 RLS로 profiles insert가 막힐 수 있음
        if (!data?.session) {
            setAuthMsg('회원가입 완료. 이메일 인증이 필요할 수 있어요. 메일 확인 후 로그인하세요.');
        } else {
            await ensureProfileFromUser(data.user, username);
            setAuthMsg('회원가입 + 로그인 완료');
            clearAuthInputs();
        }
        await refreshAuthUI();
        if (typeof leaderboardRefresh === 'function') leaderboardRefresh();
    });

    signInBtn.addEventListener('click', async () => {
        setAuthMsg('');
        const { email, password, username } = getVals();
        if (!email || !password) return setAuthMsg('이메일/비밀번호를 입력하세요.', true);
        if (!username) return setAuthMsg('닉네임은 필수입니다. (로그인 후 프로필 저장에 사용됩니다)', true);
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return setAuthMsg(error.message, true);
        await ensureProfileFromUser(data?.user, username);
        setAuthMsg('로그인 완료');
        clearAuthInputs();
        await refreshAuthUI();
        if (typeof leaderboardRefresh === 'function') leaderboardRefresh();
    });

    signOutBtn.addEventListener('click', async () => {
        setAuthMsg('');
        await sb.auth.signOut();
        setAuthMsg('로그아웃됨');
        await refreshAuthUI();
        if (typeof leaderboardRefresh === 'function') leaderboardRefresh();
    });

    sb.auth.onAuthStateChange(async () => {
        // 로그인 직후(또는 새로고침 복구) user_metadata에 username이 있다면 profiles에 반영
        try {
            const { data } = await sb.auth.getUser();
            if (data?.user) await ensureProfileFromUser(data.user, '');
        } catch { /* ignore */ }
        await refreshAuthUI();
        if (typeof leaderboardRefresh === 'function') leaderboardRefresh();
    });

    refreshAuthUI();
}

// DOM ready(스크립트가 body 끝에 있어도 안전하게)
initAuthUI();


