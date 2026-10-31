import { afterEach, describe, expect, test, vi } from "vitest";
import { fixtureReceipt } from "@/lib/receipt/fixture";
import { createSupabaseTransport, type Row, type SessionsApi } from "@/lib/transport/supabase";
import type { Session } from "@/lib/types";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Общая «база» для клиентов. Каждый вызов — асинхронный (как сеть), поэтому записи разных клиентов
// перемежаются между чтением и условной записью — иначе тест на потерянные тапы ничего бы не проверял
function fakeServer() {
  const rows = new Map<string, Row>();
  const watchers = new Set<{ sessionId: string; onRow: (row: Row) => void }>();
  const notify = (row: Row) => {
    for (const w of watchers) if (w.sessionId === row.id) setTimeout(() => w.onRow(structuredClone(row)), 0);
  };
  const api = (): SessionsApi => ({
    select: async (sessionId) => {
      await tick();
      const row = rows.get(sessionId);
      return row ? structuredClone(row) : null;
    },
    insert: async (row) => {
      await tick();
      if (rows.has(row.id)) throw new Error("duplicate key");
      rows.set(row.id, structuredClone(row));
      notify(row);
    },
    updateIfVersion: async (row, expectedVersion) => {
      await tick();
      if (rows.get(row.id)?.version !== expectedVersion) return false;
      rows.set(row.id, structuredClone(row));
      notify(row);
      return true;
    },
    watch: (sessionId, onRow, onSubscribed) => {
      const watcher = { sessionId, onRow };
      watchers.add(watcher);
      setTimeout(onSubscribed, 0);
      return () => watchers.delete(watcher);
    },
  });
  return { rows, api, watchers };
}

function makeSession(id = "s1"): Session {
  return {
    id,
    merchant: fixtureReceipt.merchant,
    items: Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, priceGrosze: 100 })),
    serviceGrosze: 0,
    participants: [{ id: "h", name: "Host", color: "vista", isHost: true }],
    claims: {},
    createdAt: 0,
  };
}

// Идемпотентно, как в сторе: «поставить клейм», а не «переключить»
const claim = (itemId: string, participantId: string) => (s: Session) =>
  (s.claims[itemId] ?? []).includes(participantId)
    ? s
    : { ...s, claims: { ...s.claims, [itemId]: [...(s.claims[itemId] ?? []), participantId] } };

const settle = async (n = 10) => {
  for (let i = 0; i < n; i++) await tick();
};

