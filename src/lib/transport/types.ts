import type { Session } from "@/lib/types";

// Изменение сессии поверх свежего снимка. Идемпотентно: транспорт может вызвать его повторно (конфликт версий)
export type Apply = (session: Session) => Session;

// Единственное, что стор и UI знают о синхронизации — docs/SPEC.md «Синхронизация без бэкенда».
// Сейчас: localStorage + BroadcastChannel (broadcast.ts). Позже: Supabase Realtime за тем же интерфейсом.
export interface SessionTransport {
  // Последний сохранённый снимок или null. Promise — под будущий сетевой бэкенд
  load(sessionId: string): Promise<Session | null>;
  // Новая сессия снимком целиком; без ожидания доставки
  save(session: Session): void;
  // apply поверх последнего снимка транспорта, а не локального стора — чужие изменения не теряются.
  // Записи одного клиента по сессии — по порядку вызова. Отдаёт самый свежий известный снимок (уже с apply,
  // если запись удалась) или null, если сессии нет
  update(sessionId: string, apply: Apply): Promise<Session | null>;
  // Снимки этой сессии из других вкладок/клиентов, новее уже виденных. Возвращает отписку
  subscribe(sessionId: string, onSession: (session: Session) => void): () => void;
}
