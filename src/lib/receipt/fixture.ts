import type { ParsedReceipt } from "@/lib/receipt/types";

// MVP: hardcoded, see NOT_NOW.md — вместо распознавания. Позиции 165,00 + Serwis 10% 16,50 = 181,50 zł
export const fixtureReceipt: ParsedReceipt = {
  merchant: "Bistro Mokotów",
  currency: "PLN",
  items: [
    { name: "Pizza Margherita", priceGrosze: 3200 },
    { name: "Burger klasyczny", priceGrosze: 3800 },
    { name: "Frytki", priceGrosze: 1200 },
    { name: "Piwo Żywiec 0,5l", priceGrosze: 1400 },
    { name: "Piwo Żywiec 0,5l", priceGrosze: 1400 },
    { name: "Piwo Żywiec 0,5l", priceGrosze: 1400 },
    { name: "Coca-Cola 0,33l", priceGrosze: 900 },
    { name: "Lemoniada", priceGrosze: 1400 },
    { name: "Tiramisu", priceGrosze: 1800 },
  ],
  serviceGrosze: 1650,
  totalGrosze: 18150,
};
