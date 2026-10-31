import { describe, expect, it } from "vitest";
import { toParsedReceipt, type BackendDraft } from "@/lib/receipt/httpParser";

const draft = (over: Partial<BackendDraft>): BackendDraft => ({
  currency: "PLN",
  items: [
    { id: "i0", name: "FLAT WHITE", display_name: "Flat white", price_cents: 1500 },
    { id: "i1", name: "SERNIK", display_name: "Sernik", price_cents: 1900 },
    { id: "i2", name: "CROISSANT", display_name: "Croissant", price_cents: 950 },
  ],
  service_cents: 0,
  tip_cents: 0,
  discount_cents: 0,
  total_cents: 4350,
  ...over,
});

const sum = (r: ReturnType<typeof toParsedReceipt>) => r.items.reduce((a, i) => a + i.priceGrosze, 0) + r.serviceGrosze;

describe("toParsedReceipt", () => {
  it("берёт чистое имя, сервис и чаевые — в serviceGrosze", () => {
    const r = toParsedReceipt(draft({ service_cents: 400, tip_cents: 300, total_cents: 5050 }));
    expect(r.items.map((i) => i.name)).toEqual(["Flat white", "Sernik", "Croissant"]);
    expect(r.serviceGrosze).toBe(700);
    expect(sum(r)).toBe(5050);
  });

  it("скидка больше сервиса уменьшает позиции пропорционально, сумма — до гроша", () => {
    const r = toParsedReceipt(draft({ tip_cents: 700, discount_cents: 1540, total_cents: 3510 }));
    expect(r.serviceGrosze).toBe(0);
    expect(sum(r)).toBe(3510);
    expect(r.items.every((i) => i.priceGrosze >= 0)).toBe(true);
    expect(r.items[1].priceGrosze).toBeLessThan(1900);
  });
});
