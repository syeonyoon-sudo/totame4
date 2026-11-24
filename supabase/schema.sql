-- 또타미 이동 기록 테이블 (Supabase SQL Editor에서 실행)
create table if not exists public.trips (
  id uuid primary key,
  device_id text not null,
  user_id uuid references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  from_station text not null,
  to_station text not null,
  lines text[] not null default '{}',
  stations text[] not null default '{}',
  minutes integer not null,
  transfers integer not null default 0,
  distance_km numeric(6,1) not null default 0,
  walk_m integer not null default 0,
  delay_min integer not null default 0,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists trips_device_idx on public.trips (device_id, started_at desc);

alter table public.trips enable row level security;

-- ⚠️ 시연용 정책: 익명 키로 기기별 기록 접근 허용.
-- 실제 서비스에서는 Supabase Auth 로그인 후 아래 주석의 user_id 기준 정책으로 교체하세요.
create policy "demo device access" on public.trips for all using (true) with check (true);
-- create policy "own trips" on public.trips for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 기존 테이블에 컬럼 추가 (v3)
alter table public.trips add column if not exists delay_min integer not null default 0;

-- ─────────────────────────────────────────────────────────────
-- (v4 초안) 앱이 닫혀 있을 때 예약 알림을 보내기 위한 테이블
-- 현재 앱은 일정을 기기(localStorage)에만 저장합니다. 서버 푸시를 도입할 때 사용하세요.
-- 발송: 1분 주기 예약 작업(Supabase Edge Function + pg_cron 또는 Vercel Cron)이
--       fire_at <= now() 이고 sent_at is null 인 행을 Web Push(VAPID)로 발송
-- ─────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.scheduled_alerts (
  key text primary key,               -- 중복 방지 키 (일정id@수정시각:종류:시점)
  user_id uuid references auth.users (id) on delete cascade,
  appointment_id text not null,
  fire_at timestamptz not null,
  title text not null,
  body text,
  url text,
  sent_at timestamptz,
  canceled boolean not null default false
);
create index if not exists scheduled_alerts_due_idx on public.scheduled_alerts (fire_at) where sent_at is null and not canceled;
alter table public.push_subscriptions enable row level security;
alter table public.scheduled_alerts enable row level security;
create policy "own subs" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alerts" on public.scheduled_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
