import { describe, expect, test } from "vitest";
import { allocated, itemShares, itemSharesFor, shareOf, totalOf } from "@/lib/split";
import type { Item, Session } from "@/lib/types";

// Порядок входа: хост, Ania, Bartek
const participants = [
  { id: "h", name: "Host", color: "vista", isHost: true },
  { id: "a", name: "Ania", color: "avatar-1", isHost: false },
  { id: "b", name: "Bartek", color: "avatar-2", isHost: false },
];

function makeSession(items: Item[], claims: Session["claims"], serviceGrosze = 0): Session {
  return { id: "s1", items, serviceGrosze, participants, claims, createdAt: 0 };
}

const pizza = { id: "pizza", name: "Pizza Margherita", priceGrosze: 3200 };
const burger = { id: "burger", name: "Burger klasyczny", priceGrosze: 3800 };
const piwo = { id: "piwo", name: "Piwo Żywiec 0,5l", priceGrosze: 1400 };

describe("totalOf", () => {
  test("позиции + сервис", () => {
    expect(totalOf(makeSession([pizza, burger, piwo], {}, 840))).toBe(3200 + 3800 + 1400 + 840);
  });
});

describe("itemShares", () => {
  test("одна позиция на троих: 1000 → 334/333/333, остаток по порядку входа, а не клеймов", () => {
    const item = { id: "x", name: "Deska serów", priceGrosze: 1000 };
    expect(itemShares(makeSession([item], { x: ["b", "a", "h"] }))).toEqual({ h: 334, a: 333, b: 333 });
  });

  test("остаток 2 гр — первым двум по порядку входа", () => {
    const item = { id: "x", name: "Deska serów", priceGrosze: 1001 };
    expect(itemShares(makeSession([item], { x: ["a", "b", "h"] }))).toEqual({ h: 334, a: 334, b: 333 });
  });

  test("пустые клеймы: всё хосту", () => {
    expect(itemShares(makeSession([pizza, burger, piwo], {}))).toEqual({ h: 8400, a: 0, b: 0 });
    expect(itemShares(makeSession([pizza], { pizza: [] }))).toEqual({ h: 3200, a: 0, b: 0 });
  });

  test("всё взято: каждый платит своё", () => {
    const shares = itemShares(makeSession([pizza, burger, piwo], { pizza: ["h"], burger: ["a"], piwo: ["b"] }));
    expect(shares).toEqual({ h: 3200, a: 3800, b: 1400 });
  });

  test("хост ничего не тапал: невзятое → хосту", () => {
    const shares = itemShares(makeSession([pizza, burger, piwo], { burger: ["a"], piwo: ["a", "b"] }));
    expect(shares).toEqual({ h: 3200, a: 3800 + 700, b: 700 });
  });

  test("чужие и повторные id в клеймах игнорируются", () => {
    const shares = itemShares(makeSession([piwo], { piwo: ["a", "a", "ghost"] }));
    expect(shares).toEqual({ h: 0, a: 1400, b: 0 });
  });
});

const sharesOf = (s: Session) => Object.fromEntries(s.participants.map((p) => [p.id, shareOf(s, p.id)]));

