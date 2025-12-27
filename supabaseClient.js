
const SUPABASE_URL = 'https://kssxbqdrpdvwyjhtlfcn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc3hicWRycGR2d3lqaHRsZmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4Mjc1NzEsImV4cCI6MjA4MjQwMzU3MX0.ljPFknJN_U2bdb8gnmB7mZCFvgMbEg0Zmq_yKWUcBKE';

function makeTimeoutFetch(timeoutMs = 15000) {
    return async (input, init = {}) => {
        // AbortController 미지원 환경이면 그냥 기본 fetch
        if (typeof AbortController === 'undefined') {
            return fetch(input, init);
        }
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(input, { ...init, signal: controller.signal });
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
    // 네트워크가 무한 pending되는 환경(차단/프록시 등)에서 UI가 멈추지 않게 fetch 타임아웃 적용
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            fetch: makeTimeoutFetch(15000),
        },
    });
}

window.supabaseClient = getSupabaseClient();


