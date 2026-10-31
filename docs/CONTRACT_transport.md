# Контракт фаза 5 (синхронизация) → замена на Supabase Realtime

Передача между агентами с чистым контекстом: следующий агент читает ЭТОТ файл и `BOOT.md`, а не исходники фазы 5.
Блоки кода в §2 и §5 вставлены скриптом из исходников и реального запуска 2026-10-31, не написаны руками. Источник истины — `docs/SPEC.md` «Синхронизация без бэкенда».

## 1. Как импортировать
```ts
import type { SessionTransport } from "@/lib/transport/types";   // интерфейс — всё, что знают стор и UI
import { defaultTransport } from "@/lib/transport";               // ЕДИНСТВЕННАЯ точка выбора реализации
import { loadSession, subscribeSession, setTransport } from "@/lib/store"; // что зовёт UI / тесты
```
Правило: вне `src/lib/transport/` нет `BroadcastChannel` и импорта `transport/broadcast` — `grep -rln "BroadcastChannel" src --exclude-dir=transport` → exit=1.

## 2. Сигнатура (дословно из исходников)
```ts
// src/lib/transport/types.ts
// Единственное, что стор и UI знают о синхронизации — docs/SPEC.md «Синхронизация без бэкенда».
// Сейчас: localStorage + BroadcastChannel (broadcast.ts). Позже: Supabase Realtime за тем же интерфейсом.
export interface SessionTransport {
  // Последний сохранённый снимок или null. Promise — под будущий сетевой бэкенд
  load(sessionId: string): Promise<Session | null>;
  // Снимок целиком, last-write-wins; без ожидания доставки
  save(session: Session): void;
  // Снимки этой сессии из других вкладок/клиентов, новее уже виденных. Возвращает отписку
  subscribe(sessionId: string, onSession: (session: Session) => void): () => void;
}
// src/lib/transport/index.ts
// Точка подмены реализации: сейчас вкладки одного браузера, позже Supabase Realtime — стор и UI не меняются.
// На сервере (SSR) транспорта нет
export function defaultTransport(): SessionTransport | null;
// src/lib/transport/broadcast.ts
// Ключи и каналы — только здесь (правило фазы 4/5) — docs/SPEC.md «Синхронизация без бэкенда»
export const sessionKey = (sessionId: string) => `splitcheck:session:${sessionId}`;
export const channelName = (sessionId: string) => `splitcheck:${sessionId}`;
// Версия — для last-write-wins; тип Session из SPEC не трогаем
export type Envelope = { version: number; session: Session };
// Минимум от браузерных API — в тестах подставляются in-memory
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;
export type Channel = {
  postMessage(message: Envelope): void;
  listen(onMessage: (message: Envelope) => void): void;
  close(): void;
};
export function createBroadcastTransport({ storage, openChannel }: Deps): SessionTransport;
// Лениво: на сервере (SSR) нет ни localStorage, ни BroadcastChannel
export function getBrowserTransport(): SessionTransport;
// не экспортируется, src/lib/transport/broadcast.ts:18
type Deps = { storage: KeyValueStorage; openChannel: (name: string) => Channel };

// src/lib/store.ts (транспорт и «кто я»)
// «Кто я на этом устройстве» — docs/SPEC.md «Состояние сессии»
export const meKey = (sessionId: string) => `splitcheck:me:${sessionId}`;
// Сначала вкладка, потом устройство: localStorage общий для вкладок (DECISIONS 2026-10-31 «Кто я»)
export function readMe(sessionId: string): string | null;
// Гостевая вкладка (?as=guest) пишет только себе, иначе — и вкладке, и устройству
export function writeMe(sessionId: string, participantId: string);
// ?as=guest: вкладка перестаёт наследовать «кто я» из localStorage. Уже выбранного гостя не трогает (F5)
export function markGuestTab(sessionId: string);
export function setTransport(next: SessionTransport | null);
// Вход на /s/<id>: снимок из транспорта в стор. false — такой сессии нет
export async function loadSession(sessionId: string): Promise<boolean>;
// Снимки этой сессии из других вкладок → стор. Возвращает отписку
export function subscribeSession(sessionId: string): () => void;
```

## 3. Что делает (по шагам)
1. Любое действие стора (`createSession`, `toggleClaim`, `addParticipant`, `renameParticipant`, `updateItemPrice`, `setBlikPhone`) → `set` в zustand → `transport.save(session)` снимком целиком.
2. `save`: `version = max(виденная, сохранённая) + 1` → `localStorage["splitcheck:session:<id>"] = { version, session }` → `postMessage` в канал `splitcheck:<id>`.
3. `/s/[id]` при входе: `loadSession(id)` (→ `transport.load` → `applySnapshot`) и `subscribeSession(id)` до ухода со страницы.
4. Входящий снимок с `version ≤ виденной` отбрасывается (своё эхо, опоздавшие), иначе → `applySnapshot` (без повторного `save`).
5. «Кто я»: `readMe` = `sessionStorage ?? localStorage`. Хост пишет в оба. `?as=guest` → `markGuestTab` ставит `""` во вкладке; гость после имени пишет только во вкладку.