describe("shareOf — сервис", () => {
  test("сервис 0: доли = доли позиций", () => {
    const s = makeSession([pizza, burger, piwo], { burger: ["a"], piwo: ["a", "b"] });
    expect(sharesOf(s)).toEqual(itemShares(s));
  });

  test("сервис делится ровно: 10% от 8400", () => {
    const s = makeSession([pizza, burger, piwo], { pizza: ["h"], burger: ["a"], piwo: ["b"] }, 840);
    expect(sharesOf(s)).toEqual({ h: 3520, a: 4180, b: 1540 });
  });

  test("сервис с остатком: лишний грош — наибольшему дробному остатку", () => {
    // 100 × 3200/8400 = 38.10, × 3800/8400 = 45.24, × 1400/8400 = 16.67 → floor 38+45+16 = 99, +1 → b
    const s = makeSession([pizza, burger, piwo], { pizza: ["h"], burger: ["a"], piwo: ["b"] }, 100);
    expect(sharesOf(s)).toEqual({ h: 3238, a: 3845, b: 1417 });
  });

  test("равные остатки — по порядку входа", () => {
    const item = { id: "x", name: "Deska serów", priceGrosze: 300 };
    expect(sharesOf(makeSession([item], { x: ["b", "a", "h"] }, 2))).toEqual({ h: 101, a: 101, b: 100 });
  });

  test("часть сервиса за невзятое — хосту", () => {
    const s = makeSession([pizza, burger, piwo], { burger: ["a"] }, 840);
    expect(sharesOf(s)).toEqual({ h: 3200 + 1400 + 460, a: 3800 + 380, b: 0 });
  });

  test("Σ позиций = 0: весь сервис хосту", () => {
    expect(sharesOf(makeSession([], {}, 500))).toEqual({ h: 500, a: 0, b: 0 });
  });

  test("неизвестный участник → 0", () => {
    expect(shareOf(makeSession([pizza], { pizza: ["a"] }, 320), "ghost")).toBe(0);
  });
});

describe("allocated", () => {
  test("ничего не взято → 0", () => {
    expect(allocated(makeSession([pizza, burger, piwo], {}, 840))).toBe(0);
  });

  test("взятые позиции + их часть сервиса", () => {
    // 3800 + floor(840 × 3800 / 8400) = 3800 + 380
    expect(allocated(makeSession([pizza, burger, piwo], { burger: ["a"] }, 840))).toBe(4180);
  });

  test("всё взято → === total", () => {
    const s = makeSession([pizza, burger, piwo], { pizza: ["h"], burger: ["a", "b"], piwo: ["b"] }, 777);
    expect(allocated(s)).toBe(totalOf(s));
  });
});

// mulberry32 — детерминированный PRNG без пакета
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Фикстура SPEC: Piwo развёрнуто в 3 строки, сервис 10%
const fixtureItems: Item[] = [
  { id: "i1", name: "Pizza Margherita", priceGrosze: 3200 },
  { id: "i2", name: "Burger klasyczny", priceGrosze: 3800 },
  { id: "i3", name: "Frytki", priceGrosze: 1200 },
  { id: "i4", name: "Piwo Żywiec 0,5l", priceGrosze: 1400 },
  { id: "i5", name: "Piwo Żywiec 0,5l", priceGrosze: 1400 },
  { id: "i6", name: "Piwo Żywiec 0,5l", priceGrosze: 1400 },
  { id: "i7", name: "Coca-Cola 0,33l", priceGrosze: 900 },
  { id: "i8", name: "Lemoniada", priceGrosze: 1400 },
  { id: "i9", name: "Tiramisu", priceGrosze: 1800 },
];

describe("инвариант: Σ shareOf === total", () => {
  test("600 случайных комбинаций (seed 42): доли целые ≥ 0, allocated ≤ total, всё взято → allocated === total", () => {
    const rand = mulberry32(42);
    const int = (max: number) => Math.floor(rand() * max);
    let fullyClaimed = 0;

    for (let run = 0; run < 600; run++) {
      const people = Array.from({ length: 1 + int(6) }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        color: "vista",
        isHost: i === 0,
      }));
      // Половина прогонов — фикстура, половина — случайные цены (больше неделимых остатков)
      const items =
        run % 2 === 0
          ? fixtureItems
          : Array.from({ length: int(10) }, (_, i) => ({ id: `r${i}`, name: `R${i}`, priceGrosze: int(10000) }));
      const claimProbability = rand();
      const claims: Session["claims"] = {};
      for (const item of items) {
        claims[item.id] = people.filter(() => rand() < claimProbability).map((p) => p.id);
      }
      const serviceGrosze = run % 3 === 0 ? 0 : int(5000);
      const s: Session = { id: `s${run}`, items, serviceGrosze, participants: people, claims, createdAt: 0 };

      const shares = people.map((p) => shareOf(s, p.id));
      for (const share of shares) {
        expect(Number.isInteger(share)).toBe(true);
        expect(share).toBeGreaterThanOrEqual(0);
      }
      expect(shares.reduce((a, b) => a + b, 0)).toBe(totalOf(s));

      const done = allocated(s);
      expect(Number.isInteger(done)).toBe(true);
      expect(done).toBeGreaterThanOrEqual(0);
      expect(done).toBeLessThanOrEqual(totalOf(s));
      if (items.length > 0 && items.every((item) => claims[item.id].length > 0)) {
        expect(done).toBe(totalOf(s));
        fullyClaimed++;
      }
    }
    // Ветка «всё взято» реально проверялась, а не пропускалась
    expect(fullyClaimed).toBeGreaterThan(50);
  });
});

