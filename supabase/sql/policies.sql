-- Włącz RLS
alter table public.sessions enable row level security;
alter table public.results  enable row level security;

-- Usuń ewentualne stare polityki
drop policy if exists "public select sessions" on public.sessions;
drop policy if exists "public insert sessions" on public.sessions;
drop policy if exists "public update sessions" on public.sessions;

drop policy if exists "public select results" on public.results;
drop policy if exists "insert results when session open" on public.results;

-- Nowe polityki
create policy "public select sessions"
on public.sessions
for select
to anon, authenticated
using (true);

create policy "public insert sessions"
on public.sessions
for insert
to anon, authenticated
with check (true);

create policy "public update sessions"
on public.sessions
for update
to anon, authenticated
using (true)
with check (true);

create policy "public select results"
on public.results
for select
to anon, authenticated
using (true);

create policy "insert results when session open"
on public.results
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.sessions s
    where s.id = session_id
      and s.is_open = true
  )
);