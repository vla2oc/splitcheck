# Контракт фаза 0 (сетап) → фаза 1 и дальше

Передача между агентами с чистым контекстом: следующий агент читает ЭТОТ файл и `BOOT.md`, а не исходники фазы 0.
Блоки кода ниже вырезаны скриптом из исходников 2026-10-31, не написаны руками. Источник истины по продукту — `docs/SPEC.md`.

## 1. Как импортировать
```ts
import { spring, numberSpring } from "@/lib/motion";   // springs
import { motion, MotionConfig } from "motion/react";    // НЕ "framer-motion"
```
Алиас `@/*` → `./src/*` (tsconfig). В vitest он работает через `resolve.tsconfigPaths` — отдельный алиас не нужен.

## 2. Сигнатура (дословно из `src/lib/motion.ts`)
```ts
export const spring = {
  snappy: { type: "spring", stiffness: 500, damping: 32 }, // тапы, тогглы, нажатия
  smooth: { type: "spring", stiffness: 260, damping: 28 }, // bottom sheets, layout
  bouncy: { type: "spring", stiffness: 420, damping: 18 }, // появление аватаров, галочка
} as const;

export const numberSpring = { stiffness: 120, damping: 20 }; // useSpring для сумм
```

## 3. Дизайн-токены (дословно из `src/app/globals.css`, блок `@theme inline`)
Каждый `--color-X` даёт Tailwind-классы `bg-X`, `text-X`, `border-X`; `--font-serif` → `font-serif`.
```css
@theme inline {
  --color-oxford: var(--oxford);
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-border: var(--border);
  --color-vista: var(--vista);
  --color-vista-strong: var(--vista-strong);
  --color-vista-soft: var(--vista-soft);
  --color-on-vista: var(--on-vista);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-danger: var(--danger);
  --color-avatar-1: var(--avatar-1);
  --color-avatar-2: var(--avatar-2);
  --color-avatar-3: var(--avatar-3);
  --color-avatar-4: var(--avatar-4);
  --color-avatar-5: var(--avatar-5);
  --color-avatar-6: var(--avatar-6);
  --font-sans: var(--font-instrument-sans);
  --font-mono: var(--font-geist-mono);
  --font-serif: var(--font-instrument-serif);
}
```
Аватары гостей — `avatar-1..6` по кругу, хост всегда `vista`; инициалы цветом `oxford` (контраст 10.5–13.8:1).

## 4. Шрифты и корневой layout (дословно из `src/app/layout.tsx`)
```tsx
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pl"
      className={`${instrumentSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}
```
- `font-sans` (по умолчанию) — Instrument Sans; `font-mono` — Geist Mono (суммы, всегда с `tabular-nums`); `font-serif` — Instrument Serif, только italic 400, только одно слово на главной.
- У всех шрифтов `subsets: ["latin", "latin-ext"]` — без `latin-ext` польские буквы уходят в фолбэк.
- `MotionConfig` стоит в layout без обёртки: компонент сам помечен `"use client"`.

## 5. Скрипты (дословно из `package.json`)
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run"
}
```
Зависимости из манифеста (`npm ls --depth=0`, без extraneous):
```
├── @tailwindcss/turbopack@4.3.3
├── @types/node@24.19.2
├── @types/react-dom@19.3.0
├── @types/react@19.3.0
├── eslint-config-next@16.4.3
├── eslint@9.39.5
├── lucide-react@1.65.0
├── motion@14.9.0
├── nanoid@6.0.2
├── next@16.4.3
├── qrcode.react@4.2.0
├── react-dom@19.3.0
├── react@19.3.0
├── tailwindcss@4.3.3
├── typescript@5.9.3
├── vitest@5.0.5
└── zustand@5.0.16

```

## 6. Как запустить
- `npm run dev` → `http://localhost:3000` и `Network: http://<LAN-IP>:3000` (телефон в той же сети — без флагов).
- `npm test` — vitest, тесты `src/**/*.test.ts`. Сейчас один временный `src/lib/smoke.test.ts` — удалить в фазе 1, шаг 1.
- Exit-код смотреть у самой команды: `cmd; echo exit=$?`, а не `cmd | tail` (на `npm i -D vitest` это уже скрыло ERESOLVE).

## 7. Чего не делать при работе поверх контракта
- Не писать код по памяти о Next: это 16.4.3 с `cacheComponents: true` и `partialPrefetching: true` (`next.config.ts`). Перед роутами/клиентским кодом — `node_modules/next/dist/docs/` (см. `AGENTS.md`).
- Не возвращать `@types/node` на `^20` — vitest 5 требует `^22 || >=24`.
- Не переименовывать `vitest.config.mts` в `.ts` и не ставить `"type": "module"` — это ломает/меняет загрузку конфигов.
- Не добавлять светлую тему и `prefers-color-scheme` — только тёмная.
- Не анимировать на `ease`/`duration` у интерактивных элементов — только `spring.*`.

## 8. Ограничения MVP, важные потребителю
- `src/app/page.tsx` — заглушка (`// MVP:`), заменяется в фазе 2.
- В `public/` лежат SVG шаблона create-next-app — не используются.
- Ручной критерий 6 фазы 0 (осмотр в браузере) человеком не подтверждён — см. STATE.

## 9. Константы
| Имя | Значение | Где определена |
|---|---|---|
| `spring.snappy` | stiffness 500, damping 32 | `src/lib/motion.ts` |
| `spring.smooth` | stiffness 260, damping 28 | `src/lib/motion.ts` |
| `spring.bouncy` | stiffness 420, damping 18 | `src/lib/motion.ts` |
| `numberSpring` | stiffness 120, damping 20 | `src/lib/motion.ts` |
| фон приложения | `#0e0929` (`--oxford`) | `src/app/globals.css` |
