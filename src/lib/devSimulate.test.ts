import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MAX_DELAY_MS, MIN_DELAY_MS, simulateGuests } from "@/lib/devSimulate";
import { fixtureReceipt } from "@/lib/receipt/fixture";
import { allocated, shareOf, totalOf } from "@/lib/split";
import { useSessionStore } from "@/lib/store";

// Детерминированный PRNG (mulberry32) — без пакета
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const session = () => useSessionStore.getState().session!;
const guests = () => session().participants.filter((p) => !p.isHost);
const claimsOf = (id: string) => Object.values(session().claims).filter((ids) => ids.includes(id)).length;

beforeEach(() => {
  vi.useFakeTimers();
  useSessionStore.setState({ session: null });
  useSessionStore.getState().createSession(fixtureReceipt);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("simulateGuests", () => {
  test("добавляет Ania, Kuba, Ola; первый тап не раньше MIN_DELAY_MS", () => {
    simulateGuests(seeded(1));
    expect(guests().map((p) => p.name)).toEqual(["Ania", "Kuba", "Ola"]);
    vi.advanceTimersByTime(MIN_DELAY_MS - 1);
    expect(Object.keys(session().claims)).toHaveLength(0);
  });

  test("за 3 × MAX_DELAY_MS каждый гость взял 3 позиции, прогресс вырос, инвариант держится", () => {
    simulateGuests(seeded(2));
    vi.advanceTimersByTime(3 * MAX_DELAY_MS);
    for (const guest of guests()) expect(claimsOf(guest.id)).toBe(3);
    expect(allocated(session())).toBeGreaterThan(0);
    const s = session();
    expect(s.participants.reduce((sum, p) => sum + shareOf(s, p.id), 0)).toBe(totalOf(s));
  });

  test("отмена останавливает оставшиеся тапы", () => {
    const cancel = simulateGuests(seeded(3));
    cancel();
    vi.advanceTimersByTime(3 * MAX_DELAY_MS);
    expect(Object.keys(session().claims)).toHaveLength(0);
  });

  test("повторный запуск не плодит гостей", () => {
    simulateGuests(seeded(4));
    vi.advanceTimersByTime(3 * MAX_DELAY_MS);
    simulateGuests(seeded(5));
    expect(guests()).toHaveLength(3);
  });

  test("без сессии — ничего не делает", () => {
    useSessionStore.setState({ session: null });
    expect(() => simulateGuests()()).not.toThrow();
  });
});
