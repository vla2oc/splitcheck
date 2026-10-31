import { z } from "zod";
import { ParseError, sniffImage, type Parser } from "@/lib/receipt/claude/parser";

// POST /api/parse из бэкенда (Bsemenii/reciept@5f1bcdc, server/src/app.ts) как Request → Response — тестируется без Next

const MAX_IMAGE_BASE64 = 8_000_000; // клиент сжимает до ~300 КБ, это только от случайностей
const PARSE_PER_MINUTE = 20; // на IP и на экземпляр функции; повторы из кэша до Claude не доходят

const ParseBodySchema = z.object({
  image: z.string().optional(),
  media_type: z.string().optional(), // игнорируется: формат определяем по байтам
});

const fail = (status: number, error: string) => Response.json({ error }, { status });

export function rateLimiter(perMinute: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) return false;
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

const defaultLimiter = rateLimiter(PARSE_PER_MINUTE);

// Тело: { image: base64 без префикса "data:" }. ?demo=1 — демо-чек без Claude
export async function handleParse(request: Request, parser: Parser, allow = defaultLimiter): Promise<Response> {
  const body = ParseBodySchema.safeParse(await request.json().catch(() => undefined));
  if (!body.success) return fail(400, "invalid_body");
  const { image } = body.data;
  if (!image) return fail(400, "no_image");
  if (image.length > MAX_IMAGE_BASE64) return fail(413, "image_too_large");

  const demo = new URL(request.url).searchParams.has("demo") || parser.model === "mock";
  const mediaType = sniffImage(image);
  if (!demo && mediaType === "heic") return fail(415, "heic_unsupported");
  if (!demo && !mediaType) return fail(400, "not_an_image");
  // Vercel кладёт IP клиента первым в x-forwarded-for
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(ip)) return fail(429, "busy");

  try {
    const out = await parser.parse(image, mediaType === "heic" || !mediaType ? "image/jpeg" : mediaType, demo);
    console.log(`parse model=${out.model} ms=${out.ms} cached=${out.cached} items=${out.receipt.items.length} diff=${out.checksum_diff}`);
    return Response.json(out);
  } catch (e) {
    if (e instanceof ParseError) return fail(e.status, e.code);
    console.error(e);
    return fail(500, "internal");
  }
}
