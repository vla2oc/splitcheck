import { z } from "zod";

// Из бэкенда (Bsemenii/reciept@5f1bcdc): src/lib/parse.ts, src/lib/types.ts (Item), src/lib/split.ts (checksumDiff)

// Что возвращает модель. Плоско и просто — так structured outputs надёжнее
export const ParsedReceiptSchema = z.object({
  is_receipt: z.boolean(),
  currency: z.string(),
  lines: z.array(
    z.object({
      name: z.string(),
      display_name: z.string(),
      qty: z.number(),
      line_total_cents: z.number(),
    }),
  ),
  service_cents: z.number(),
  tip_cents: z.number(),
  discount_cents: z.number(),
  total_cents: z.number(),
});

export type ParsedLines = z.infer<typeof ParsedReceiptSchema>["lines"];

export type DraftItem = { id: string; name: string; display_name: string; price_cents: number };

// Ответ /api/parse — тот же контракт, что BackendDraft в httpParser.ts
export type Draft = {
  currency: string;
  items: DraftItem[];
  service_cents: number;
  tip_cents: number;
  discount_cents: number;
  total_cents: number;
};

const MAX_UNITS = 12;

// «3 x Piwo 36,00» → три строки по 12,00, чтобы трое взяли по одной. Дробное или большое количество — одной строкой
export function expandLines(lines: ParsedLines): DraftItem[] {
  const items: DraftItem[] = [];
  lines.forEach((line, i) => {
    const cents = Math.round(line.line_total_cents);
    const qty = line.qty;
    const base = { name: line.name, display_name: line.display_name || line.name };
    if (Number.isInteger(qty) && qty > 1 && qty <= MAX_UNITS) {
      const unit = Math.floor(cents / qty);
      let rest = cents - unit * qty;
      for (let u = 1; u <= qty; u++) {
        const extra = rest > 0 ? 1 : 0;
        rest -= extra;
        items.push({ ...base, id: `i${i}.${u}`, price_cents: unit + extra });
      }
    } else {
      items.push({ ...base, id: `i${i}`, price_cents: cents });
    }
  });
  return items;
}

// 0 — позиции + сервис + чаевые − скидка сходятся с итогом на чеке
export function checksumDiff(r: Draft): number {
  const items = r.items.reduce((a, it) => a + it.price_cents, 0);
  return items + r.service_cents + r.tip_cents - r.discount_cents - r.total_cents;
}
