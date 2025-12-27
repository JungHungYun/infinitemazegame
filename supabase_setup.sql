-- Supabase 리더보드 고도화 스키마/정책
-- 목표:
-- 1) 닉네임 중복 금지(대소문자 무시) - username이 null이 아닌 경우에만 유니크
-- 2) 1인당 최고점만 유지(업서트) - leaderboard_best 테이블
-- 3) 랭킹/내 순위 조회 최적화 - leaderboard_view 뷰 + submit_score RPC
-- 4) 모든 런 기록 누적 저장(append-only) - leaderboard_scores 테이블

-- ===== 0) 기존 테이블이 없다면 생성(처음 세팅) =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);

create table if not exists public.leaderboard_best (
  user_id uuid primary key references auth.users(id) on delete cascade,
  score int not null default 0,
  floor int not null default 1,
  platform text not null default 'pc',
  updated_at timestamptz not null default now()
);

-- 모든 제출 기록(누적) 저장: 리더보드는 best/view로 보되, 기록 자체는 전부 쌓습니다.
create table if not exists public.leaderboard_scores (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null default 0,
  floor int not null default 1,
  platform text not null default 'pc',
  created_at timestamptz not null default now()
);

-- ===== 0.1) 재실행(업그레이드) 안전장치: 기존 테이블에도 컬럼 추가 =====
-- 기존에 platform 컬럼이 없던 버전에서 업그레이드될 수 있으므로:
-- 1) 컬럼이 없으면 추가
-- 2) null/빈값을 'pc'로 정리
-- 3) NOT NULL + DEFAULT로 고정
alter table public.leaderboard_best
  add column if not exists platform text;

update public.leaderboard_best
set platform = 'pc'
where platform is null or length(trim(platform)) = 0;

alter table public.leaderboard_best
  alter column platform set default 'pc';

alter table public.leaderboard_best
  alter column platform set not null;

alter table public.leaderboard_scores
  add column if not exists platform text;

update public.leaderboard_scores
set platform = 'pc'
where platform is null or length(trim(platform)) = 0;

alter table public.leaderboard_scores
  alter column platform set default 'pc';

alter table public.leaderboard_scores
  alter column platform set not null;

-- ===== 1) 닉네임 유니크(대소문자 무시) =====
alter table public.profiles
  alter column username drop not null;

-- 기존에 username 기본값을 '익명'으로 쓰던 경우 충돌이 날 수 있어 null로 정리 권장
update public.profiles set username = null where username = '익명';

-- 대소문자 무시 유니크(비어있지 않을 때만 적용)
create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null and length(trim(username)) > 0;

-- 닉네임 필수로 강제하고 싶다면(권장): null/빈 값 정리 후 NOT NULL + CHECK
update public.profiles
set username = 'user_' || substring(id::text, 1, 8)
where username is null or length(trim(username)) = 0;

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_nonempty;

alter table public.profiles
  add constraint profiles_username_nonempty check (length(trim(username)) > 0);

-- ===== 2) 랭킹 뷰 (1인 1기록 기반) =====
-- NOTE: create or replace view는 컬럼 개수/순서 변경이 불가하므로(drop 후 재생성)
drop view if exists public.leaderboard_view cascade;
create view public.leaderboard_view as
select
  rank() over (
    order by lb.score desc, lb.floor desc, lb.updated_at asc
  )::bigint as rank,
  lb.user_id,
  lb.score,
  lb.floor,
  lb.platform,
  lb.updated_at,
  coalesce(
    p.username,
    '익명#' || substring(lb.user_id::text, 1, 4)
  ) as display_name
from public.leaderboard_best lb
left join public.profiles p
  on p.id = lb.user_id;

-- PostgREST(=supabase-js)에서 view를 읽을 수 있도록 권한 부여
grant select on public.leaderboard_view to anon, authenticated;

-- 클라이언트 폴백(뷰 실패 시 best 직접 조회) 대비: best/profiles select 권한도 명시
grant select on public.profiles to anon, authenticated;
grant select on public.leaderboard_best to anon, authenticated;

-- ===== 3) 점수 제출 RPC (조건부 업서트) =====
-- v2: 플랫폼(pc/mobile)도 함께 저장
create or replace function public.submit_score_v2(p_score int, p_floor int, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s int := greatest(0, coalesce(p_score, 0));
  f int := greatest(1, coalesce(p_floor, 1));
  plat text := lower(coalesce(nullif(trim(p_platform), ''), 'pc'));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if plat not in ('pc','mobile') then
    plat := 'pc';
  end if;

  -- 0) 누적 기록은 항상 저장
  insert into public.leaderboard_scores(user_id, score, floor, platform, created_at)
  values (uid, s, f, plat, now());

  -- 1) 최고 기록(best) 갱신
  insert into public.leaderboard_best(user_id, score, floor, platform, updated_at)
  values (uid, s, f, plat, now())
  on conflict (user_id) do update
  set
    score = excluded.score,
    floor = excluded.floor,
    platform = excluded.platform,
    updated_at = now()
  where
    excluded.score > public.leaderboard_best.score
    or (excluded.score = public.leaderboard_best.score and excluded.floor > public.leaderboard_best.floor);
end;
$$;

-- 구버전 호환: submit_score(p_score, p_floor) → v2로 위임(기본 platform='pc')
create or replace function public.submit_score(p_score int, p_floor int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.submit_score_v2(p_score, p_floor, 'pc');
end;
$$;

-- ===== 4) RLS 활성화 =====
alter table public.profiles enable row level security;
alter table public.leaderboard_best enable row level security;
alter table public.leaderboard_scores enable row level security;

-- ===== 5) Policies =====
-- profiles: 모두 읽기 가능, 본인만 insert/update 가능
drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
on public.profiles for select
to anon, authenticated
using (true);

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id);

-- leaderboard_best: 모두 읽기 가능, 본인 row는 직접 insert/update 금지(함수로만 쓰기)
drop policy if exists "leaderboard_best readable by everyone" on public.leaderboard_best;
create policy "leaderboard_best readable by everyone"
on public.leaderboard_best for select
to anon, authenticated
using (true);

-- leaderboard_scores: 누적 기록 저장(삽입)은 인증 사용자만, 읽기는 기본적으로 막음(필요 시 정책 추가)
drop policy if exists "leaderboard_scores insert by owner" on public.leaderboard_scores;
create policy "leaderboard_scores insert by owner"
on public.leaderboard_scores for insert
to authenticated
with check (auth.uid() = user_id);

-- ===== 6) RPC 권한 =====
revoke all on function public.submit_score_v2(int, int, text) from public;
grant execute on function public.submit_score_v2(int, int, text) to authenticated;

revoke all on function public.submit_score(int, int) from public;
grant execute on function public.submit_score(int, int) to authenticated;

-- ===== 7) PostgREST 스키마 캐시 갱신 =====
-- SQL 실행 직후에도 supabase-js에서 "schema cache" 오류가 나면 아래를 추가로 실행하세요.
-- (Supabase가 PostgREST 캐시를 리로드하도록 알림)
notify pgrst, 'reload schema';


