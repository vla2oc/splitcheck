import { handleParse } from "@/lib/receipt/claude/handler";
import { createParser, type Parser } from "@/lib/receipt/claude/parser";

// Чтение чека с повторным взглядом — до 2 вызовов Claude по 45 с; дефолтного лимита функции не хватает
export const maxDuration = 120;

let parser: Parser | null = null;

// Лениво: env читается при первом запросе, а не при сборке
function getParser(): Parser {
  parser ??= createParser({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.PARSE_MODEL || "claude-opus-5-5",
    mock: process.env.MOCK_PARSE === "1",
    // Только явно: на аккаунте лимит fast mode = 0 токенов/мин, иначе каждый запрос сперва ловит 429 (DECISIONS 2026-10-31)
    fast: process.env.PARSE_SPEED === "fast",
  });
  return parser;
}

export async function POST(request: Request) {
  return handleParse(request, getParser());
}
