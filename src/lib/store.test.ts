import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fixtureReceipt } from "@/lib/receipt/fixture";
import { parsePLN } from "@/lib/money";
import { shareOf, totalOf } from "@/lib/split";
import {
  formatBlik,
  loadSession,
  markGuestTab,
  meKey,
  normalizeBlik,
  readMe,
  setTransport,
  subscribeSession,
  useSessionStore,
  writeMe,
} from "@/lib/store";
import type { Apply, SessionTransport } from "@/lib/transport/types";
import type { Session } from "@/lib/types";

// В Node нет localStorage — подставляем минимальный на Map
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

beforeEach(() => {
  useSessionStore.setState({ session: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setTransport(null);
});

describe("createSession", () => {
  test("кладёт сессию в стор и возвращает её id (10 символов)", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const id = useSessionStore.getState().createSession(fixtureReceipt);
    const session = useSessionStore.getState().session;
    expect(session?.id).toBe(id);
    expect(id).toHaveLength(10);
  });

  test("единственный участник — хост Host/vista, claims пустые", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    useSessionStore.getState().createSession(fixtureReceipt);
    const session = useSessionStore.getState().session!;
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0]).toMatchObject({ name: "Host", color: "vista", isHost: true });
    expect(session.claims).toEqual({});
  });

  test("позиции из чека с уникальными id, сумма сходится с totalGrosze", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    useSessionStore.getState().createSession(fixtureReceipt);
    const session = useSessionStore.getState().session!;
    expect(session.items.map(({ name, priceGrosze }) => ({ name, priceGrosze }))).toEqual(fixtureReceipt.items);
    expect(new Set(session.items.map((item) => item.id)).size).toBe(fixtureReceipt.items.length);
    expect(session.merchant).toBe("Bistro Mokotów");
    expect(totalOf(session)).toBe(fixtureReceipt.totalGrosze);
  });

  test("пишет localStorage splitcheck:me:<id> = id хоста", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const id = useSessionStore.getState().createSession(fixtureReceipt);
    const hostId = useSessionStore.getState().session!.participants[0].id;
    expect(storage.getItem(meKey(id))).toBe(hostId);
  });

  test("без localStorage не падает", () => {
    expect(typeof globalThis.localStorage).toBe("undefined");
    expect(() => useSessionStore.getState().createSession(fixtureReceipt)).not.toThrow();
    expect(useSessionStore.getState().session).not.toBeNull();
  });
});

// Сессия из фикстуры; localStorage — фейковый
function setup() {
  const storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
  const store = useSessionStore.getState();
  store.createSession(fixtureReceipt);
  const session = () => useSessionStore.getState().session!;
  return { storage, store, session, hostId: session().participants[0].id };
}

describe("toggleClaim", () => {
  test("первый тап добавляет участника, второй снимает", () => {
    const { store, session, hostId } = setup();
    const itemId = session().items[0].id;
    store.toggleClaim(itemId, hostId);
    expect(session().claims[itemId]).toEqual([hostId]);
    store.toggleClaim(itemId, hostId);
    expect(session().claims[itemId]).toEqual([]);
  });

  test("несколько участников на позиции, снятие одного не трогает других", () => {
    const { store, session, hostId } = setup();
    const ania = store.addParticipant("Ania")!;
    const itemId = session().items[0].id;
    store.toggleClaim(itemId, hostId);
    store.toggleClaim(itemId, ania);
    expect(session().claims[itemId]).toEqual([hostId, ania]);
    store.toggleClaim(itemId, hostId);
    expect(session().claims[itemId]).toEqual([ania]);
  });

  test("новый объект сессии на каждое действие — zustand-подписчики видят изменение", () => {
    const { store, session, hostId } = setup();
    const before = session();
    store.toggleClaim(before.items[0].id, hostId);
    expect(session()).not.toBe(before);
    expect(before.claims).toEqual({});
  });
});

describe("addParticipant", () => {
  test("гости получают avatar-1..6 по кругу, хост остаётся vista", () => {
    const { store, session } = setup();
    for (const name of ["A", "B", "C", "D", "E", "F", "G"]) store.addParticipant(name);
    expect(session().participants.map((p) => p.color)).toEqual([
      "vista",
      "avatar-1",
      "avatar-2",
      "avatar-3",
      "avatar-4",
      "avatar-5",
      "avatar-6",
      "avatar-1",
    ]);
    expect(session().participants.filter((p) => p.isHost)).toHaveLength(1);
  });

  test("возвращает id гостя и не перезаписывает «кто я»", () => {
    const { store, session, storage, hostId } = setup();
    const id = store.addParticipant("Ania");
    expect(session().participants.at(-1)).toMatchObject({ id, name: "Ania", isHost: false });
    expect(storage.getItem(meKey(session().id))).toBe(hostId);
  });

  test("без сессии → null", () => {
    expect(useSessionStore.getState().addParticipant("Ania")).toBeNull();
  });
});

