# Фаза 3 — Экран сессии

Ты работаешь по `CLAUDE.md` в корне репозитория. Он важнее этого документа.
Старт — по §6 контракта: `scripts/boot.sh` → `docs/BOOT.md` → пересказ в 5 строках → ждать подтверждения.

## Контекст (зачем фаза)

Есть логика деления (`docs/CONTRACT_split.md`), стор с `createSession` и заглушка `/s/[id]` (фаза 2).
Фаза делает сердце продукта: тапаю строку → она моя → сумма и прогресс живо меняются. Потребитель — фазы 4 и 5.

## Что делаем

Полноценный `/s/[id]` в одной вкладке: шапка с прогрессом, строки с клеймами и аватарами, бейдж «÷N», имя при первом тапе через bottom sheet, нижняя панель «Twoja część» с анимированной суммой. Источник истины — `docs/SPEC.md`, раздел «Экраны → 3» (кроме ShareSheet, BLIK, правки цены и «Kto ile»).

## Критерий «работает» (формулируем ДО кода)

1. `npm test; echo exit=$?` → `exit=0`; новые тесты стора: `toggleClaim` добавляет/снимает участника; `addParticipant` назначает цвет по кругу из 6, хост — vista; `renameParticipant` меняет имя; после серии тапов `Σ shareOf === total`.
2. `npx tsc --noEmit; echo exit=$?` → `exit=0`; `npm run build; echo exit=$?` → `exit=0`.
3. Ручная (одна вкладка, 390px в DevTools): тап строки → фон `--vista-soft`, бордер Vista, галочка (`bouncy`), аватар в стопке; повторный тап снимает. «Twoja część» и «Rozdzielono X / Y zł» меняются анимированно, цифры не прыгают (tabular-nums).
4. Ручная: первый тап гостя без имени → шит «Jak masz na imię?» → Enter → имя сохранено, исходный тап применён. Хост шит не видит.
5. Dev-проверка: при `NODE_ENV !== 'production'` расхождение `Σ shareOf` и `total` пишет `console.error` — в консоли пусто.

## Стек (не расширять)

- `motion` (springs, `useSpring` + `useTransform` для сумм, drag для шита), `zustand`, `lucide-react`.
- Никаких новых пакетов без строки в `docs/DECISIONS.md` и проверки, что версия реально встала (`npm i` → что записалось в манифест).

## Структура (новое и изменяемое)

```
src/lib/store.ts                # + toggleClaim, addParticipant, renameParticipant
src/lib/store.test.ts
src/app/s/[id]/page.tsx         # из заглушки → экран сессии
src/components/ReceiptHeader.tsx
src/components/ItemRow.tsx
src/components/AvatarStack.tsx
src/components/AnimatedAmount.tsx
src/components/BottomBar.tsx
src/components/Sheet.tsx        # общий bottom sheet (переиспользует фаза 4)
src/components/NameSheet.tsx
```

Правило: компоненты не считают деньги сами — только через `src/lib/split.ts` / `money.ts`. Проверка: `grep -rnE "Math\.(floor|round)|toFixed" src/components src/app; echo exit=$?` → `exit=1`.

## Шаги (один за раз: диф → команда проверки → реальный вывод → STATE.md → коммит)

### Шаг 1. Прочитать доку Next (без кода)

- `node_modules/next/dist/docs/`: динамические сегменты (`params`), client components и доступ к `localStorage` при `cacheComponents: true`. Выписать в STATE 2–3 факта с путём к файлу; `[предположение]` из фазы 2 → `[проверено]` или поправка.
- Проверка: факты в STATE со ссылкой на файл доки.

### Шаг 2. Действия стора

- `toggleClaim(itemId, participantId)`, `addParticipant(name)`, `renameParticipant(id, name)` + тесты.
- Кто я: `localStorage["splitcheck:me:<sessionId>"]`.
- Проверка: `npm test; echo exit=$?`.

### Шаг 3. Шапка и строки

- `ReceiptHeader`: место, «Paragon · X zł», прогресс-бар (ширина — spring через `transform: scaleX`, не `width`).
- `ItemRow` + `AvatarStack` + бейдж «÷N» при ≥ 2; тап → `toggleClaim`, `navigator.vibrate?.(10)`, тач-зона ≥ 48px.
- Проверка: `npm run build; echo exit=$?` + ручной п. 3.

### Шаг 4. Сумма и нижняя панель

- `AnimatedAmount` (`numberSpring`, формат через `formatPLN`), `BottomBar` sticky с `env(safe-area-inset-bottom)`; итоговая сумма 36–40px, Geist Mono.
- Кнопка «Udostępnij» у хоста — пока без действия (фаза 4).
- Dev-проверка инварианта (критерий 5).
- Проверка: ручной п. 3 + консоль.

### Шаг 5. Имя при первом тапе

- `Sheet` (`smooth`, перетаскивание вниз закрывает), `NameSheet` (одно поле, «Gotowe», Enter). Отложенный тап применяется после ввода.
- Проверка: критерии 1–5. Гостя в одной вкладке смоделировать, сменив `splitcheck:me:<id>` в DevTools (до фазы 5 иначе никак).

## Что НЕ делать

- ShareSheet, QR, BLIK, правку цены — фаза 4. «Kto ile» — фаза 6. Синхронизацию вкладок — фаза 5.
- Статусы сессии, «zapłaciłem», закрытие счёта → уже в `NOT_NOW.md`.
- Анимации на `ease`/`duration` у интерактивных элементов, анимацию `width`/`height`/`top`.

## Отчёт по завершении

В `docs/STATE.md`: критерий «работает» по пунктам с реальным выводом; список оставшихся `[предположение]`; отклонения от этого документа — в `DECISIONS.md`.
Перед стартом следующей фазы: «Сделано» этой фазы → `docs/log/YYYY-MM.md` (дописать), из STATE убрать — иначе BOOT упрётся в 4096 байт.
