# Фаза 2 — Главная и сканирование

Ты работаешь по `CLAUDE.md` в корне репозитория. Он важнее этого документа.
Старт — по §6 контракта: `scripts/boot.sh` → `docs/BOOT.md` → пересказ в 5 строках → ждать подтверждения.

## Контекст (зачем фаза)

Есть токены, шрифты, springs (фаза 0) и логика денег (фаза 1, `docs/CONTRACT_split.md`).
Фаза добавляет первый пользовательский сценарий хоста: фото → «Czytam paragon…» → сессия создана → переход на `/s/[id]`. Потребитель — фаза 3.

## Что делаем

Главная `/` с кнопками съёмки и галереи, превью фото со scan-анимацией, мок-парсер с фикстурой, минимальный zustand-стор с `createSession`, переход на заглушку `/s/[id]`. Источник истины — `docs/SPEC.md`, разделы «Экраны → 1, 2» и «Данные → Контракт распознавания, Фикстура».

## Критерий «работает» (формулируем ДО кода)

1. `npm test; echo exit=$?` → `exit=0`; новые тесты: фикстура сходится (`totalGrosze === Σ items + service`), «Piwo» — 3 отдельные строки, `mockReceiptParser.parse` резолвится в фикстуру (fake timers), `createSession` даёт сессию с хостом `isHost: true` и пустыми `claims`.
2. `npx tsc --noEmit; echo exit=$?` → `exit=0`; `npm run build; echo exit=$?` → `exit=0`.
3. Ручная (десктоп): `npm run dev` → «Wybierz z galerii» → любое фото → превью со scan-линией и «Czytam paragon…» → через ~2 с URL `/s/<id>`, на странице список позиций фикстуры.
4. Ручная (телефон в той же сети): «Zrób zdjęcie paragonu» открывает камеру; после фото — то же, что в п. 3. `next dev` сам слушает сеть: `Network: http://<LAN-IP>:3000` в выводе `[проверено 2026-10-31, dev-лог]`.

## Стек (не расширять)

- `motion` (springs из `src/lib/motion.ts`), `zustand`, `nanoid`, `lucide-react` (иконка камеры).
- Никаких новых пакетов без строки в `docs/DECISIONS.md` и проверки, что версия реально встала (`npm i` → что записалось в манифест).

## Структура (новое и изменяемое)

```
src/lib/receipt/types.ts       # ParsedReceipt, ReceiptParser — дословно из SPEC
src/lib/receipt/fixture.ts     # польский ресторан, ~10 строк, Serwis 10%
src/lib/receipt/mockParser.ts  # mockReceiptParser: ~1800 мс → фикстура
src/lib/receipt/receipt.test.ts
src/lib/store.ts               # Session-стор: пока только createSession
src/lib/store.test.ts
src/components/CaptureButton.tsx
src/components/ScanPreview.tsx
src/app/page.tsx               # главная + состояние сканирования (не отдельный роут)
src/app/s/[id]/page.tsx        # ЗАГЛУШКА: список позиций из стора; полноценный экран — фаза 3
```

Правило: UI не импортирует `mockParser` напрямую, только через тип `ReceiptParser` (одна точка подстановки). Проверка: `grep -rn "mockParser" src/app src/components; echo exit=$?` → не больше одного файла с импортом.

## Шаги (один за раз: диф → команда проверки → реальный вывод → STATE.md → коммит)

### Шаг 1. Контракт распознавания и фикстура

- `receipt/types.ts`, `fixture.ts`, `mockParser.ts` + тесты.
- Ориентир фикстуры из SPEC: Pizza Margherita 32,00 · Burger klasyczny 38,00 · Frytki 12,00 · Piwo Żywiec 0,5l 14,00 ×3 · Coca-Cola 0,33l 9,00 · Lemoniada 14,00 · Tiramisu 18,00 → позиции 165,00, Serwis 10% 16,50, итог 181,50 zł. Итог должен проверяться тестом, не этой строкой.
- Проверка: `npm test; echo exit=$?`.

### Шаг 2. Стор: `createSession`

- `store.ts`: `createSession(parsed)` → id (`nanoid`), items с id, хост-участник (цвет `--vista`), пишет `localStorage["splitcheck:me:<id>"] = hostId`.
- `[предположение]` zustand-стор работает в vitest без DOM, если `localStorage` вынесен за параметр/обёртку — проверить тестом. jsdom не добавлять без строки в DECISIONS.
- Проверка: `npm test; echo exit=$?`.

### Шаг 3. Главная

- Заголовок «Podziel rachunek *w 10 sekund*» (Instrument Serif italic — одно слово), подзаголовок «Bez rejestracji. Bez aplikacji.», pill-кнопка Vista с камерой (`accept="image/*" capture="environment"`), ссылка «Wybierz z galerii» (без `capture`), мягкий radial glow за кнопкой.
- Вход: `smooth`, stagger 60 мс. Нажатия: `whileTap={{ scale: 0.96 }}` + `snappy`.
- Проверка: `npm run build; echo exit=$?` + ручной осмотр `/`.

### Шаг 4. Сканирование и переход

- `ScanPreview`: фото через `URL.createObjectURL` (освобождать `revokeObjectURL`), светящаяся линия Vista сверху вниз, «Czytam paragon…».
- По результату парсера: `createSession` → `router.push('/s/<id>')`. Заглушка `/s/[id]` показывает позиции, строки появляются stagger 40 мс.
- Перед кодом роута: прочитать в `node_modules/next/dist/docs/` про динамические сегменты и client components при `cacheComponents: true` `[предположение: params может быть Promise]`.
- Проверка: критерии 2–4.

## Что НЕ делать

- Морф карточки фото в список через `layoutId` между роутами — пробовать только если остаётся время; не взлетело → строка в `NOT_NOW.md`.
- Сохранение сессии в localStorage и переживание перезагрузки — это фаза 5 (после F5 на `/s/<id>` пусто — ожидаемо).
- Реальный OCR/LLM, `/api/parse-receipt` → `NOT_NOW.md`.

## Отчёт по завершении

В `docs/STATE.md`: критерий «работает» по пунктам с реальным выводом; список оставшихся `[предположение]`; отклонения от этого документа — в `DECISIONS.md`.
Перед стартом следующей фазы: «Сделано» этой фазы → `docs/log/YYYY-MM.md` (дописать), из STATE убрать — иначе BOOT упрётся в 4096 байт.