function seeded(server: ReturnType<typeof fakeServer>, session = makeSession(), version = 1) {
  server.rows.set(session.id, { id: session.id, version, data: session });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("load / save", () => {
  test("load: строка таблицы → Session; неизвестная → null", async () => {
    const server = fakeServer();
    seeded(server);
    const client = createSupabaseTransport({ api: server.api() });
    expect(await client.load("s1")).toEqual(makeSession());
    expect(await client.load("nope")).toBeNull();
  });

  test("load: сеть упала → null и warn, без исключения", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = { ...fakeServer().api(), select: () => Promise.reject(new Error("offline")) };
    expect(await createSupabaseTransport({ api }).load("s1")).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  test("save создаёт строку version 1; update сразу после save ждёт insert (очередь)", async () => {
    const server = fakeServer();
    const client = createSupabaseTransport({ api: server.api() });
    client.save(makeSession());
    const fresh = await client.update("s1", claim("i0", "h"));
    expect(fresh?.claims).toEqual({ i0: ["h"] });
    expect(server.rows.get("s1")?.version).toBe(2);
  });
});

describe("update", () => {
  test("конфликт версии → перечитывает свежую строку и применяет apply снова", async () => {
    const server = fakeServer();
    seeded(server);
    const a = createSupabaseTransport({ api: server.api() });
    const b = createSupabaseTransport({ api: server.api() });
    await a.load("s1"); // A видела version 1
    await b.update("s1", claim("i1", "b")); // в базе уже version 2, A о нём не знает
    const api = server.api();
    const spy = vi.spyOn(api, "updateIfVersion");
    const a2 = createSupabaseTransport({ api });
    await a2.load("s1");
    server.rows.set("s1", { ...server.rows.get("s1")!, version: 3 }); // ещё одна чужая запись
    const fresh = await a2.update("s1", claim("i0", "a"));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(fresh?.claims).toEqual({ i1: ["b"], i0: ["a"] });
    expect(server.rows.get("s1")?.version).toBe(4);
  });

  test("конфликт не разрешился до дедлайна → warn и свежий снимок из базы", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = fakeServer();
    seeded(server);
    const api = { ...server.api(), updateIfVersion: vi.fn(async () => false) };
    const fresh = await createSupabaseTransport({ api, timeoutMs: 30 }).update("s1", claim("i0", "a"));
    expect(api.updateIfVersion.mock.calls.length).toBeGreaterThan(1);
    expect(warn).toHaveBeenCalled();
    expect(fresh).toEqual(makeSession());
  });

  test("неизвестная сессия → null, без записи", async () => {
    const server = fakeServer();
    expect(await createSupabaseTransport({ api: server.api() }).update("nope", claim("i0", "a"))).toBeNull();
    expect(server.rows.size).toBe(0);
  });

  test("apply без изменений → новой версии нет", async () => {
    const server = fakeServer();
    seeded(server);
    await createSupabaseTransport({ api: server.api() }).update("s1", (s) => s);
    expect(server.rows.get("s1")?.version).toBe(1);
  });

  test("зависший запрос → по таймауту свежий снимок из базы, следующие записи в очереди идут", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = fakeServer();
    seeded(server);
    const base = server.api();
    let hang = true;
    const api: SessionsApi = {
      ...base,
      updateIfVersion: (row, v) => (hang ? new Promise(() => {}) : base.updateIfVersion(row, v)),
    };
    const client = createSupabaseTransport({ api, timeoutMs: 20 });
    expect(await client.update("s1", claim("i0", "a"))).toEqual(makeSession());
    expect(warn).toHaveBeenCalled();
    hang = false;
    expect((await client.update("s1", claim("i1", "a")))?.claims).toEqual({ i1: ["a"] });
  });

  test("запись успела после таймаута → её эхо из realtime всё-таки доходит до самого автора", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = fakeServer();
    seeded(server);
    const base = server.api();
    const api: SessionsApi = {
      ...base,
      updateIfVersion: async (row, v) => {
        await new Promise((resolve) => setTimeout(resolve, 40)); // дольше таймаута
        return base.updateIfVersion(row, v);
      },
    };
    const a = createSupabaseTransport({ api, timeoutMs: 20 });
    const received: Session[] = [];
    a.subscribe("s1", (s) => received.push(s));
    await settle();
    expect(await a.update("s1", claim("i0", "a"))).toEqual(makeSession()); // ответ по таймауту — без тапа
    expect(warn).toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(received.at(-1)?.claims).toEqual({ i0: ["a"] });
  });

  test("ответ — самый свежий снимок на момент ответа: более новая строка из realtime не затирается нашей", async () => {
    const server = fakeServer();
    seeded(server);
    const b = createSupabaseTransport({ api: server.api() });
    const base = server.api();
    // Пока ответ A «едет», B успевает записать поверх, и realtime доносит это до A
    const api: SessionsApi = {
      ...base,
      updateIfVersion: async (row, v) => {
        const ok = await base.updateIfVersion(row, v);
        await b.update("s1", claim("i1", "b"));
        await settle();
        return ok;
      },
    };
    const a = createSupabaseTransport({ api });
    a.subscribe("s1", () => {});
    await settle();
    const fresh = await a.update("s1", claim("i0", "a"));
    expect(fresh?.claims).toEqual({ i0: ["a"], i1: ["b"] });
  });

  test("два клиента одновременно ставят 20 разных клеймов — ни один не потерян", async () => {
    const server = fakeServer();
    seeded(server);
    const a = createSupabaseTransport({ api: server.api() });
    const b = createSupabaseTransport({ api: server.api() });
    await Promise.all([a.load("s1"), b.load("s1")]);
    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => a.update("s1", claim(`i${i}`, "a"))),
      ...Array.from({ length: 10 }, (_, i) => b.update("s1", claim(`i${i + 10}`, "b"))),
    ]);
    const claims = server.rows.get("s1")!.data.claims;
    expect(Object.keys(claims)).toHaveLength(20);
    for (let i = 0; i < 10; i++) {
      expect(claims[`i${i}`]).toEqual(["a"]);
      expect(claims[`i${i + 10}`]).toEqual(["b"]);
    }
  });
});

