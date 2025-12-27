// Supabase 클라이언트 초기화
// 중요:
// - 여기에 넣는 키는 반드시 "anon public key"만 사용하세요.
// - service_role 키를 프론트엔드에 넣으면 DB가 털립니다.

// TODO: 아래 2개를 Supabase 대시보드에서 복사해서 채우세요.
// Project Settings > Data API(또는 API) > Project URL / anon public key
const SUPABASE_URL = 'https://kssxbqdrpdvwyjhtlfcn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc3hicWRycGR2d3lqaHRsZmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4Mjc1NzEsImV4cCI6MjA4MjQwMzU3MX0.ljPFknJN_U2bdb8gnmB7mZCFvgMbEg0Zmq_yKWUcBKE';

function getSupabaseClient() {
    if (!window.supabase) {
        console.warn('[supabase] supabase-js가 로드되지 않았습니다.');
        return null;
    }
    if (!SUPABASE_URL || SUPABASE_URL.startsWith('PASTE_') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.startsWith('PASTE_')) {
        return null;
    }
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

window.supabaseClient = getSupabaseClient();


