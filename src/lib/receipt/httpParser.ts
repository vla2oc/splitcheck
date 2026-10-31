import { compressImage } from "@/lib/receipt/image";
import type { ParsedReceipt, ReceiptParser } from "@/lib/receipt/types";

// Ответ POST /api/parse (src/app/api/parse, перенос бэкенда Bsemenii/reciept: Draft в receipt/claude/schema.ts). Деньги — целые гроши
export type BackendDraft = {
  currency: string;
  items: { id: string; name: string; display_name: string; price_cents: number }[];
  service_cents: number;
  tip_cents: number;
  discount_cents: number;
  total_cents: number;
};

// total гроши по весам: части в сумме ровно total, остаток — наибольшим дробным остаткам, при равенстве — раньше
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

// В Session только serviceGrosze ≥ 0: сервис и чаевые → serviceGrosze; скидка сверх них уменьшает позиции
// пропорционально цене. Σ позиций + serviceGrosze = позиции + сервис + чаевые − скидка бэкенда, до гроша
export function toParsedReceipt(draft: BackendDraft): ParsedReceipt {
  const extras = draft.service_cents + draft.tip_cents - draft.discount_cents;
  const prices = draft.items.map((item) => item.price_cents);
  const cut = extras < 0 ? allocate(Math.min(-extras, prices.reduce((a, b) => a + b, 0)), prices) : prices.map(() => 0);
  return {
    // MVP: hardcoded, see NOT_NOW.md — тип ParsedReceipt допускает только PLN
    currency: "PLN",
    items: draft.items.map((item, i) => ({ name: item.display_name || item.name, priceGrosze: item.price_cents - cut[i] })),
    serviceGrosze: Math.max(0, extras),
    totalGrosze: draft.total_cents,
  };
}

// ?demo в адресе → бэкенд отдаёт демо-чек без Claude (запасной вариант на сцене: плохой Wi-Fi или фото)
export const httpReceiptParser: ReceiptParser = {
  async parse(file) {
    const image = await compressImage(file);
    const demo = new URLSearchParams(window.location.search).has("demo") ? "?demo=1" : "";
    const res = await fetch(`/api/parse${demo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const body = (await res.json().catch(() => ({}))) as { receipt?: BackendDraft; error?: string };
    // Нет кода ошибки — прокси не достучался до бэкенда
    if (!res.ok || !body.receipt) throw new Error(body.error ?? "network");
    return toParsedReceipt(body.receipt);
  },
};
