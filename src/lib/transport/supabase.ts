import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Apply, SessionTransport } from "@/lib/transport/types";
import type { Session } from "@/lib/types";

// Строка таблицы public.sessions (supabase/schema.sql). Версия — для условной записи; тип Session из SPEC не трогаем
export type Row = { id: string; version: number; data: Session };

// Всё, что транспорт делает с Supabase — в тестах подставляется фейк. Сеть/RLS → исключение
export type SessionsApi = {
  select(sessionId: string): Promise<Row | null>;
  insert(row: Row): Promise<void>;
  // Запись, только если в базе всё ещё expectedVersion. false — кто-то успел раньше
  updateIfVersion(row: Row, expectedVersion: number): Promise<boolean>;
  // INSERT/UPDATE строки этой сессии. onSubscribed — канал реально слушает. Возвращает отписку
  watch(sessionId: string, onRow: (row: Row) => void, onSubscribed: () => void): () => void;
};

// Предел записи — время, а не число попыток: при «≤3» тапы вперемешку теряли до 7 из 20 (DECISIONS 2026-10-31)
export const TIMEOUT_MS = 8000;

type Deps = { api: SessionsApi; timeoutMs?: number };
// abandoned — update уже ответил по таймауту; поздний успех записи не запоминаем, чтобы её эхо из realtime прошло в стор
type Batch = { applies: Apply[]; done: Promise<void>; abandoned: boolean };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createSupabaseTransport({ api, timeoutMs = TIMEOUT_MS }: Deps): SessionTransport {
  // Самая свежая виденная строка каждой сессии: база для update, фильтр эха и опоздавших
  const latest = new Map<string, Row>();
  // Записи одного клиента по сессии — строго по очереди (DECISIONS 2026-10-31 «update»)
  const queues = new Map<string, Promise<unknown>>();
  // apply, ждущие своей очереди, уходят одной записью: 10 быстрых тапов = 1–2 записи, а не 10.
  // Иначе клиент со своей очередью (пишет из кэша) раз за разом обгоняет того, кто перечитывает после конфликта
  const batches = new Map<string, Batch>();

  const seen = (sessionId: string) => latest.get(sessionId)?.version ?? 0;
  function remember(row: Row) {
    if (row.version > seen(row.id)) latest.set(row.id, row);
  }
  const freshest = (sessionId: string) => latest.get(sessionId)?.data ?? null;

  function enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const run = (queues.get(sessionId) ?? Promise.resolve()).then(() => withTimeout(task(), timeoutMs));
    queues.set(sessionId, run.catch(() => {})); // упавшая запись не блокирует следующие
    return run;
  }

  async function reload(sessionId: string) {
    const row = await withTimeout(api.select(sessionId), timeoutMs);
    if (row) remember(row);
    return row;
  }

  async function writeWithRetry(sessionId: string, apply: Apply, batch: Batch) {
    const deadline = Date.now() + timeoutMs;
    let base = latest.get(sessionId) ?? (await reload(sessionId));
    while (base && Date.now() < deadline) {
      const next = apply(base.data);
      if (next === base.data) return; // уже применено (повтор) — новой версии не нужно
      const row = { id: sessionId, version: base.version + 1, data: next };
      if (await api.updateIfVersion(row, base.version)) {
        if (!batch.abandoned) remember(row);
        return;
      }
      // Конфликт: свежий снимок → apply снова. Realtime мог уже принести его — тогда без лишнего запроса
      const known = latest.get(sessionId);
      base = known && known.version > base.version ? known : await reload(sessionId);
    }
    if (base) throw new Error(`конфликт версий не разрешился за ${timeoutMs} мс`);
  }

  return {
    async load(sessionId) {
      try {
        await reload(sessionId);
      } catch (error) {
        console.warn("[supabase] load failed", error);
      }
      return freshest(sessionId);
    },

    save(session) {
      const row = { id: session.id, version: 1, data: session };
      enqueue(session.id, async () => {
        await api.insert(row);
        remember(row); // до следующей записи в очереди — она возьмёт эту строку за базу
      }).catch((error: unknown) => console.warn("[supabase] save failed", error));
    },

    // Ответ — самый свежий снимок на момент ответа (не обязательно наш): realtime мог принести более новый
    async update(sessionId, apply) {
      let batch = batches.get(sessionId);
      if (!batch) {
        const fresh: Batch = { applies: [], done: Promise.resolve(), abandoned: false };
        fresh.done = enqueue(sessionId, () => {
          batches.delete(sessionId); // пачка ушла — следующие apply копятся в новую
          return writeWithRetry(sessionId, (session) => fresh.applies.reduce((acc, next) => next(acc), session), fresh);
        });
        batch = fresh;
        batches.set(sessionId, batch);
      }
      batch.applies.push(apply);
      try {
        await batch.done;
      } catch (error) {
        batch.abandoned = true;
        console.warn("[supabase] update failed", error);
        await reload(sessionId).catch(() => {}); // стор должен сойтись с базой, а не остаться с оптимистичным
      }
      return freshest(sessionId);
    },

    subscribe(sessionId, onSession) {
      const deliver = (row: Row) => {
        // Эхо своей записи и опоздавшие строки отбрасываем
        if (row.version <= seen(sessionId)) return;
        remember(row);
        onSession(row.data);
      };
      // Пока канал подключался, строка могла измениться — перечитываем один раз
      const onSubscribed = () => {
        withTimeout(api.select(sessionId), timeoutMs).then(
          (row) => row && deliver(row),
          (error: unknown) => console.warn("[supabase] reload after subscribe failed", error),
        );
      };
      return api.watch(sessionId, deliver, onSubscribed);
    },
  };
}