## 4. Семантика результата
- `load` → `Session | null`; `null` — нет сессии, битый JSON или нет хранилища. Исключений нет.
- `save` ничего не возвращает и не ждёт доставки; нет хранилища — снимок всё равно уходит в канал.
- `subscribe` вызывает колбэк только для снимков других клиентов, новее виденных; отписка закрывает канал.
- `loadSession` → `true`, если сессия есть в транспорте или уже в сторе; `false` → UI показывает «Nie ma tego paragonu…».
- `defaultTransport()` → `null` на сервере (SSR): стор тогда не сохраняет и не грузит.
- Единицы: деньги — гроши (см. `CONTRACT_split.md`); сеть — никакой, только вкладки одного браузера.

## 5. Реальный вывод (скрипт: две «вкладки» = два `createBroadcastTransport` с общим хранилищем и настоящим `BroadcastChannel` Node 24; хост делает 2 × `save`)
```json
{
  "storage": {
    "splitcheck:session:N84X6h-8L_": {
      "version": 2,
      "session": {
        "id": "N84X6h-8L_",
        "items": [
          {
            "id": "i1",
            "name": "Pizza Margherita",
            "priceGrosze": 3200
          }
        ],
        "serviceGrosze": 320,
        "participants": [
          {
            "id": "h",
            "name": "Host",
            "color": "vista",
            "isHost": true
          }
        ],
        "claims": {
          "i1": [
            "h"
          ]
        },
        "createdAt": 0
      }
    }
  },
  "received": [
    {
      "tab": "guest",
      "claims": {}
    },
    {
      "tab": "guest",
      "claims": {
        "i1": [
          "h"
        ]
      }
    }
  ],
  "loadInGuest": {
    "i1": [
      "h"
    ]
  }
}
```
Видно: гость получил оба снимка; эха у хоста нет (отфильтровано по `version`); в хранилище `version: 2`. Тесты: `src/lib/transport/broadcast.test.ts` (9), `src/lib/store.test.ts` «стор ↔ транспорт», «кто я».

## 6. Как запустить
- `npm test` — транспорт на in-memory хранилище и шине, без jsdom.
- Руками: `npm run dev` → вкладка хоста `/s/<id>` + вкладки `/s/<id>?as=guest`; `/s/<id>?dev=1` → «Symuluj gości» (`src/lib/devSimulate.ts`).
- Замена на Supabase: новая реализация `SessionTransport` → вернуть её из `defaultTransport()` в `src/lib/transport/index.ts`. Стор и UI не меняются.

## 7. Чего не делать при работе поверх контракта
- Не звать `BroadcastChannel`/`localStorage` сессии из UI или стора — только через `SessionTransport`.
- Не сохранять снимок из `subscribe` обратно (`applySnapshot`, а не действия стора) — иначе пинг-понг версий между вкладками.
- Не убирать фильтр `version ≤ seen` — по нему отсекается своё эхо (подтверждено на `BroadcastChannel` Node: другой объект канала в той же вкладке получает сообщение).
- Не писать `writeMe` в `localStorage` из гостевой вкладки — `localStorage` общий, вкладка хоста станет гостем.
- Не менять тип `Session` ради версии — версия живёт в `Envelope` транспорта.

## 8. Ограничения MVP, важные потребителю
- Только вкладки одного браузера на одной машине; разные телефоны не синхронизируются.
- Last-write-wins снимком целиком: тапы в разных вкладках в одну миллисекунду теряют один. Операции/CRDT — `NOT_NOW.md`.
- Обычная вторая вкладка = хост (общий `localStorage`); гость — только `?as=guest`.
- Канал отправки на сессию не закрывается до закрытия вкладки; сессии не удаляются (автоудаление — `NOT_NOW.md`).

## 9. Константы
| Имя | Значение | Где определена |
|---|---|---|
| ключ сессии | `splitcheck:session:<id>` | `src/lib/transport/broadcast.ts` (`sessionKey`) |
| канал | `splitcheck:<id>` | `src/lib/transport/broadcast.ts` (`channelName`) |
| «кто я» | `splitcheck:me:<id>` (sessionStorage, затем localStorage) | `src/lib/store.ts` (`meKey`) |
| пометка гостевой вкладки | `""` | `src/lib/store.ts` (`GUEST_MARK`) |
| симуляция | 3 гостя × 3 тапа, 400–900 мс | `src/lib/devSimulate.ts` |
