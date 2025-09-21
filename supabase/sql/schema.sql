-- (opcjonalnie) zapewnia gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  is_open boolean not null default true
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  nickname text,
  heads int not null,
  tails int not null,
  sequence text not null,
  created_at timestamptz not null default now()
);

-- indeksy pomocnicze
create index if not exists results_session_created_idx on public.results(session_id, created_at);