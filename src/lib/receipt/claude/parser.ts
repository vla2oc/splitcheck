import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import demoReceipt from "@/lib/receipt/claude/demo-receipt.json";
import { PARSE_PROMPT, recheckPrompt } from "@/lib/receipt/claude/prompt";
import { checksumDiff, expandLines, ParsedReceiptSchema, type Draft } from "@/lib/receipt/claude/schema";

// Перенос server/src/parser.ts из бэкенда (Bsemenii/reciept@5f1bcdc) в serverless-функцию Vercel.
// Отличия: кэш фото — в памяти экземпляра, а не в SQLite (MVP, см. NOT_NOW.md); server-side fallback на отказ модели

export type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export type ParseResult = { receipt: Draft; checksum_diff: number };
export type ParseOutcome = ParseResult & { model: string; ms: number; cached: boolean };

export class ParseError extends Error {
  constructor(
    public code: "not_a_receipt" | "unreadable" | "busy" | "no_credit" | "model_error" | "timeout",
    public status: 422 | 429 | 502 | 504,
  ) {
    super(code);
  }
}

const DEMO = demoReceipt as Draft;

// Часть ключа кэша: правка промпта или схемы перечитывает уже закэшированные фото
const PROMPT_VERSION = createHash("sha256")
  .update(PARSE_PROMPT)
  .update(String(recheckPrompt))
  .update(JSON.stringify(ParsedReceiptSchema.toJSONSchema()))
  .digest("hex")
  .slice(0, 12);

// Не больше стольких вызовов Claude одновременно на экземпляр; лишние ждут очереди
const MAX_CONCURRENT = 2;
// Повтор того же фото (двойной тап, повтор после обрыва) живёт, пока экземпляр функции тёплый
const CACHE_SIZE = 50;

