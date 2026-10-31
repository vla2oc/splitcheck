import { fixtureReceipt } from "@/lib/receipt/fixture";
import type { ReceiptParser } from "@/lib/receipt/types";

export const MOCK_PARSE_DELAY_MS = 1800;

// MVP: hardcoded, see NOT_NOW.md — фото не читается, через ~1,8 с всегда фикстура
export const mockReceiptParser: ReceiptParser = {
  parse() {
    return new Promise((resolve) => setTimeout(() => resolve(fixtureReceipt), MOCK_PARSE_DELAY_MS));
  },
};
