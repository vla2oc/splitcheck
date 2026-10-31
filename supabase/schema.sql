-- SplitCheck, фаза 7: одна таблица снимков сессий. Выполнить ОДИН раз в Supabase → SQL Editor (повтор упадёт на publication).
-- Источник: docs/PHASE7_realtime.md; дока Supabase «Realtime Postgres Changes», «Row Level Security», «Securing your API» (2026-10-31).

create table if not exists public.sessions (
  id         text primary key,                        -- Session.id (nanoid(10))
  version    integer not null check (version >= 1),   -- оптимистичная конкуренция: пишем version+1 только если version не изменилась
  data       jsonb not null,                          -- Session целиком (тип из docs/SPEC.md не меняется)
  updated_at timestamptz not null default now()
);

-- Публичный (publishable) ключ = роль anon; без RLS-политик API не отдаёт ничего
alter table public.sessions enable row level security;

-- Явно, а не полагаясь на авто-гранты проекта (Supabase переводит их в opt-in). delete не даём
grant select, insert, update on public.sessions to anon;

-- MVP: любой со ссылкой читает и пишет — авторизация и RPC вместо select в docs/NOT_NOW.md
create policy "sessions: anon read"   on public.sessions for select to anon using (true);
create policy "sessions: anon create" on public.sessions for insert to anon with check (true);
create policy "sessions: anon update" on public.sessions for update to anon using (true) with check (true);

-- Realtime postgres_changes шлёт события только по таблицам из этой публикации (и уважает select-политику выше)
alter publication supabase_realtime add table public.sessions;