function semaphore(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

// Настоящий формат по первым байтам: «.jpg», который на деле PNG, уходит в Claude с верным типом.
// "heic" распознаём только ради понятной ошибки — Claude его не читает
export function sniffImage(base64: string): MediaType | "heic" | null {
  const head = Buffer.from(base64.slice(0, 24), "base64");
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (head.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  if (head.toString("latin1", 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(head.toString("latin1", 8, 12))) return "heic";
  return null;
}

function withChecksum(receipt: Draft): ParseResult {
  return { receipt, checksum_diff: checksumDiff(receipt) };
}

export function createParser(opts: {
  apiKey?: string;
  model: string;
  mock: boolean;
  fast?: boolean; // fast mode (research preview): та же модель, вывод до 2,5× быстрее, цена ×2
  mockDelayMs?: number;
  fetch?: typeof fetch; // тесты подменяют Anthropic API
}) {
  const { model, mock, fast = false, mockDelayMs = 1500 } = opts;
  const client = mock || !opts.apiKey ? null : new Anthropic({ apiKey: opts.apiKey, timeout: 45_000, maxRetries: 1, fetch: opts.fetch });
  const cacheKey = `${model}:${PROMPT_VERSION}`;
  const cache = new Map<string, ParseResult>();
  const limit = semaphore(MAX_CONCURRENT);

  function request(messages: Anthropic.Beta.BetaMessageParam[], speed: "fast" | "standard") {
    return client!.beta.messages.parse(
      {
        model,
        max_tokens: 16000,
        output_config: { effort: "low", format: betaZodOutputFormat(ParsedReceiptSchema) },
        // Отказ модели → API сам повторяет запрос на запасной модели по категории отказа
        betas: speed === "fast" ? ["server-side-fallback-2026-07-01", "fast-mode-2026-02-01"] : ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        ...(speed === "fast" ? { speed: "fast" as const } : {}),
        messages,
      },
      // У fast mode свой лимит: на 429 не ждём ретрая, а сразу идём обычной скоростью
      speed === "fast" ? { maxRetries: 0 } : undefined,
    );
  }

  async function ask(messages: Anthropic.Beta.BetaMessageParam[]) {
    let response;
    try {
      response = await request(messages, fast ? "fast" : "standard");
    } catch (error) {
      if (!fast || !(error instanceof Anthropic.RateLimitError)) throw error;
      console.log("parse fast mode rate-limited, falling back to standard speed");
      response = await request(messages, "standard");
    }
    const parsed = response.parsed_output;
    if (response.stop_reason === "refusal" || !parsed) throw new ParseError("unreadable", 422);
    if (!parsed.is_receipt) throw new ParseError("not_a_receipt", 422);
    const result = withChecksum({
      currency: parsed.currency || "PLN",
      items: expandLines(parsed.lines),
      service_cents: Math.round(parsed.service_cents),
      tip_cents: Math.round(parsed.tip_cents),
      discount_cents: Math.round(parsed.discount_cents),
      total_cents: Math.round(parsed.total_cents),
    });
    // Только текст: в разобранных блоках есть лишнее поле parsed_output, которое API назад не принимает
    const reply = response.content.flatMap((b) => (b.type === "text" ? [{ type: "text" as const, text: b.text }] : []));
    return { result, reply };
  }

  async function callClaude(image: string, mediaType: MediaType): Promise<ParseResult> {
    if (!client) {
      console.error("parse failed: ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables, or set MOCK_PARSE=1.");
      throw new ParseError("model_error", 502);
    }
    try {
      const question: Anthropic.Beta.BetaMessageParam = {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: PARSE_PROMPT },
        ],
      };
      const first = await ask([question]);
      if (first.result.checksum_diff === 0) return first.result;

      // Не сходится: один повторный взгляд с цифрами, чтобы плательщику не править цены руками.
      // Берём чтение ближе к итогу на чеке; упал второй взгляд — остаётся первое
      const r = first.result.receipt;
      const recheck = recheckPrompt({ ...r, lines_cents: r.items.reduce((a, it) => a + it.price_cents, 0) });
      try {
        const second = await ask([question, { role: "assistant", content: first.reply }, { role: "user", content: recheck }]);
        console.log(`parse recheck diff ${first.result.checksum_diff} -> ${second.result.checksum_diff}`);
        return Math.abs(second.result.checksum_diff) < Math.abs(first.result.checksum_diff) ? second.result : first.result;
      } catch (error) {
        console.error("parse recheck failed, keeping the first reading", error instanceof Error ? error.message : error);
        return first.result;
      }
    } catch (error) {
      if (error instanceof ParseError) throw error;
      if (error instanceof Anthropic.RateLimitError) throw new ParseError("busy", 429);
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new ParseError("timeout", 504);
      if (error instanceof Anthropic.APIError && error.type === "billing_error") {
        // Пустой баланс для пользователя выглядит как случайный сбой — тому, кто смотрит логи, говорим прямо
        console.error("parse failed: Anthropic credit balance is empty. Top up in the Console or set MOCK_PARSE=1.");
        throw new ParseError("no_credit", 502);
      }
      if (error instanceof Anthropic.APIError) {
        console.error("parse failed", error.status, error.message);
        throw new ParseError("model_error", 502);
      }
      throw error;
    }
  }

  return {
    model: mock ? "mock" : model,

    async parse(image: string, mediaType: MediaType, forceMock = false): Promise<ParseOutcome> {
      const t0 = Date.now();
      if (mock || forceMock) {
        // Пауза даёт сыграть анимации скана, как при настоящем вызове
        await new Promise((r) => setTimeout(r, mockDelayMs));
        return { ...withChecksum(structuredClone(DEMO)), model: "mock", ms: Date.now() - t0, cached: false };
      }

      const sha = `${cacheKey}:${createHash("sha256").update(image).digest("hex")}`;
      const hit = cache.get(sha);
      if (hit) return { ...hit, model, ms: Date.now() - t0, cached: true };

      const result = await limit(() => callClaude(image, mediaType));
      cache.set(sha, result);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
      return { ...result, model, ms: Date.now() - t0, cached: false };
    },
  };
}

export type Parser = ReturnType<typeof createParser>;
