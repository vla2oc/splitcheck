# Контракт фаза 1 (логика денег и деления) → фазы 3 и 4

Передача между агентами с чистым контекстом: следующий агент читает ЭТОТ файл и `BOOT.md`, а не исходники фазы 1.
Блоки кода в §2 и §5 вставлены скриптом из исходников и реального запуска 2026-10-31, не написаны руками. Источник истины по продукту — `docs/SPEC.md`.

## 1. Как импортировать
```ts
import type { Participant, Item, Session } from "@/lib/types";
import { formatAmount, formatPLN, parsePLN } from "@/lib/money";
import { totalOf, shareOf, allocated, itemShares } from "@/lib/split";
```
Чистые функции: без React, стора и `motion` (проверка — `grep -nE "from ['\"](react|zustand|motion)" src/lib/{money,split,types}.ts` → exit=1).

## 2. Сигнатура (дословно из `src/lib/types.ts`, `src/lib/money.ts`, `src/lib/split.ts`)
```ts
// src/lib/types.ts
// Дословно из docs/SPEC.md «Данные → Состояние сессии». Все деньги — целые гроши.
export type Participant = { id: string; name: string; color: string; isHost: boolean };
export type Item = { id: string; name: string; priceGrosze: number };

export type Session = {
  id: string;
  merchant?: string;
  items: Item[];
  serviceGrosze: number;
  participants: Participant[];
  claims: Record<string /* itemId */, string[] /* participantIds */>;
  blikPhone?: string;
  createdAt: number;
};

// src/lib/money.ts
// Округляет вход сам: useSpring (фаза 3) отдаёт дробные гроши, компонентам округлять запрещено.
export function formatPLN(grosze: number): string;
// То же число без «zł» — для «Rozdzielono 160,00 / 214,50 zł», где валюта стоит один раз
export function formatAmount(grosze: number): string;
// Принимает «214,50» / «214.50» / «214», с «zł» и пробелами (в т.ч. NBSP) или без. Иначе null.
export function parsePLN(input: string): number | null;
// src/lib/split.ts
export function totalOf(session: Session): number;
// Доли позиций без сервиса: floor(price / n) каждому, остаток по 1 гр первым по порядку входа. Невзятое → хосту.
export function itemShares(session: Session): Record<string, number>;
export function shareOf(session: Session, participantId: string): number;
// Сколько уже распределено (без «невзятое → хосту»), для прогресс-бара. Всё взято → === totalOf.
export function allocated(session: Session): number;
```

## 3. Что делает (по шагам, как в SPEC «Логика деления» + DECISIONS 2026-10-31)
1. `totalOf` = Σ `items.priceGrosze` + `serviceGrosze`.
2. Для каждой позиции: взявшие = id из `claims[itemId]`, которые есть в `participants`, без повторов, **в порядке `participants`** (порядок входа).
3. Позицию на n человек делим так: `floor(price / n)` каждому, остаток по 1 гр первым по порядку входа. Никто не взял → вся цена хосту (`isHost`).
4. Сервис делим пропорционально долям из шага 3 (с невзятым у хоста): `floor` каждому, остаток по 1 гр — по наибольшему дробному остатку, при равенстве — по порядку входа. Σ долей = 0 → весь сервис хосту.
5. `shareOf` = доля позиций + доля сервиса. `allocated` = Σ взятых позиций + `floor(service × взятое / Σ позиций)`.

## 4. Семантика результата
- Все суммы — целые гроши ≥ 0. Инвариант (тест на 600 случайных комбинациях): Σ `shareOf` по `participants` === `totalOf`.
- `shareOf(s, id)` для id не из `participants` → `0`, без исключения.
- `allocated` — прогресс «сколько разобрали», невзятое у хоста не считается. Всё взято → `allocated === totalOf`.
- `itemShares` — доли без сервиса, `Record<participantId, grosze>` с ключом на каждого участника. Нужен для «за что я плачу», для суммы — `shareOf`.
- `formatPLN` — строка `pl-PL`/PLN с **NBSP** (U+00A0) перед `zł` и между тысячами: `1214,50 zł`, `12 145,00 zł`. Дробный вход округляется.
- `formatAmount` — то же число без валюты: `formatPLN(g) === formatAmount(g) + "\u00a0zł"` (тест). Для «Rozdzielono 160,00 / 214,50 zł».
- `parsePLN` — гроши или `null` (пусто, минус, 3+ знака после запятой, буквы). Исключений нет.

## 5. Реальный вывод (запуск `src/lib/split.ts` и `money.ts` через node; сценарий = тест «часть сервиса за невзятое — хосту» из `src/lib/split.test.ts`)
Вход: pizza 3200, burger 3800, piwo 1400, сервис 840; участники h (хост), a, b; `claims: { burger: ["a"] }`.
```json
{
  "totalOf": 9240,
  "allocated": 4180,
  "itemShares": {
    "h": 4600,
    "a": 3800,
    "b": 0
  },
  "shareOf": {
    "h": 5060,
    "a": 4180,
    "b": 0
  },
  "formatPLN_shareOf_h": "50,60 zł",
  "parsePLN": {
    "214,50 zł": 21450,
    "abc": null
  }
}
```

## 6. Как запустить
- `npm test` — vitest, 24 теста в `src/lib/money.test.ts` и `src/lib/split.test.ts`. Подробно: `npx vitest run --reporter=verbose`.
- Exit-код смотреть у самой команды: `npm test; echo exit=$?`.

## 7. Чего не делать при работе поверх контракта
- Не округлять суммы в компонентах и не передавать в `formatPLN` злотые — только гроши; округление уже внутри.
- Не сравнивать строки `formatPLN` с обычным пробелом — там NBSP; в тестах `.replace(/ /g, " ")`.
- Не считать долю в UI вручную (цена / n) — гроши разойдутся с инвариантом; только `shareOf`.
- Не менять порядок `session.participants` (сортировка для отображения — копией): от него зависит, кому достаются лишние гроши.
- Не класть float в `priceGrosze` / `serviceGrosze` — `parsePLN` уже отдаёт целые.

## 8. Ограничения MVP, важные потребителю
- `shareOf` пересчитывает всё на каждый вызов (O(участники × позиции)). Для MVP хватает; мемоизация/селекторы — фаза 3.
- Нет хоста в `participants` → невзятое никому не начисляется (Σ долей < total). Хост создаётся вместе с сессией.
- Все позиции по 0 гр + сервис > 0 + всё взято → `allocated = 0 ≠ total`. Без сценария не чиним.
- Количество («3×») не обрабатывается — позиции уже развёрнуты парсером. Только PLN.

## 9. Константы
| Имя | Значение | Где определена |
|---|---|---|
| локаль/валюта | `pl-PL`, `PLN` | `src/lib/money.ts` (`plnFormat`) |
| seed инварианта | `42`, 600 прогонов | `src/lib/split.test.ts` |
