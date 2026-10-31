-- Откат 002_lockdown.sql: вернуть открытый доступ из schema.sql (anon читает/пишет таблицу, синк через postgres_changes).
-- Нужен только вместе с откатом фронта на код до lockdown (тег pre-vercel или деплой до этой миграции).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'splitcheck-retention') then
    perform cron.unschedule('splitcheck-retention');
  end if;
exception when undefined_table or invalid_schema_name then
  null; -- pg_cron не был включён
end $$;

drop trigger if exists sessions_notify on public.sessions;
drop function if exists public.sessions_notify();
drop function if exists public.update_session(text, integer, jsonb, text);
drop function if exists public.create_session(text, jsonb, text);
drop function if exists public.get_session(text);

grant select, insert, update on public.sessions to anon;
drop policy if exists "sessions: anon read"   on public.sessions;
drop policy if exists "sessions: anon create" on public.sessions;
drop policy if exists "sessions: anon update" on public.sessions;
create policy "sessions: anon read"   on public.sessions for select to anon using (true);
create policy "sessions: anon create" on public.sessions for insert to anon with check (true);
create policy "sessions: anon update" on public.sessions for update to anon using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions') then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;
-- Колонка host_secret_hash остаётся: старый код её не читает
