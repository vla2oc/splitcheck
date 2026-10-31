# Фаза 7 — Синхронизация между устройствами (бэкенд)

Ты работаешь по `CLAUDE.md` в корне репозитория. Он важнее этого документа.
Старт — по §6 контракта: `scripts/boot.sh` → `docs/BOOT.md` → пересказ в 5 строках → ждать подтверждения.
Первым делом прочитай `docs/CONTRACT_transport.md` — это вся нужная тебе фаза 5. Исходники фаз 0–5 читай только по ссылкам оттуда.

## Контекст (зачем фаза)

Сейчас сессия живёт в `localStorage` браузера хоста: ссылка/QR на другом телефоне открывает «Nie ma tego paragonu na tym urządzeniu» (проверено человеком 2026-10-31).
Синк уже спрятан за `SessionTransport` (`src/lib/transport/`), реализация выбирается в одном месте — `defaultTransport()` в `src/lib/transport/index.ts`.
Фаза добавляет сетевую реализацию: гость открывает ссылку на своём телефоне → видит чек → его тапы видны хосту и наоборот. Потребитель — демо для жюри на реальных телефонах.

Это осознанный пересмотр `SPEC.md` («только фронт») и `NOT_NOW.md` (строки «LLM и бэкенд», «Синк между реальными телефонами»): человек выбрал вариант «настоящий бэкенд» 2026-10-31. LLM по-прежнему не делаем.

## Решения человека до старта (агент не создаёт аккаунты и не вводит ключи — это делает человек)

Спроси батчем в шаге 1, к каждому — дефолт:

1. **Бэкенд.** Дефолт: **Supabase** (Postgres + Realtime) — назван в `SPEC.md` «Синхронизация без бэкенда», не нужен свой сервер. Альтернатива: свой Node-сервер с WebSocket — нужен хостинг, больше кода.
2. **Проект и ключи.** Человек создаёт проект Supabase, выполняет `supabase/schema.sql` (его пишет агент в шаге 1) в SQL Editor и кладёт URL + публичный (anon/publishable) ключ в `.env.local`. Агент ключи не вводит и не видит в чате — только имена переменных из `.env.example`.
3. **Публичный URL.** Дефолт: **нет**, демо по LAN (`http://<LAN-IP>:3000`, телефоны в одной Wi-Fi — dev уже пускает их, `allowedDevOrigins`). Деплой (Vercel и т. п.) — отдельное решение и аккаунт человека → `NOT_NOW.md`, если не нужен.

## Что делаем

Новая реализация `SessionTransport` на Supabase; выбор в `defaultTransport()`: есть env → Supabase, нет → текущий `localStorage + BroadcastChannel` (режим вкладок остаётся рабочим без интернета и ключей). Плюс защита от потерянных тапов при одновременной записи с разных телефонов (см. «Риски»). UI не меняется, кроме текста загрузки/пустого состояния.
Источник истины: `docs/CONTRACT_transport.md` (интерфейс, «кто я», ограничения), `docs/CONTRACT_split.md` (деньги — гроши).

## Критерий «работает» (формулируем ДО кода)

1. `npm test; echo exit=$?` → `exit=0`; новые тесты (без сети, клиент Supabase — внедряемый фейк): `load` превращает строку таблицы в `Session`; `save` создаёт строку; `update` при конфликте версии перечитывает свежий снимок и повторно применяет изменение (≤ 3 попыток); `subscribe` отбрасывает своё эхо и старые версии; отписка снимает канал; **два «клиента» поверх общего фейкового сервера одновременно ставят 20 разных клеймов — ни один не потерян**.
2. `npx tsc --noEmit; echo exit=$?` → `exit=0`; `npm run build; echo exit=$?` → `exit=0` **и без `.env.local`**.
3. `grep -rln "@supabase" src --exclude-dir=transport; echo exit=$?` → `exit=1`; `git check-ignore -q .env.local; echo exit=$?` → `exit=0`; в репозитории нет ключей: `git grep -nE "eyJ[A-Za-z0-9_-]{20,}|sb_publishable_|sb_secret_"; echo exit=$?` → `exit=1`.
4. Ручная (ноутбук = хост, телефон в той же Wi-Fi): QR/ссылка → на телефоне чек хоста; тап на телефоне виден на ноутбуке ≤ 1 с и наоборот; «Twoja część» обоих в сумме с невзятым = итог чека.
5. Ручная: телефон без `?as=guest` — сразу гость (свой `localStorage`), имя при первом тапе; F5 на обоих устройствах — всё на месте.
6. Ручная: ноутбук и телефон одновременно быстро тапают разные строки (по 5+) → через 2 с экраны одинаковые, все тапы на месте, в консоли нет `[split]`.
7. Ручная: без `.env.local` → режим вкладок как в фазе 5 (её ручные п. 3–6 проходят).