describe("renameParticipant", () => {
  test("меняет имя только у указанного участника", () => {
    const { store, session, hostId } = setup();
    const ania = store.addParticipant("Ania")!;
    store.renameParticipant(ania, "Anna");
    expect(session().participants.map((p) => p.name)).toEqual(["Host", "Anna"]);
    expect(session().participants[0].id).toBe(hostId);
  });
});

describe("readMe / writeMe", () => {
  test("пишет и читает splitcheck:me:<id>", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    writeMe("s1", "p1");
    expect(readMe("s1")).toBe("p1");
    expect(readMe("s2")).toBeNull();
  });

  test("без localStorage: readMe → null, writeMe не падает", () => {
    expect(() => writeMe("s1", "p1")).not.toThrow();
    expect(readMe("s1")).toBeNull();
  });
});

describe("инвариант через стор", () => {
  test("после 300 случайных тапов 4 участников Σ shareOf === total на каждом шаге", () => {
    const { store, session, hostId } = setup();
    const people = [hostId, store.addParticipant("Ania")!, store.addParticipant("Kuba")!, store.addParticipant("Ola")!];
    // Детерминированный LCG — без нового пакета
    let seed = 7;
    const next = (max: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; // 32-битная арифметика, без потери точности
      return (seed >>> 16) % max;
    };
    for (let tap = 0; tap < 300; tap++) {
      const items = session().items;
      store.toggleClaim(items[next(items.length)].id, people[next(people.length)]);
      const s = session();
      expect(s.participants.reduce((sum, p) => sum + shareOf(s, p.id), 0)).toBe(totalOf(s));
    }
  });
});

describe("updateItemPrice", () => {
  test("меняет цену одной позиции, total сдвигается на разницу", () => {
    const { store, session } = setup();
    const [first, second] = session().items;
    const before = totalOf(session());
    store.updateItemPrice(first.id, first.priceGrosze + 150);
    expect(session().items[0].priceGrosze).toBe(first.priceGrosze + 150);
    expect(session().items[1]).toEqual(second);
    expect(totalOf(session())).toBe(before + 150);
  });

  test("ввод из поля цены через parsePLN → инвариант держится при клеймах", () => {
    const { store, session, hostId } = setup();
    const ania = store.addParticipant("Ania")!;
    const item = session().items[0];
    store.toggleClaim(item.id, hostId);
    store.toggleClaim(item.id, ania);
    for (const input of ["35,51", "35.5 zł", "0", "1 214,99"]) {
      const grosze = parsePLN(input);
      expect(grosze).not.toBeNull();
      store.updateItemPrice(item.id, grosze!);
      const s = session();
      expect(s.items[0].priceGrosze).toBe(grosze);
      expect(s.participants.reduce((sum, p) => sum + shareOf(s, p.id), 0)).toBe(totalOf(s));
    }
  });

  test("не целое / отрицательное / NaN — цена не меняется", () => {
    const { store, session } = setup();
    const item = session().items[0];
    for (const bad of [-1, 12.5, Number.NaN]) store.updateItemPrice(item.id, bad);
    expect(session().items[0].priceGrosze).toBe(item.priceGrosze);
  });
});

describe("BLIK", () => {
  test("normalizeBlik: 9 цифр, пробелы/дефисы/+48 допустимы, остальное — null", () => {
    expect(normalizeBlik("600 123 456")).toBe("600123456");
    expect(normalizeBlik("+48 600-123-456")).toBe("600123456");
    for (const bad of ["", "12345", "6001234567", "600 12a 456", "+49600123456"]) {
      expect(normalizeBlik(bad)).toBeNull();
    }
  });

  test("formatBlik: по 3 цифры", () => {
    expect(formatBlik("600123456")).toBe("600 123 456");
  });

  test("setBlikPhone сохраняет номер в сессию и localStorage", () => {
    const { store, session, storage } = setup();
    expect(store.setBlikPhone("600 123 456")).toBe(true);
    expect(session().blikPhone).toBe("600123456");
    expect(storage.getItem("splitcheck:blik")).toBe("600123456");
  });

  test("невалидный номер → false, ничего не меняется", () => {
    const { store, session, storage } = setup();
    store.setBlikPhone("600123456");
    expect(store.setBlikPhone("12345")).toBe(false);
    expect(session().blikPhone).toBe("600123456");
    expect(storage.getItem("splitcheck:blik")).toBe("600123456");
  });

  test("пустая строка стирает номер", () => {
    const { store, session, storage } = setup();
    store.setBlikPhone("600123456");
    expect(store.setBlikPhone("  ")).toBe(true);
    expect(session().blikPhone).toBeUndefined();
    expect(storage.getItem("splitcheck:blik")).toBeNull();
  });

  test("номер переживает создание новой сессии", () => {
    const { store, session } = setup();
    store.setBlikPhone("600123456");
    const firstId = session().id;
    store.createSession(fixtureReceipt);
    expect(session().id).not.toBe(firstId);
    expect(session().blikPhone).toBe("600123456");
  });
});

