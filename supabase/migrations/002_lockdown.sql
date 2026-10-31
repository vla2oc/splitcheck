-- SplitCheck: закрыть таблицу sessions. Выполнить ОДИН раз в Supabase → SQL Editor ПОСЛЕ schema.sql. Откат — 002_lockdown_down.sql.
-- Было: anon читал и писал любые строки (select/update using (true)) → выгрузка всех сессий с номерами BLIK, подмена чужого BLIK.
-- Стало: только RPC ниже. Чтение — по точному id; без секрета хоста гость меняет лишь отметки и добавляет себя.
-- Синк: триггер шлёт в публичный Broadcast-канал session:<id> только номер версии; данные клиент берёт через get_session,
-- поэтому подделанный сигнал даёт лишь лишнее чтение. Дока Supabase «Realtime Broadcast → Broadcasting from the database» (2026-10-31).

-- 1. Прямой доступ anon к таблице — закрыт (RLS включена, политик нет)
drop policy if exists "sessions: anon read"   on public.sessions;
drop policy if exists "sessions: anon create" on public.sessions;
drop policy if exists "sessions: anon update" on public.sessions;
revoke all on public.sessions from anon, authenticated;

-- postgres_changes больше не нужен: он и требовал открытого select
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions') then
    alter publication supabase_realtime drop table public.sessions;
  end if;
end $$;

-- Секрет хоста хранится только хэшем; в data (и клиентам) не попадает
alter table public.sessions add column if not exists host_secret_hash text;

-- 2. Чтение по точному id. Сессии старше 30 дней не отдаются, даже если cron их ещё не удалил
create or replace function public.get_session(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'version', s.version, 'data', s.data)
  from public.sessions s
  where s.id = p_id and s.updated_at > now() - interval '30 days';
$$;

-- 3. Создание: хост присылает случайный секрет (≥ 32 символа), храним sha256
create or replace function public.create_session(p_id text, p_data jsonb, p_host_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id !~ '^[A-Za-z0-9_-]{10}$' or p_data->>'id' is distinct from p_id then
    raise exception 'invalid_session' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 262144 then
    raise exception 'too_large' using errcode = '22023';
  end if;
  if p_host_secret is null or length(p_host_secret) < 32 then
    raise exception 'invalid_host_secret' using errcode = '22023';
  end if;
  insert into public.sessions (id, version, data, host_secret_hash)
  values (p_id, 1, p_data, encode(sha256(convert_to(p_host_secret, 'UTF8')), 'hex'));
end;
$$;

-- 4. Запись по версии: true — записано, false — кто-то успел раньше (клиент перечитает и повторит).
-- Без секрета хоста (гость): позиции, цены, сервис, BLIK, мерчант неизменны; старые участники на месте с тем же id,
-- isHost и цветом, имя хоста неизменно; новые участники — только гости. Отметки (claims) — свободно
create or replace function public.update_session(p_id text, p_expected_version integer, p_data jsonb, p_host_secret text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.sessions%rowtype;
  is_host boolean;
  old_p jsonb;
  new_p jsonb;
begin
  if p_data->>'id' is distinct from p_id then
    raise exception 'invalid_session' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 262144 then
    raise exception 'too_large' using errcode = '22023';
  end if;

  select * into cur from public.sessions
  where id = p_id and updated_at > now() - interval '30 days'
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if cur.version <> p_expected_version then
    return false;
  end if;

  is_host := p_host_secret is not null and cur.host_secret_hash is not null
    and cur.host_secret_hash = encode(sha256(convert_to(p_host_secret, 'UTF8')), 'hex');

  if not is_host then
    if (p_data - 'claims' - 'participants') is distinct from (cur.data - 'claims' - 'participants') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    old_p := coalesce(cur.data->'participants', '[]'::jsonb);
    new_p := coalesce(p_data->'participants', '[]'::jsonb);
    if jsonb_typeof(new_p) <> 'array' or jsonb_array_length(new_p) > 50 then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if exists (
      select 1 from jsonb_array_elements(old_p) o
      where not exists (
        select 1 from jsonb_array_elements(new_p) n
        where n->>'id' = o->>'id'
          and n->'isHost' = o->'isHost'
          and n->'color' = o->'color'
          and (o->>'isHost' is distinct from 'true' or n->'name' = o->'name')
      )
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if (select count(*) from jsonb_array_elements(new_p) n where n->>'isHost' = 'true')
       <> (select count(*) from jsonb_array_elements(old_p) o where o->>'isHost' = 'true') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  update public.sessions
  set version = p_expected_version + 1, data = p_data, updated_at = now()
  where id = p_id;
  return true;
end;
$$;

-- RPC — только эти три; по умолчанию Postgres даёт execute всем (PUBLIC)
revoke all on function public.get_session(text) from public, anon, authenticated;
revoke all on function public.create_session(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.update_session(text, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.get_session(text) to anon, authenticated;
grant execute on function public.create_session(text, jsonb, text) to anon, authenticated;
grant execute on function public.update_session(text, integer, jsonb, text) to anon, authenticated;

-- 5. Сигнал «новая версия» в публичный канал session:<id>; данных в нём нет
create or replace function public.sessions_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('version', new.version), 'row', 'session:' || new.id, false);
  return null;
end;
$$;
revoke all on function public.sessions_notify() from public, anon, authenticated;

drop trigger if exists sessions_notify on public.sessions;
create trigger sessions_notify
after insert or update on public.sessions
for each row execute function public.sessions_notify();

-- 6. Удаление сессий старше 30 дней — каждую ночь. Последним: если pg_cron недоступен, всё выше уже применено
create extension if not exists pg_cron;
select cron.schedule('splitcheck-retention', '17 3 * * *', $$delete from public.sessions where updated_at < now() - interval '30 days'$$);