describe("update: тапы вперемешку", () => {
  test.each([0, 1, 2, 3])("2 клиента × 10 тапов с паузой %i тиков между тапами — ни один не потерян", async (gap) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = fakeServer();
    seeded(server);
    const a = createSupabaseTransport({ api: server.api() });
    const b = createSupabaseTransport({ api: server.api() });
    await Promise.all([a.load("s1"), b.load("s1")]);
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      writes.push(a.update("s1", claim(`i${i}`, "a")), b.update("s1", claim(`i${i + 10}`, "b")));
      for (let t = 0; t < gap; t++) await tick();
    }
    await Promise.all(writes);
    expect(Object.keys(server.rows.get("s1")!.data.claims)).toHaveLength(20);
    expect(warn).not.toHaveBeenCalled();
  });

  test("3 клиента × 10 тапов вперемешку, клиенты подписаны на realtime — ни один не потерян", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = fakeServer();
    seeded(server);
    const clients = ["a", "b", "c"].map((who) => ({ who, t: createSupabaseTransport({ api: server.api() }) }));
    for (const { t } of clients) t.subscribe("s1", () => {});
    await settle();
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      clients.forEach(({ who, t }, k) => writes.push(t.update("s1", claim(`i${(i + k * 7) % 20}`, who))));
      await tick();
    }
    await Promise.all(writes);
    const claims = server.rows.get("s1")!.data.claims;
    expect(Object.values(claims).flat()).toHaveLength(30);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("subscribe", () => {
  test("чужая запись приходит; своё эхо и опоздавшие версии — нет", async () => {
    const server = fakeServer();
    seeded(server);
    const a = createSupabaseTransport({ api: server.api() });
    const b = createSupabaseTransport({ api: server.api() });
    await a.load("s1");
    const received: Session[] = [];
    a.subscribe("s1", (s) => received.push(s));
    await settle();
    await a.update("s1", claim("i0", "a")); // эхо
    await settle();
    expect(received).toEqual([]);
    await b.update("s1", claim("i1", "b")); // чужая — version 3
    await settle();
    expect(received.map((s) => s.claims)).toEqual([{ i0: ["a"], i1: ["b"] }]);
    for (const w of server.watchers) w.onRow({ id: "s1", version: 2, data: makeSession() }); // опоздавшая
    expect(received).toHaveLength(1);
  });

  test("строка изменилась, пока канал подключался → после SUBSCRIBED перечитываем", async () => {
    const server = fakeServer();
    seeded(server);
    const a = createSupabaseTransport({ api: server.api() });
    await a.load("s1");
    const received: Session[] = [];
    server.rows.set("s1", { id: "s1", version: 2, data: { ...makeSession(), claims: { i0: ["b"] } } }); // мимо realtime
    a.subscribe("s1", (s) => received.push(s));
    await settle();
    expect(received.map((s) => s.claims)).toEqual([{ i0: ["b"] }]);
  });

  test("отписка снимает канал", async () => {
    const server = fakeServer();
    const unsubscribe = createSupabaseTransport({ api: server.api() }).subscribe("s1", () => {});
    expect(server.watchers.size).toBe(1);
    unsubscribe();
    expect(server.watchers.size).toBe(0);
  });
});
