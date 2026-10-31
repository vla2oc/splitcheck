import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

// Единственное место, где живёт supabase-js. Проверено по типам @supabase/supabase-js 2.118.0 (node_modules)
export function supabaseSessionsApi(client: SupabaseClient): SessionsApi {
  const table = () => client.from("sessions");
  let channels = 0;
  return {
    async select(sessionId) {
      const { data, error } = await table().select("id, version, data").eq("id", sessionId).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },

    async insert(row) {
      const { error } = await table().insert(row);
      if (error) throw error;
    },

    async updateIfVersion(row, expectedVersion) {
      const { data, error } = await table()
        .update({ version: row.version, data: row.data, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("version", expectedVersion)
        .select("id");
      if (error) throw error;
      return data.length > 0;
    },

    watch(sessionId, onRow, onSubscribed) {
      // client.channel(имя) отдаёт уже существующий канал с тем же именем — каждой подписке своё
      const channel = client
        .channel(`session:${sessionId}:${++channels}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
          (payload) => {
            if (payload.eventType !== "DELETE") onRow(payload.new as Row);
          },
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") onSubscribed();
          else if (status !== "CLOSED") console.warn(`[supabase] realtime ${status}`, error);
        });
      return () => void client.removeChannel(channel);
    },
  };
}

let supabaseTransport: SessionTransport | null = null;

// Лениво, только в браузере; url и ключ — из .env.local (выбор — defaultTransport в index.ts)
export function getSupabaseTransport(url: string, key: string): SessionTransport {
  supabaseTransport ??= createSupabaseTransport({ api: supabaseSessionsApi(createClient(url, key)) });
  return supabaseTransport;
}
