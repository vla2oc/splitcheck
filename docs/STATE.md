# STATE
<!-- Чекпоинт, не журнал: ≤ 80 строк, ≤ 300 символов в строке, ≤ 6 заголовков «##», перезаписывай. Целиком попадает в BOOT.md. История — в docs/log/YYYY-MM.md. -->

## Цель MVP
SplitCheck: хост фоткает чек → QR; гости тапают свои позиции и видят долг (BLIK). Фронт + наш бэкенд (Bsemenii/reciept): Claude-распознавание и синк. Спека: docs/SPEC.md

## Сделано (текущая фаза, новое сверху)
- 2026-10-31 — Vercel Firewall: «Limit receipt parsing» — /api/parse ≤ 10 запросов/60 с на IP → 429; проверено на prod: 10×200, 11-й 429, сброс через минуту
- 2026-10-31 — Vercel Web Analytics: <Analytics /> в layout.tsx (@vercel/analytics 2.0.1); build ок, страницы остались статичными
- 2026-10-31 — Production: https://splitcheck-snowy.vercel.app (main 31dad74, Ready): главная, Claude 4,4 с, сессия в Supabase через RPC, выгрузка 401
- 2026-10-31 — Supabase закрыт (002_lockdown.sql применён человеком): только RPC, гость — отметки и себя, BLIK/цены — секрет хоста, синк — сигнал Broadcast, чистка 30 дн.; атаки 15/15, хост↔гость ок
- 2026-10-31 — Ветка vercel: /api/parse перенесён из бэкенда в Route Handler (тесты 139, build ок); замер чека: Opus 5,2 с, Sonnet 5.5 3,4 с, Haiku 5.5 2,4 с; fast mode — лимит 0 у орг.
- 2026-10-31 — BottomBar: flex-wrap, сумма не наезжает на кнопку (330–412px, 100,10 zł); <html suppressHydrationWarning> — ошибки нет
- 2026-10-31 — Аудит: тесты 119, tsc/lint/build ок; QR декодирован → LAN-URL, гость синкается; фон .aurora opacity 0.85
- 2026-10-31 — бэкенд подключён: парсер → /api/parse (Claude), синк → /api/sessions (HTTP+SSE), прокси в next.config. Проверено в браузере: скан (мок) → сессия → гость тапает → хост видит; конфликт 409 → повтор
- 2026-10-31 — ф.0–5, ф.7 (кроме крит. 7), чек-принтер; ф.6 пропущена — docs/log/2026-10.md

## Сейчас в работе
Production на Vercel (main → авто-деплой). Откат: Vercel → Instant Rollback; база — supabase/migrations/002_lockdown_down.sql

## Следующий шаг
Человек: проверить production с 2 телефонов на реальном чеке

## Открытые вопросы ко мне
- Коммиты: ф.0–7 одним коммитом и push на GitHub по просьбе человека, без соавторства Claude
- Ручные: ф.0 крит. 6; ф.2 крит. 3, 4; ф.3 крит. 3–5; ф.4 крит. 3–6 — не подтверждены человеком
- Края split.ts (CONTRACT_split §8) — чинить?
- Главная: лишний Tab-стоп у CaptureButton (motion) — чинить?
- Turbopack-кэш отдаёт старый globals.css (build без .aurora, dev без opacity); без .next/cache — ок. Dev: перезапуск без .next/dev/cache
- BLIK-кнопка на ≤340px переносит номер на 2 строку — чинить?
- Prod: редкое исключение motion (readValueFromInstance) — чинить?
- Модель чтения: PARSE_MODEL=claude-sonnet-5-5 (на 35% быстрее, те же названия на синт. чеке) — после eval на реальных фото?
- Fast mode: лимит орг. 0 токенов/мин — просить доступ у Anthropic sales?

## Осталось `[предположение]`
- Чек: reduced motion — проверить в DevTools → Rendering
- 1× вкладка хоста зависла на загрузке, не повторилось
- Stop-хук не проверен (SessionStart работает) — проверить: /hooks
- Время чтения реальных фото (замер только на синтетическом чеке) — проверить на preview
