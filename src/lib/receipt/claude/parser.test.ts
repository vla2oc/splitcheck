import { describe, expect, it } from "vitest";
import { handleParse, rateLimiter } from "@/lib/receipt/claude/handler";
import { createParser, sniffImage } from "@/lib/receipt/claude/parser";
import { expandLines } from "@/lib/receipt/claude/schema";

// Перенос тестов бэкенда (Bsemenii/reciept@5f1bcdc: server/test/api.test.ts «parse», «sniffImage»; src/lib/parse.test.ts)

const post = (body: object, query = "") =>
  new Request(`http://localhost/api/parse${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const open = () => rateLimiter(1000);
const mock = createParser({ model: "test", mock: true, mockDelayMs: 0 });
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString("base64");

// Вместо Anthropic API: считает вызовы, запоминает последний запрос и отвечает reply()
function fakeClaude(reply: (n: number) => Response) {
  const calls = { n: 0, init: undefined as RequestInit | undefined };
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    calls.n++;
    calls.init = init;
    return reply(calls.n);
  }) as unknown as typeof globalThis.fetch;
  const parser = createParser({ apiKey: "test", model: "test", mock: false, mockDelayMs: 0, fetch });
  return { calls, parser };
}

const claudeSays = (r: object) =>
  Response.json({
    id: "msg_1", type: "message", role: "assistant", model: "test", stop_reason: "end_turn", stop_sequence: null,
    content: [{ type: "text", text: JSON.stringify(r) }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });

const kawa = (cents: number) => ({
  is_receipt: true, currency: "PLN", service_cents: 0, tip_cents: 0, discount_cents: 0, total_cents: 1200,
  lines: [{ name: "KAWA", display_name: "Kawa", qty: 1, line_total_cents: cents }],
});

describe("parse", () => {
  it("returns the demo receipt in mock mode and it adds up", async () => {
    const body = await (await handleParse(post({ image: "AAAA" }), mock, open())).json();
    expect(body.model).toBe("mock");
    expect(body.checksum_diff).toBe(0);
    expect(body.receipt.items.length).toBeGreaterThan(0);
  });

  it("serves ?demo without calling Claude", async () => {
    const { calls, parser } = fakeClaude(() => claudeSays(kawa(1200)));
    const res = await handleParse(post({ image: "AAAA" }, "?demo=1"), parser, open());
    expect(res.status).toBe(200);
    expect((await res.json()).model).toBe("mock");
    expect(calls.n).toBe(0);
  });

  it("rejects a missing image", async () => {
    expect(await (await handleParse(post({}), mock, open())).json()).toEqual({ error: "no_image" });
  });

  it("rejects non-images and HEIC before calling Claude", async () => {
    const { calls, parser } = fakeClaude(() => claudeSays(kawa(1200)));
    const heic = Buffer.from("\0\0\0\x18ftypheic\0\0\0\0", "latin1").toString("base64");
    const notImage = Buffer.from("hello, not a photo").toString("base64");
    expect((await handleParse(post({ image: heic }), parser, open())).status).toBe(415);
    expect(await (await handleParse(post({ image: notImage }), parser, open())).json()).toEqual({ error: "not_an_image" });
    expect(calls.n).toBe(0);
  });

  it("caches a photo, so a retry doesn't call Claude again", async () => {
    const { calls, parser } = fakeClaude(() => claudeSays(kawa(1200)));
    const first = await (await handleParse(post({ image: jpeg }), parser, open())).json();
    const again = await (await handleParse(post({ image: jpeg }), parser, open())).json();
    expect(first).toMatchObject({ cached: false, checksum_diff: 0 });
    expect(again).toMatchObject({ cached: true, receipt: first.receipt });
    expect(calls.n).toBe(1);
  });

  it("asks for the server-side fallback on refusals", async () => {
    const { calls, parser } = fakeClaude(() => claudeSays(kawa(1200)));
    await handleParse(post({ image: jpeg }), parser, open());
    expect(JSON.parse(String(calls.init?.body)).fallbacks).toBe("default");
    expect(new Headers(calls.init?.headers).get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("asks for fast mode when enabled, and drops to standard speed when its rate limit is hit", async () => {
    const bodies: { speed?: string }[] = [];
    const betas: string[] = [];
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      betas.push(new Headers(init?.headers).get("anthropic-beta") ?? "");
      return bodies.length === 1
        ? Response.json({ type: "error", error: { type: "rate_limit_error", message: "fast mode busy" } }, { status: 429 })
        : claudeSays(kawa(1200));
    }) as unknown as typeof globalThis.fetch;
    const parser = createParser({ apiKey: "test", model: "test", mock: false, fast: true, fetch });
    const res = await handleParse(post({ image: jpeg }), parser, open());
    expect(res.status).toBe(200);
    expect(bodies.map((b) => b.speed)).toEqual(["fast", undefined]);
    expect(betas[0]).toContain("fast-mode-2026-02-01");
    expect(betas[1]).not.toContain("fast-mode-2026-02-01");
  });

  it("takes a second look when the receipt doesn't add up, and keeps the better reading", async () => {
    const replies = [kawa(1800), kawa(1200)];
    const { calls, parser } = fakeClaude((n) => claudeSays(replies[n - 1]));
    const out = await (await handleParse(post({ image: jpeg }), parser, open())).json();
    expect(calls.n).toBe(2);
    expect(out).toMatchObject({ checksum_diff: 0, receipt: { items: [{ price_cents: 1200 }] } });
  });

  it("keeps the first reading when the second look is worse or fails", async () => {
    const worse = [kawa(1300), kawa(2000)];
    const a = fakeClaude((n) => claudeSays(worse[n - 1]));
    expect(await (await handleParse(post({ image: jpeg }), a.parser, open())).json()).toMatchObject({ checksum_diff: 100 });

    const b = fakeClaude((n) =>
      n === 1 ? claudeSays(kawa(1300)) : Response.json({ type: "error", error: { type: "api_error", message: "boom" } }, { status: 500 }),
    );
    const res = await handleParse(post({ image: jpeg }), b.parser, open());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checksum_diff: 100 });
  });

  it("reports an empty credit balance as no_credit, not a generic error", async () => {
    const { parser } = fakeClaude(() =>
      Response.json({ type: "error", error: { type: "billing_error", message: "Your credit balance is too low" } }, { status: 400 }),
    );
    const res = await handleParse(post({ image: jpeg }), parser, open());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "no_credit" });
  });

  it("answers 502 instead of crashing when the API key is missing", async () => {
    const res = await handleParse(post({ image: jpeg }), createParser({ model: "test", mock: false }), open());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "model_error" });
  });

  it("rate-limits by the client IP from x-forwarded-for", async () => {
    const allow = rateLimiter(1);
    const from = (ip: string) => {
      const req = post({ image: "AAAA" });
      req.headers.set("x-forwarded-for", `${ip}, 10.0.0.1`);
      return req;
    };
    expect((await handleParse(from("1.1.1.1"), mock, allow)).status).toBe(200);
    expect((await handleParse(from("1.1.1.1"), mock, allow)).status).toBe(429);
    expect((await handleParse(from("2.2.2.2"), mock, allow)).status).toBe(200);
  });
});

describe("sniffImage", () => {
  const b64 = (bytes: number[] | string) =>
    (typeof bytes === "string" ? Buffer.from(bytes, "latin1") : Buffer.from(bytes)).toString("base64");

  it("detects the real format whatever the file was called", () => {
    expect(sniffImage(b64([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe("image/jpeg");
    expect(sniffImage(b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffImage(b64("RIFF\x10\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(b64("GIF89a"))).toBe("image/gif");
    expect(sniffImage(b64("\0\0\0\x18ftypheic\0\0"))).toBe("heic");
    expect(sniffImage(b64("plain text"))).toBeNull();
  });
});

describe("expandLines", () => {
  it("splits integer quantities into claimable units that sum to the line", () => {
    const items = expandLines([{ name: "PIWO", display_name: "Piwo", qty: 3, line_total_cents: 3700 }]);
    expect(items.map((i) => i.price_cents)).toEqual([1234, 1233, 1233]);
    expect(items.map((i) => i.id)).toEqual(["i0.1", "i0.2", "i0.3"]);
  });

  it("keeps weighted and single lines as one row", () => {
    const items = expandLines([
      { name: "SER", display_name: "Ser", qty: 0.35, line_total_cents: 1397 },
      { name: "PIZZA", display_name: "Pizza", qty: 1, line_total_cents: 3200 },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].price_cents).toBe(1397);
  });
});
