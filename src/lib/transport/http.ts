import { createSupabaseTransport, type Row, type SessionsApi } from "@/lib/transport/supabase";
import type { SessionTransport } from "@/lib/transport/types";

// Порт SessionsApi поверх нашего бэкенда (репо Bsemenii/reciept, server/: /api/sessions). Очередь, пачки,
// конфликт версий и фильтр эха — те же, что у Supabase (createSupabaseTransport), меняется только сеть.
// "" = тот же origin: next.config.ts проксирует /api/* в бэкенд, телефонам нужен один туннель
const API = "";

const RECONNECT_MS = 2000;

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
}

async function failed(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(`[http] ${res.status} ${body.error ?? "network"}`);
}

export function httpSessionsApi(): SessionsApi {
  return {
    async select(sessionId) {
      const res = await request(`/api/sessions/${encodeURIComponent(sessionId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw await failed(res);
      return (await res.json()) as Row;
    },

    async insert(row) {
      const res = await request("/api/sessions", { method: "POST", body: JSON.stringify(row) });
      if (!res.ok) throw await failed(res);
    },

    async updateIfVersion(row, expectedVersion) {
      const res = await request(`/api/sessions/${encodeURIComponent(row.id)}`, {
        method: "PUT",
        body: JSON.stringify({ version: row.version, expected_version: expectedVersion, data: row.data }),
      });
      if (res.status === 409) return false;
      if (!res.ok) throw await failed(res);
      return true;
    },

    watch(sessionId, onRow, onSubscribed) {
      let source: EventSource;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let closed = false;

      function connect() {
        source = new EventSource(`${API}/api/sessions/${encodeURIComponent(sessionId)}/events`);
        // Бэкенд шлёт ready на каждое (пере)подключение → транспорт перечитывает снимок, пропущенное не теряется
        source.addEventListener("ready", onSubscribed);
        source.addEventListener("row", (event) => onRow(JSON.parse(event.data) as Row));
        // Обрыв сети EventSource переживает сам, но на не-200 (прокси, пока бэкенд перезапускается) сдаётся навсегда
        source.onerror = () => {
          if (closed || source.readyState !== EventSource.CLOSED) return;
          retry = setTimeout(connect, RECONNECT_MS);
        };
      }
      connect();

      return () => {
        closed = true;
        clearTimeout(retry);
        source.close();
      };
    },
  };
}

let httpTransport: SessionTransport | null = null;

// Лениво, только в браузере (выбор — defaultTransport в index.ts)
export function getHttpTransport(): SessionTransport {
  httpTransport ??= createSupabaseTransport({ api: httpSessionsApi() });
  return httpTransport;
}