## Стек (не расширять)

- `@supabase/supabase-js` — единственный новый пакет. Версию не угадывать: `npm i @supabase/supabase-js` → что записалось в `package.json` → строка в `DECISIONS.md`.
- `[предположение]` API: `createClient(url, key)`; `from("sessions").select/insert/update().eq(...)`; Realtime — `channel(...).on("postgres_changes", { event, schema, table, filter }, cb).subscribe()` и `removeChannel`. Проверить ДО кода: типы в `node_modules/@supabase/supabase-js/dist/**/*.d.ts` (`grep -rn "postgres_changes\|removeChannel" node_modules/@supabase`) и официальную доку Supabase (Realtime Postgres Changes, RLS). Что не нашёл — спросить, не писать по памяти.
- `[предположение]` Для `postgres_changes` таблица должна быть в публикации `supabase_realtime`, а у anon — политика `select` (Realtime уважает RLS). Проверить по доке, отразить в `schema.sql`.
- Никаких новых пакетов без строки в `docs/DECISIONS.md` и проверки, что версия реально встала.

## Структура (новое и изменяемое)

```
package.json                      # + @supabase/supabase-js
.env.example                      # NEXT_PUBLIC_SUPABASE_URL= / NEXT_PUBLIC_SUPABASE_ANON_KEY= (пустые; .env* в .gitignore, !.env.example разрешён)
supabase/schema.sql               # таблица sessions (id text pk, version int, data jsonb, updated_at), RLS, realtime — выполняет человек
src/lib/transport/types.ts        # + update(sessionId, apply) — см. шаг 2
src/lib/transport/broadcast.ts    # + update: read-modify-write по localStorage
src/lib/transport/supabase.ts     # createSupabaseTransport({ client }) — клиент внедряется
src/lib/transport/supabase.test.ts
src/lib/transport/index.ts        # env есть → supabase, нет → broadcast
src/lib/store.ts                  # действия → transport.update(id, apply); оптимистичный set сразу
src/lib/store.test.ts
src/app/s/[id]/page.tsx           # «Wczytuję paragon…» вместо пустоты при сетевой загрузке; текст «нет такого» без «na tym urządzeniu»
docs/CONTRACT_transport.md        # обновить: update, Supabase, env, ограничения
```

Правила (проверяются grep, критерий 3): `@supabase` импортируется только в `src/lib/transport/`; стор и UI знают только `SessionTransport`; ключей в git нет. Тип `Session` из SPEC не меняется — версия живёт в обёртке/строке таблицы.

## Риски и решения фазы (решить в шаге 1, записать в DECISIONS.md)

- **Потерянные тапы.** Фаза 5 — снимок целиком, last-write-wins; во вкладках одного браузера окно конфликта — миллисекунды. С реальными телефонами окно = сетевая задержка (сотни мс), а гости за столом тапают одновременно → тапы будут теряться. Дефолт: **оптимистичная конкуренция**: `update(sessionId, apply)` читает версию, пишет `version + 1` только если версия не изменилась (`update ... eq("version", v)` или RPC), при конфликте — свежий снимок → снова `apply` → до 3 попыток. Требование: `apply` идемпотентна — тап хранится как «поставить/снять клейм участника X» (желаемое состояние, вычисленное в момент тапа), а не «переключить». Альтернатива — серверная функция Postgres, применяющая операции атомарно; сложнее, решать только если дефолт не прошёл критерий 6.
- **Утечка всех чеков.** Открытая политика `select` для anon позволяет выгрузить все сессии (имена, суммы). Дефолт для хакатона: принять, id сессии — `nanoid(10)`; без `delete`; записать в `NOT_NOW.md` «RPC вместо прямого select, авторизация». Если человек против — RPC `security definer` + Realtime Broadcast вместо `postgres_changes`.
- **Задержка загрузки.** `load` теперь сетевой — сейчас на `/s/[id]` во время загрузки пусто (`return null`). Нужен текст «Wczytuję paragon…» (без hydration mismatch: на сервере то же состояние loading).
- `[предположение]` Бесплатный проект Supabase может «засыпать» после простоя — проверить в доке/дашборде перед демо, записать в STATE.

