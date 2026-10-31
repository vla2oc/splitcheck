import { afterEach, describe, expect, test, vi } from "vitest";
import { fixtureReceipt } from "@/lib/receipt/fixture";
import { MOCK_PARSE_DELAY_MS, mockReceiptParser } from "@/lib/receipt/mockParser";

describe("fixtureReceipt", () => {
  test("totalGrosze === Σ items + service", () => {
    const itemsSum = fixtureReceipt.items.reduce((sum, item) => sum + item.priceGrosze, 0);
    expect(fixtureReceipt.totalGrosze).toBe(itemsSum + fixtureReceipt.serviceGrosze);
  });

  test("Piwo — 3 отдельные строки, количество развёрнуто", () => {
    expect(fixtureReceipt.items.filter((item) => item.name.startsWith("Piwo"))).toHaveLength(3);
  });

  test("все суммы — целые гроши", () => {
    const amounts = [...fixtureReceipt.items.map((item) => item.priceGrosze), fixtureReceipt.serviceGrosze];
    expect(amounts.every(Number.isInteger)).toBe(true);
  });
});

describe("mockReceiptParser", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("резолвится в фикстуру через MOCK_PARSE_DELAY_MS, не раньше", async () => {
    vi.useFakeTimers();
    let result: unknown;
    void mockReceiptParser.parse(new File([], "paragon.jpg")).then((r) => (result = r));

    await vi.advanceTimersByTimeAsync(MOCK_PARSE_DELAY_MS - 1);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual(fixtureReceipt);
  });
});
