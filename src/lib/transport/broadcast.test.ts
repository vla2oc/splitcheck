import { describe, expect, test } from "vitest";
import { fixtureReceipt } from "@/lib/receipt/fixture";
import { createBroadcastTransport, sessionKey, type Channel, type Envelope } from "@/lib/transport/broadcast";
import type { Session } from "@/lib/types";

// In-memory хранилище, общее для «вкладок»
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

// Шина как у BroadcastChannel: асинхронно, всем объектам с тем же именем, кроме самого отправителя
function memoryBus() {
  const channels = new Map<string, Set<{ deliver: (m: Envelope) => void }>>();
  return (name: string): Channel => {
    const peers = channels.get(name) ?? new Set();
    channels.set(name, peers);
    let handler: ((m: Envelope) => void) | null = null;
    const self = { deliver: (m: Envelope) => handler?.(m) };
    peers.add(self);
    return {
      postMessage: (message) => {
        const copy = structuredClone(message);
        for (const peer of peers) if (peer !== self) queueMicrotask(() => peer.deliver(copy));
      },
      listen: (onMessage) => {
        handler = onMessage;
      },
      close: () => {
        peers.delete(self);
      },
    };
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeSession(id = "s1"): Session {
  return {
    id,
    merchant: fixtureReceipt.merchant,
    items: fixtureReceipt.items.map((item, i) => ({ id: `i${i}`, ...item })),
    serviceGrosze: fixtureReceipt.serviceGrosze,
    participants: [{ id: "h", name: "Host", color: "vista", isHost: true }],
    claims: {},
    createdAt: 0,
  };
}

// Две «вкладки» одного браузера: общее хранилище и шина, свои экземпляры транспорта
function twoTabs() {
  const storage = memoryStorage();
  const openChannel = memoryBus();
  return {
    storage,
    tabA: createBroadcastTransport({ storage, openChannel }),
    tabB: createBroadcastTransport({ storage, openChannel }),
  };
}

describe("load / save", () => {
  test("save → load возвращает тот же снимок, в том числе в другой вкладке", async () => {
    const { tabA, tabB } = twoTabs();
    const session = makeSession();
    tabA.save(session);
    expect(await tabA.load("s1")).toEqual(session);
    expect(await tabB.load("s1")).toEqual(session);
  });

  test("неизвестная сессия → null", async () => {
    const { tabA } = twoTabs();
    expect(await tabA.load("nope")).toBeNull();
  });

  test("битый JSON в хранилище → null, без исключения", async () => {
    const { tabA, storage } = twoTabs();
    storage.setItem(sessionKey("s1"), "{oops");
    expect(await tabA.load("s1")).toBeNull();
  });

  test("версия растёт через вкладки: A, затем B → в хранилище version 2", () => {
    const { tabA, tabB, storage } = twoTabs();
    tabA.save(makeSession());
    tabB.save({ ...makeSession(), claims: { i0: ["h"] } });
    const stored = JSON.parse(storage.getItem(sessionKey("s1"))!) as Envelope;
    expect(stored.version).toBe(2);
    expect(stored.session.claims).toEqual({ i0: ["h"] });
  });
});

describe("subscribe", () => {
  test("save во вкладке A → подписчик вкладки B получает снимок", async () => {
    const { tabA, tabB } = twoTabs();
    const received: Session[] = [];
    tabB.subscribe("s1", (s) => received.push(s));
    const session = { ...makeSession(), claims: { i0: ["h"] } };
    tabA.save(session);
    await flush();
    expect(received).toEqual([session]);
  });

  test("своё эхо не возвращается: подписчик вкладки A не получает её же save", async () => {
    const { tabA } = twoTabs();
    const received: Session[] = [];
    tabA.subscribe("s1", (s) => received.push(s));
    tabA.save(makeSession());
    await flush();
    expect(received).toEqual([]);
  });

  test("отписка: после неё снимки не приходят", async () => {
    const { tabA, tabB } = twoTabs();
    const received: Session[] = [];
    const unsubscribe = tabB.subscribe("s1", (s) => received.push(s));
    tabA.save(makeSession());
    await flush();
    unsubscribe();
    tabA.save({ ...makeSession(), claims: { i0: ["h"] } });
    await flush();
    expect(received).toHaveLength(1);
  });

  test("опоздавший снимок старее уже загруженного — не применяется", async () => {
    const storage = memoryStorage();
    const openChannel = memoryBus();
    const tabB = createBroadcastTransport({ storage, openChannel });
    storage.setItem(sessionKey("s1"), JSON.stringify({ version: 5, session: makeSession() }));
    await tabB.load("s1"); // B видел version 5
    const received: Session[] = [];
    tabB.subscribe("s1", (s) => received.push(s));
    openChannel("splitcheck:s1").postMessage({ version: 3, session: { ...makeSession(), claims: { i0: ["h"] } } });
    await flush();
    expect(received).toEqual([]);
  });

  test("подписка на другую сессию снимки этой не получает", async () => {
    const { tabA, tabB } = twoTabs();
    const received: Session[] = [];
    tabB.subscribe("other", (s) => received.push(s));
    tabA.save(makeSession("s1"));
    await flush();
    expect(received).toEqual([]);
  });
});

const claim = (itemId: string, participantId: string) => (s: Session) => ({
  ...s,
  claims: { ...s.claims, [itemId]: [...(s.claims[itemId] ?? []), participantId] },
});

describe("update", () => {
  test("apply поверх снимка из хранилища (а не своего): version + 1, другая вкладка получает, ответ — новый снимок", async () => {
    const { tabA, tabB, storage } = twoTabs();
    tabA.save(makeSession());
    tabB.save({ ...makeSession(), claims: { i1: ["b"] } }); // A этой записи не видела
    const received: Session[] = [];
    tabB.subscribe("s1", (s) => received.push(s));
    const fresh = await tabA.update("s1", claim("i0", "a"));
    await flush();
    const expected = { i1: ["b"], i0: ["a"] };
    expect(fresh?.claims).toEqual(expected);
    expect((JSON.parse(storage.getItem(sessionKey("s1"))!) as Envelope).version).toBe(3);
    expect(received.map((s) => s.claims)).toEqual([expected]);
  });

  test("две вкладки одновременно ставят разные клеймы — оба на месте", async () => {
    const { tabA, tabB } = twoTabs();
    tabA.save(makeSession());
    await tabB.load("s1");
    await Promise.all([
      ...[0, 1, 2].map((i) => tabA.update("s1", claim(`i${i}`, "a"))),
      ...[3, 4, 5].map((i) => tabB.update("s1", claim(`i${i}`, "b"))),
    ]);
    expect((await tabA.load("s1"))?.claims).toEqual({
      i0: ["a"], i1: ["a"], i2: ["a"], i3: ["b"], i4: ["b"], i5: ["b"],
    });
  });

  test("неизвестная сессия → null, ничего не пишет", async () => {
    const { tabA, storage } = twoTabs();
    expect(await tabA.update("nope", claim("i0", "a"))).toBeNull();
    expect(storage.getItem(sessionKey("nope"))).toBeNull();
  });

  test("apply без изменений → та же версия, в канал ничего", async () => {
    const { tabA, tabB, storage } = twoTabs();
    tabA.save(makeSession());
    const received: Session[] = [];
    tabB.subscribe("s1", (s) => received.push(s));
    await tabA.update("s1", (s) => s);
    await flush();
    expect((JSON.parse(storage.getItem(sessionKey("s1"))!) as Envelope).version).toBe(1);
    expect(received).toEqual([]);
  });

  test("нет хранилища → update поверх последнего известного снимка, вкладки получают по каналу", async () => {
    const openChannel = memoryBus();
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const tabA = createBroadcastTransport({ storage: broken, openChannel });
    const tabB = createBroadcastTransport({ storage: broken, openChannel });
    const received: Session[] = [];
    tabB.subscribe("s1", (s) => received.push(s));
    tabA.save(makeSession());
    const fresh = await tabA.update("s1", claim("i0", "a"));
    await flush();
    expect(fresh?.claims).toEqual({ i0: ["a"] });
    expect(received.map((s) => s.claims)).toEqual([{}, { i0: ["a"] }]);
  });
});