## Шаги (один за раз: диф → команда проверки → реальный вывод → STATE.md → коммит)

### Шаг 1. Решения, схема, env (без кода приложения)

- Задать человеку 3 вопроса из «Решения человека», зафиксировать ответы и риски в `DECISIONS.md`; правку `NOT_NOW.md` (строки 6–7) и пометку о пересмотре SPEC — тоже строкой в `DECISIONS.md`.
- Прочитать доку Supabase (Realtime Postgres Changes, RLS) → `supabase/schema.sql` + `.env.example`. Человек выполняет SQL и заполняет `.env.local`.
- Проверка: `scripts/check-docs.sh; echo exit=$?` → `exit=0`; человек подтвердил «SQL выполнен, `.env.local` заполнен»; `git check-ignore -q .env.local; echo exit=$?` → `exit=0`.

### Шаг 2. `update` в интерфейсе — пока только вкладки

- `SessionTransport.update(sessionId, apply)`; `broadcast.ts` — read-modify-write по хранилищу; стор: все действия, кроме `createSession`, — оптимистичный `set` + `transport.update(id, apply)`; тап → идемпотентное «поставить/снять».
- Без Supabase: все существующие тесты зелёные + тест «две вкладки одновременно ставят разные клеймы — оба на месте».
- Проверка: `npm test; echo exit=$?` → `exit=0`; ручные п. 3–6 фазы 5 не сломались.

### Шаг 3. `supabase.ts`

- `npm i @supabase/supabase-js` → версия в `DECISIONS.md`. Имена API — из `node_modules` (см. «Стек»), не по памяти.
- `createSupabaseTransport({ client })`: `load`, `save` (insert), `update` (условная запись + повтор), `subscribe` (`postgres_changes` по `id=eq.<id>`, фильтр эха/старых версий как в `broadcast.ts`), отписка → `removeChannel`. Тесты на фейковом клиенте (критерий 1).
- Проверка: `npm test; echo exit=$?`, `npx tsc --noEmit; echo exit=$?`.

### Шаг 4. Включение и проверка на устройствах

- `defaultTransport()`: `process.env.NEXT_PUBLIC_SUPABASE_URL` и ключ есть → Supabase, иначе broadcast. «Wczytuję paragon…» на `/s/[id]`; текст «нет такого» без «na tym urządzeniu».
- Проверка: критерии 2, 3, затем ручные 4–7 (человек; дать ему чек-лист с LAN-адресом из вывода `npm run dev`).

### Шаг 5. Контракт

- Обновить `docs/CONTRACT_transport.md`: `update`, обе реализации, env, `schema.sql`, ограничения (LWW + повтор, открытый select, без деплоя). Сигнатуры — скриптом из исходника, пример — из вывода теста.
- Проверка: `scripts/check-docs.sh; echo exit=$?` → `exit=0`.

## Что НЕ делать

- Логин/авторизацию, удаление и историю сессий, LLM/распознавание на сервере → уже в `NOT_NOW.md`.
- Свой WebSocket-сервер, Edge Functions, CRDT-библиотеки (Yjs и т. п.) — только если человек выбрал альтернативу в шаге 1.
- Деплой — только по решению человека №3.
- Менять тип `Session`, UI сессии (кроме текстов загрузки/пустого состояния), логику денег.
- Хранить ключи где-либо, кроме `.env.local`; писать их в чат, логи, `STATE.md`.

## Отчёт по завершении

В `docs/STATE.md`: критерий «работает» по пунктам с реальным выводом; список оставшихся `[предположение]` (в т. ч. «засыпание» проекта); отклонения от этого документа — в `DECISIONS.md`.
Перед стартом следующей фазы: «Сделано» этой фазы → `docs/log/YYYY-MM.md` (дописать), из STATE убрать — иначе BOOT упрётся в 4096 байт.
Обновлённый `docs/CONTRACT_transport.md` обязателен (шаг 5).

Порядок с фазой 6 (полировка): независимы. Если фаза 6 идёт параллельно — общий файл только `src/app/s/[id]/page.tsx` (тексты загрузки/пустого состояния), договориться через `STATE.md`.
