# Фаза 0 — Сетап

Ты работаешь по `CLAUDE.md` в корне репозитория. Он важнее этого документа.
Старт — по §6 контракта: `scripts/boot.sh` → `docs/BOOT.md` → пересказ в 5 строках → ждать подтверждения.

## Контекст (зачем фаза)

Каркас уже есть: Next.js 16.4.3 + React 19.3 + TypeScript strict + Tailwind v4 + ESLint, App Router, `src/`, алиас `@/*` → `./src/*` `[проверено: package.json, tsconfig.json]`.
Фаза добавляет недостающие пакеты, тест-раннер, дизайн-токены, шрифты и `MotionConfig`. Потребитель — все следующие фазы.

## Что делаем

Доводим каркас до «пустая главная на Oxford-фоне с правильными шрифтами». Источник истины — `docs/SPEC.md`, разделы «Стек» и «Дизайн-система».
Внимание: `AGENTS.md` предупреждает, что эта версия Next отличается от привычной; в `next.config.ts` включены `cacheComponents: true` и `partialPrefetching: true` `[проверено]`. Перед правкой `layout.tsx` — прочитать релевантное в `node_modules/next/dist/docs/`.

## Критерий «работает» (формулируем ДО кода)

1. `npx tsc --noEmit; echo exit=$?` → `exit=0`
2. `npm run lint; echo exit=$?` → `exit=0`
3. `npm test; echo exit=$?` → vitest запустился, 1 smoke-тест зелёный, `exit=0`
4. `npm run build; echo exit=$?` → `exit=0`
5. `grep -E '"(motion|zustand|qrcode.react|lucide-react|nanoid|vitest)"' package.json` → 6 строк
6. Ручная (проверяет человек): `npm run dev` → `/` на фоне `#0e0929`, текст Instrument Sans, `<html lang="pl">`, в консоли браузера нет ошибок.

## Стек (не расширять)

- `motion` — анимации (импорт из `motion/react`)
- `zustand` — стор сессии
- `qrcode.react` — QR
- `lucide-react` — иконки
- `nanoid` — id
- `vitest` (dev) — тесты логики
- Никаких новых пакетов без строки в `docs/DECISIONS.md` и проверки, что версия реально встала (`npm i` → что записалось в манифест).

## Структура (новое и изменяемое)

```
package.json                 # + зависимости, + "test": "vitest run"
vitest.config.mts            # resolve.tsconfigPaths: алиас @ берётся из tsconfig
src/app/globals.css          # токены из SPEC, @theme inline, без светлой темы
src/app/layout.tsx           # шрифты, lang="pl", metadata, <MotionConfig reducedMotion="user">
src/app/page.tsx             # пустая главная (заглушка)
src/lib/motion.ts            # spring.snappy/smooth/bouncy, numberSpring — дословно из SPEC
src/lib/smoke.test.ts        # временный, удаляется в фазе 1, шаг 1
```

Правило: `src/lib/**` не импортирует из `src/app/**` и `src/components/**`. Проверка: `grep -rE "from ['\"]@/(app|components)" src/lib; echo exit=$?` → `exit=1` (ничего не найдено).

## Шаги (один за раз: диф → команда проверки → реальный вывод → STATE.md → коммит)

### Шаг 1. Пакеты

- `npm i motion zustand qrcode.react lucide-react nanoid` и `npm i -D vitest`.
- Записать в STATE реальные версии из `package.json`, не из памяти.
- Проверка: критерий 5.

### Шаг 2. Vitest

- `vitest.config.mts` с `resolve.tsconfigPaths: true` (Vite 8, `[проверено: node_modules/vite/dist/node/index.d.ts:2727]`); проверка алиаса — smoke-тест с импортом через `@/`.
- `src/lib/motion.ts` — springs дословно из SPEC (чистые константы; создаём здесь, чтобы smoke-тест проверил алиас).
- Скрипт `"test": "vitest run"`, `src/lib/smoke.test.ts` импортирует `@/lib/motion` и проверяет `spring.snappy.stiffness === 500`.
- Проверка: `npm test; echo exit=$?` → `exit=0`.

### Шаг 3. Токены цветов

- В `globals.css` заменить `:root` на палитру из SPEC (oxford, surface-1/2, border, vista*, on-vista, text, text-muted, danger), убрать блок `prefers-color-scheme`.
- Пробросить в Tailwind через `@theme inline` (`--color-oxford: var(--oxford)` и т.д.), `body` — фон `--oxford`, цвет `--text`.
- Подобрать 6 пастельных цветов аватаров (текст инициалов `--oxford`, контраст ≥ AA) → токены `--avatar-1..6`; выбор — строкой в `DECISIONS.md`.
- Проверка: `npm run build; echo exit=$?` → `exit=0`.

### Шаг 4. Шрифты

- `next/font/google`: Instrument Sans (UI), Geist Mono (суммы), Instrument Serif italic (одно слово на главной). `[предположение]` экспорты называются `Instrument_Sans`, `Instrument_Serif`, `Geist_Mono` — проверить: `grep -oE 'Instrument_(Sans|Serif)|Geist_Mono' node_modules/next/dist/compiled/@next/font/dist/google/index.d.ts | sort -u`.
- CSS-переменные → `--font-sans`, `--font-mono`, `--font-serif` в `@theme inline`. `lang="pl"`, `metadata.title = "SplitCheck"`.
- Проверка: `npx tsc --noEmit; echo exit=$?` → `exit=0`.

### Шаг 5. Motion

- `MotionConfig reducedMotion="user"` прямо в `layout.tsx`: компонент сам помечен `"use client"` `[проверено: framer-motion/dist/es/components/MotionConfig/index.mjs]`, обёртка не нужна.
- `page.tsx` — пустая заглушка (только фон; без шаблона create-next-app).
- Проверка: критерии 1–4 подряд, затем ручной 6.

## Что НЕ делать

- Светлую тему, переключатель темы → уже в `NOT_NOW.md`.
- Экранную вёрстку главной — это фаза 2.
- Тюнинг `next.config.ts` (выключать `cacheComponents` и т.п.) без строки в `DECISIONS.md`.

## Отчёт по завершении

В `docs/STATE.md`: критерий «работает» по пунктам с реальным выводом; список оставшихся `[предположение]`; отклонения от этого документа — в `DECISIONS.md`.
Перед стартом следующей фазы: «Сделано» этой фазы → `docs/log/YYYY-MM.md` (дописать), из STATE убрать — иначе BOOT упрётся в 4096 байт.