describe("itemSharesFor — строки персонального чека", () => {
  test("общая позиция: доля и ÷N, остаток 1 гр — первому по порядку входа", () => {
    const item = { id: "x", name: "Deska serów", priceGrosze: 1001 };
    const s = makeSession([item], { x: ["b", "a"] });
    expect(itemSharesFor(s, "a").items).toEqual([{ itemId: "x", grosze: 501, ways: 2 }]);
    expect(itemSharesFor(s, "b").items).toEqual([{ itemId: "x", grosze: 500, ways: 2 }]);
  });

  test("невзятое — в строках хоста с ways 0, у гостей его нет", () => {
    const s = makeSession([pizza, burger], { burger: ["a"] });
    expect(itemSharesFor(s, "h").items).toEqual([{ itemId: "pizza", grosze: 3200, ways: 0 }]);
    expect(itemSharesFor(s, "a").items).toEqual([{ itemId: "burger", grosze: 3800, ways: 1 }]);
    expect(itemSharesFor(s, "b").items).toEqual([]);
  });

  test("сервис — тот же, что внутри shareOf", () => {
    const s = makeSession([pizza, burger, piwo], { pizza: ["h", "a"], burger: ["a"], piwo: ["b"] }, 840);
    for (const p of participants) {
      const { items, service } = itemSharesFor(s, p.id);
      expect(items.reduce((sum, line) => sum + line.grosze, 0) + service).toBe(shareOf(s, p.id));
    }
  });

  test("неизвестный участник — пусто", () => {
    expect(itemSharesFor(makeSession([pizza], { pizza: ["a"] }, 100), "ghost")).toEqual({ items: [], service: 0 });
  });

  test("600 случайных комбинаций (seed 7): Σ строк + сервис === shareOf до гроша", () => {
    const rand = mulberry32(7);
    const int = (max: number) => Math.floor(rand() * max);
    for (let run = 0; run < 600; run++) {
      const people = Array.from({ length: 1 + int(6) }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        color: "vista",
        isHost: i === 0,
      }));
      const items =
        run % 2 === 0
          ? fixtureItems
          : Array.from({ length: int(10) }, (_, i) => ({ id: `r${i}`, name: `R${i}`, priceGrosze: int(10000) }));
      const claimProbability = rand();
      const claims: Session["claims"] = {};
      for (const item of items) claims[item.id] = people.filter(() => rand() < claimProbability).map((p) => p.id);
      const s: Session = {
        id: `s${run}`,
        items,
        serviceGrosze: run % 3 === 0 ? 0 : int(5000),
        participants: people,
        claims,
        createdAt: 0,
      };

      for (const p of people) {
        const { items: lines, service } = itemSharesFor(s, p.id);
        expect(lines.reduce((sum, line) => sum + line.grosze, 0) + service).toBe(shareOf(s, p.id));
        for (const line of lines) expect(Number.isInteger(line.grosze) && line.grosze >= 0).toBe(true);
      }
    }
  });
});
