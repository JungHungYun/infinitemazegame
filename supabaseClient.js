
const SUPABASE_URL = 'https://kssxbqdrpdvwyjhtlfcn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc3hicWRycGR2d3lqaHRsZmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4Mjc1NzEsImV4cCI6MjA4MjQwMzU3MX0.ljPFknJN_U2bdb8gnmB7mZCFvgMbEg0Zmq_yKWUcBKE';

function createMemoryStorage() {
    // supabase-js가 기대하는 Storage 호환 인터페이스(getItem/setItem/removeItem)
    const m = new Map();
    return {
        getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
        setItem: (k, v) => { m.set(String(k), String(v)); },
        removeItem: (k) => { m.delete(String(k)); },
    };
}

function getBestAuthStorage() {
    // Tracking Prevention / 사파리 프라이빗 모드 / file:// 등에서 localStorage 접근이 막힐 수 있음
    try {
        const ls = window.localStorage;
        if (!ls) return { storage: createMemoryStorage(), persistent: false };
        const t = '__sb_ls_test__';
        ls.setItem(t, '1');
        ls.removeItem(t);
        return { storage: ls, persistent: true };
    } catch (e) {
        console.warn('[supabase] storage blocked; fallback to memory storage (session will not persist).', e);
        return { storage: createMemoryStorage(), persistent: false };
    }
}

function makeTimeoutFetch(timeoutMs = 15000) {
    return async (input, init = {}) => {
        // AbortController 미지원 환경이면 그냥 기본 fetch
        if (typeof AbortController === 'undefined') {
            return fetch(input, init);
        }
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        try {
            // 브라우저/중간프록시 캐시 영향 최소화
            return await fetch(input, { ...init, cache: 'no-store', signal: controller.signal });
        } finally {
            clearTimeout(t);
        }
    };
}

function getSupabaseClient() {
    if (!window.supabase) {
        console.warn('[supabase] supabase-js가 로드되지 않았습니다.');
        return null;
    }
    if (!SUPABASE_URL || SUPABASE_URL.startsWith('PASTE_') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.startsWith('PASTE_')) {
        return null;
    }
    const { storage, persistent } = getBestAuthStorage();
    // 네트워크가 무한 pending되는 환경(차단/프록시 등)에서 UI가 멈추지 않게 fetch 타임아웃 적용
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            fetch: makeTimeoutFetch(15000),
        },
        auth: {
            // 새로고침/재방문에도 로그인 세션 유지
            // storage가 막힌 환경에서는 세션 저장/자동갱신이 불가능하므로 안전하게 비활성화
            persistSession: persistent,
            autoRefreshToken: persistent,
            detectSessionInUrl: true,
            storage,
        },
    });
}

window.supabaseClient = getSupabaseClient();