// Транспорт-шпион: «сервер» — последний снимок транспорта. update применяет apply к нему и сразу отвечает,
// а с hold — копит ответы до release (запись «в пути»). push — снимок из другой вкладки
function spyTransport(stored: Session | null = null, { hold = false } = {}) {
  const state: { server: Session | null } = { server: stored };
  const saved: Session[] = [];
  const applies: Apply[] = [];
  const held: (() => void)[] = [];
  const listeners = new Set<(s: Session) => void>();
  const transport: SessionTransport = {
    load: async () => stored,
    save: (session) => {
      saved.push(session);
      state.server = session;
    },
    update: (_id, apply) => {
      applies.push(apply);
      if (!state.server) return Promise.resolve(null);
      const fresh = apply(state.server);
      state.server = fresh;
      return hold ? new Promise((resolve) => held.push(() => resolve(fresh))) : Promise.resolve(fresh);
    },
    subscribe: (_id, onSession) => {
      listeners.add(onSession);
      return () => listeners.delete(onSession);
    },
  };
  return {
    state,
    saved,
    applies,
    transport,
    push: (s: Session) => listeners.forEach((l) => l(s)),
    // Отвечает на все записи в пути
    release: async () => {
      held.splice(0).forEach((resolve) => resolve());
      await flush();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("стор ↔ транспорт", () => {
  test("createSession → save; остальные действия → update, и снимок транспорта совпадает со стором", async () => {
    const spy = spyTransport();
    setTransport(spy.transport);
    const { store, session, hostId } = setup();
    const ania = store.addParticipant("Ania")!;
    store.toggleClaim(session().items[0].id, hostId);
    store.renameParticipant(ania, "Anna");
    store.updateItemPrice(session().items[0].id, 4000);
    store.setBlikPhone("600123456");
    await flush();
    expect(spy.saved).toHaveLength(1);
    expect(spy.applies).toHaveLength(5);
    expect(spy.state.server).toEqual(session());
  });

  test("оптимистично: стор меняется сразу, до ответа транспорта", () => {
    const spy = spyTransport(null, { hold: true });
    setTransport(spy.transport);
    const { store, session, hostId } = setup();
    store.toggleClaim(session().items[0].id, hostId);
    expect(session().claims[session().items[0].id]).toEqual([hostId]);
  });

  test("ответ транспорта (свежий снимок с чужим тапом) попадает в стор", async () => {
    const spy = spyTransport(null, { hold: true });
    setTransport(spy.transport);
    const { store, session, hostId } = setup();
    const [first, second] = session().items;
    spy.state.server = { ...spy.state.server!, claims: { [second.id]: ["ania"] } }; // чужая запись, которой стор ещё не видел
    store.toggleClaim(first.id, hostId);
    await spy.release();
    expect(session().claims).toEqual({ [first.id]: [hostId], [second.id]: ["ania"] });
  });

  test("снимок из другой вкладки, пришедший во время записи, не стирает мой тап", async () => {
    const spy = spyTransport(null, { hold: true });
    setTransport(spy.transport);
    const { store, session, hostId } = setup();
    subscribeSession(session().id);
    const [first, second] = session().items;
    const remote = { ...session(), claims: { [second.id]: ["ania"] } }; // снимок без моего тапа
    store.toggleClaim(first.id, hostId);
    spy.push(remote);
    expect(session().claims).toEqual({ [first.id]: [hostId], [second.id]: ["ania"] });
    await spy.release();
    expect(session().claims[first.id]).toEqual([hostId]);
  });

  test("toggleClaim: apply — «поставить/снять», а не «переключить»: повтор ничего не меняет", () => {
    const spy = spyTransport(null, { hold: true });
    setTransport(spy.transport);
    const { store, session, hostId } = setup();
    const itemId = session().items[0].id;
    const base = session();
    store.toggleClaim(itemId, hostId); // взять
    const [take] = spy.applies;
    const once = take(base);
    expect(take(once)).toBe(once);
    expect(once.claims[itemId]).toEqual([hostId]);
  });

  test("addParticipant: повтор apply не дублирует гостя; цвет — по снимку, к которому применяют", () => {
    const spy = spyTransport(null, { hold: true });
    setTransport(spy.transport);
    const { store, session } = setup();
    const base = session();
    const id = store.addParticipant("Ania")!;
    const [add] = spy.applies;
    const once = add(base);
    expect(add(once)).toBe(once);
    // На сервере уже есть другой гость (avatar-1) → наш получает avatar-2
    const withKuba = { ...base, participants: [...base.participants, { id: "k", name: "Kuba", color: "avatar-1", isHost: false }] };
    expect(add(withKuba).participants.find((p) => p.id === id)?.color).toBe("avatar-2");
  });

  test("update упал → стор остаётся с оптимистичным изменением, в консоли warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spy = spyTransport();
    setTransport({ ...spy.transport, update: () => Promise.reject(new Error("offline")) });
    const { store, session, hostId } = setup();
    store.toggleClaim(session().items[0].id, hostId);
    await flush();
    expect(session().claims[session().items[0].id]).toEqual([hostId]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("applySnapshot кладёт снимок в стор и не сохраняет его повторно", () => {
    const spy = spyTransport();
    setTransport(spy.transport);
    const { session } = setup();
    const incoming = { ...session(), claims: { x: ["h"] } };
    spy.saved.length = 0;
    useSessionStore.getState().applySnapshot(incoming);
    expect(session()).toBe(incoming);
    expect(spy.saved).toEqual([]);
    expect(spy.applies).toEqual([]);
  });

  test("loadSession: найденный снимок → стор, true; нет такой сессии → false", async () => {
    const { session } = setup();
    const stored = { ...session(), id: "from-storage" };
    setTransport(spyTransport(stored).transport);
    expect(await loadSession("from-storage")).toBe(true);
    expect(session().id).toBe("from-storage");

    setTransport(spyTransport(null).transport);
    useSessionStore.setState({ session: null });
    expect(await loadSession("nope")).toBe(false);
  });

  test("subscribeSession: снимок другой вкладки → стор; после отписки — нет", () => {
    const spy = spyTransport();
    setTransport(spy.transport);
    const { session } = setup();
    const unsubscribe = subscribeSession(session().id);
    const first = { ...session(), claims: { a: ["h"] } };
    spy.push(first);
    expect(session()).toBe(first);
    unsubscribe();
    spy.push({ ...first, claims: {} });
    expect(session()).toBe(first);
  });

  test("без транспорта (Node, SSR) действия работают, loadSession → false", async () => {
    const { store, session, hostId } = setup();
    store.toggleClaim(session().items[0].id, hostId);
    expect(session().claims[session().items[0].id]).toEqual([hostId]);
    useSessionStore.setState({ session: null });
    expect(await loadSession("any")).toBe(false);
  });
});

describe("«кто я»: вкладка поверх устройства", () => {
  function tabs() {
    const local = fakeStorage();
    const tab = fakeStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", tab);
    return { local, tab };
  }

  test("хост пишет и во вкладку, и в устройство; новая вкладка наследует хоста", () => {
    const { local, tab } = tabs();
    writeMe("s1", "host");
    expect(tab.getItem(meKey("s1"))).toBe("host");
    expect(local.getItem(meKey("s1"))).toBe("host");
    vi.stubGlobal("sessionStorage", fakeStorage()); // новая вкладка — пустой sessionStorage
    expect(readMe("s1")).toBe("host");
  });

  test("?as=guest: вкладка — гость без участника, устройство остаётся за хостом", () => {
    const { local } = tabs();
    local.setItem(meKey("s1"), "host");
    markGuestTab("s1");
    expect(readMe("s1")).toBe(""); // пометка: не хост, участника ещё нет
    writeMe("s1", "ania");
    expect(readMe("s1")).toBe("ania");
    expect(local.getItem(meKey("s1"))).toBe("host");
  });

  test("markGuestTab не затирает уже выбранного гостя (F5 в гостевой вкладке)", () => {
    const { tab } = tabs();
    tab.setItem(meKey("s1"), "ania");
    markGuestTab("s1");
    expect(readMe("s1")).toBe("ania");
  });
});
