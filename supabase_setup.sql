-- Supabase 리더보드 고도화 스키마/정책
-- 목표:
-- 1) 닉네임 중복 금지(대소문자 무시) - username이 null이 아닌 경우에만 유니크
-- 2) 1인당 최고점만 유지(업서트) - leaderboard_best 테이블
-- 3) 랭킹/내 순위 조회 최적화 - leaderboard_view 뷰 + submit_score RPC

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
  updated_at timestamptz not null default now()
);

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
create or replace view public.leaderboard_view as
select
  rank() over (
    order by lb.score desc, lb.floor desc, lb.updated_at asc
  )::bigint as rank,
  lb.user_id,
  lb.score,
  lb.floor,
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

-- ===== 3) 점수 제출 RPC (조건부 업서트) =====
create or replace function public.submit_score(p_score int, p_floor int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s int := greatest(0, coalesce(p_score, 0));
  f int := greatest(1, coalesce(p_floor, 1));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.leaderboard_best(user_id, score, floor, updated_at)
  values (uid, s, f, now())
  on conflict (user_id) do update
  set
    score = excluded.score,
    floor = excluded.floor,
    updated_at = now()
  where
    excluded.score > public.leaderboard_best.score
    or (excluded.score = public.leaderboard_best.score and excluded.floor > public.leaderboard_best.floor);
end;
$$;

-- ===== 4) RLS 활성화 =====
alter table public.profiles enable row level security;
alter table public.leaderboard_best enable row level security;

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

-- ===== 6) RPC 권한 =====
revoke all on function public.submit_score(int, int) from public;
grant execute on function public.submit_score(int, int) to authenticated;

-- ===== 7) PostgREST 스키마 캐시 갱신 =====
-- SQL 실행 직후에도 supabase-js에서 "schema cache" 오류가 나면 아래를 추가로 실행하세요.
-- (Supabase가 PostgREST 캐시를 리로드하도록 알림)
notify pgrst, 'reload schema';