// Секрет хоста: создаётся при save, живёт только в localStorage хоста, в базе — sha256 (supabase/migrations/002_lockdown.sql)
export const hostSecretKey = (sessionId: string) => `splitcheck:host:${sessionId}`;

function readHostSecret(sessionId: string): string | null {
  try {
    return localStorage.getItem(hostSecretKey(sessionId));
  } catch {
    return null; // приватный режим: пишем как гость — цены и BLIK не поменять
  }
}

function newHostSecret(sessionId: string): string {
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(hostSecretKey(sessionId), secret);
  } catch {
    // не сохранился — сессия создастся, но править цены и BLIK хост не сможет
  }
  return secret;
}

type Listener = { onRow: (row: Row) => void; onSubscribed: () => void };
type Watch = { channel: RealtimeChannel; listeners: Set<Listener>; subscribed: boolean };

// Единственное место, где живёт supabase-js. Таблица закрыта: только RPC из 002_lockdown.sql.
// Проверено по типам @supabase/supabase-js 2.118.0 (node_modules: rpc — index.d.mts, broadcast — RealtimeChannel.d.ts)
export function supabaseSessionsApi(client: SupabaseClient): SessionsApi {
  // Один канал на сессию: имя канала = topic Broadcast, а client.channel(имя) отдаёт уже существующий
  const watches = new Map<string, Watch>();

  async function select(sessionId: string): Promise<Row | null> {
    const { data, error } = await client.rpc("get_session", { p_id: sessionId });
    if (error) throw error;
    return (data as Row | null) ?? null;
  }

  return {
    select,

    async insert(row) {
      const { error } = await client.rpc("create_session", {
        p_id: row.id,
        p_data: row.data,
        p_host_secret: newHostSecret(row.id),
      });
      if (error) throw error;
    },

    async updateIfVersion(row, expectedVersion) {
      // База сама ставит version = expected + 1 — транспорт считает так же
      const { data, error } = await client.rpc("update_session", {
        p_id: row.id,
        p_expected_version: expectedVersion,
        p_data: row.data,
        p_host_secret: readHostSecret(row.id),
      });
      if (error) throw error;
      return data === true;
    },

    watch(sessionId, onRow, onSubscribed) {
      const listener: Listener = { onRow, onSubscribed };
      let watch = watches.get(sessionId);
      if (!watch) {
        // Сигнал без данных — строку берём через get_session: подделанный сигнал даёт лишь лишнее чтение.
        // Пачку сигналов схлопываем: пока идёт чтение, следующий сигнал — одно повторное чтение после него
        let reading = false;
        let again = false;
        const refresh = () => {
          if (reading) {
            again = true;
            return;
          }
          reading = true;
          select(sessionId)
            .then(
              (row) => row && current.listeners.forEach((l) => l.onRow(row)),
              (error: unknown) => console.warn("[supabase] read after signal failed", error),
            )
            .finally(() => {
              reading = false;
              if (again) {
                again = false;
                refresh();
              }
            });
        };
        const current: Watch = { channel: client.channel(`session:${sessionId}`), listeners: new Set(), subscribed: false };
        current.channel.on("broadcast", { event: "row" }, refresh).subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            current.subscribed = true;
            current.listeners.forEach((l) => l.onSubscribed());
          } else if (status !== "CLOSED") console.warn(`[supabase] realtime ${status}`, error);
        });
        watches.set(sessionId, current);
        watch = current;
      } else if (watch.subscribed) {
        onSubscribed();
      }
      watch.listeners.add(listener);

      const own = watch;
      return () => {
        own.listeners.delete(listener);
        if (own.listeners.size > 0) return;
        watches.delete(sessionId);
        void client.removeChannel(own.channel);
      };
    },
  };
}

let supabaseTransport: SessionTransport | null = null;

// Лениво, только в браузере; url и ключ — из .env.local (выбор — defaultTransport в index.ts)
export function getSupabaseTransport(url: string, key: string): SessionTransport {
  supabaseTransport ??= createSupabaseTransport({ api: supabaseSessionsApi(createClient(url, key)) });
  return supabaseTransport;
}
