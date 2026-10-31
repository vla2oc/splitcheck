# Фаза 4 — Шеринг, BLIK, правка цены

Ты работаешь по `CLAUDE.md` в корне репозитория. Он важнее этого документа.
Старт — по §6 контракта: `scripts/boot.sh` → `docs/BOOT.md` → пересказ в 5 строках → ждать подтверждения.

## Контекст (зачем фаза)

Экран сессии работает в одной вкладке (фаза 3), есть общий `Sheet`.
Фаза закрывает второй тап хоста («Udostępnij») и путь денег гостя (BLIK). Потребитель — пользователь и фаза 5 (ссылка из QR открывается во второй вкладке).

## Что делаем

ShareSheet хоста: QR со ссылкой, «Kopiuj link», «Udostępnij…», поле BLIK. Кнопка «Skopiuj numer BLIK» у гостя и тост. Инлайн-правка цены хостом. Источник истины — `docs/SPEC.md`, раздел «Экраны → 3» (шит «Udostępnij», нижняя панель, карандаш у строки).

## Критерий «работает» (формулируем ДО кода)

1. `npm test; echo exit=$?` → `exit=0`; новые тесты: `updateItemPrice` меняет цену и инвариант суммы держится; `setBlikPhone` сохраняет номер; `parsePLN` на вводе из поля цены.
2. `npx tsc --noEmit; echo exit=$?` → `exit=0`; `npm run build; echo exit=$?` → `exit=0`.
3. Ручная: QR, открытый с `http://<LAN-IP>:3000`, сканируется камерой телефона и ведёт на `http://<LAN-IP>:3000/s/<id>` (сессии там не будет до бэкенда — проверяем только URL).
4. Ручная: «Kopiuj link» кладёт тот же URL в буфер; «Udostępnij…» открывает системный шит, где есть `navigator.share`, иначе копирует.
5. Ручная: номер BLIK пережил создание новой сессии (localStorage); гость (через смену `splitcheck:me:<id>` в DevTools) видит «Skopiuj numer BLIK · 600 123 456», тап → тост «Skopiowano».
6. Ручная: хост правит цену карандашом → сумма, прогресс и итог шапки обновились анимированно.

## Стек (не расширять)

- `qrcode.react` — QR. `[предположение]` компонент экспортируется как `QRCodeSVG` — проверить: `grep -n "QRCodeSVG" node_modules/qrcode.react/lib/index.d.ts`.
- `motion`, `zustand`, `lucide-react`.
- Никаких новых пакетов без строки в `docs/DECISIONS.md` и проверки, что версия реально встала (`npm i` → что записалось в манифест).

## Структура (новое и изменяемое)

```
src/lib/store.ts               # + updateItemPrice, setBlikPhone
src/lib/store.test.ts
src/components/ShareSheet.tsx
src/components/Toast.tsx
src/components/ItemRow.tsx     # + карандаш и инлайн-инпут цены (только хост)
src/components/BottomBar.tsx   # хост: «Udostępnij» → ShareSheet; гость: BLIK
```

Правило: ключи localStorage и имена каналов — только константами в `src/lib/` (стор, позже `transport/`), не в компонентах. Проверка: `grep -rn "splitcheck:" src --include=*.tsx; echo exit=$?` → `exit=1`.

## Шаги (один за раз: диф → команда проверки → реальный вывод → STATE.md → коммит)

### Шаг 1. Действия стора

- `updateItemPrice(itemId, grosze)`, `setBlikPhone(phone)`; номер BLIK по умолчанию берётся из localStorage для новых сессий. Имя ключа — решение фазы → `DECISIONS.md`.
- Проверка: `npm test; echo exit=$?`.

### Шаг 2. ShareSheet

- Большой QR (светлые модули на `--surface-2` или белая плашка — что сканируется, то и оставить; выбор → `DECISIONS.md`), URL = `window.location.origin + /s/<id>`.
- «Kopiuj link» (`navigator.clipboard.writeText`), «Udostępnij…» (`navigator.share` → fallback на копирование), поле «Numer do BLIK (opcjonalnie)».
- Проверка: ручные п. 3–4.

### Шаг 3. BLIK у гостя и тост

- Pill «Skopiuj numer BLIK · <номер>» только если номер есть; `Toast` «Skopiowano» (`snappy`, исчезает сам).
- Проверка: ручной п. 5.

### Шаг 4. Правка цены хостом

- Карандаш у строки → инпут, Enter/blur сохраняет через `parsePLN`; невалидное — подсветка `--danger`, цена не меняется.
- Проверка: критерии 1, 2, 6.

## Что НЕ делать

- Глубокие ссылки в банковские приложения, проверку оплаты, «zapłaciłem» → `NOT_NOW.md`.
- Редактирование названий позиций, добавление/удаление строк — не просили; если хочется → `NOT_NOW.md`.
- Короткие ссылки/свой домен для QR.

## Отчёт по завершении

В `docs/STATE.md`: критерий «работает» по пунктам с реальным выводом; список оставшихся `[предположение]`; отклонения от этого документа — в `DECISIONS.md`.
Перед стартом следующей фазы: «Сделано» этой фазы → `docs/log/YYYY-MM.md` (дописать), из STATE убрать — иначе BOOT упрётся в 4096 байт.
