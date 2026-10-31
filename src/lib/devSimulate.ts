import { useSessionStore } from "@/lib/store";

// Dev-кнопка «Symuluj gości» (?dev=1) — демо «3 телефона» на одном экране, docs/SPEC.md «Синхронизация без бэкенда»
const GUESTS = ["Ania", "Kuba", "Ola"];
const TAPS_PER_GUEST = 3;
export const MIN_DELAY_MS = 400;
export const MAX_DELAY_MS = 900;

// Гости тапают параллельно, каждый — серией с паузами 400–900 мс. Только берут позиции (прогресс растёт).
// Возвращает отмену оставшихся тапов
export function simulateGuests(random: () => number = Math.random): () => void {
  const store = useSessionStore.getState();
  if (!store.session) return () => {};

  // Повторный запуск (после F5) берёт уже добавленных гостей, а не плодит дубли
  const guestIds = GUESTS.map(
    (name) => store.session?.participants.find((p) => !p.isHost && p.name === name)?.id ?? store.addParticipant(name),
  ).filter((id): id is string => id !== null);

  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const guestId of guestIds) {
    let at = 0;
    for (let tap = 0; tap < TAPS_PER_GUEST; tap++) {
      at += MIN_DELAY_MS + random() * (MAX_DELAY_MS - MIN_DELAY_MS);
      timers.push(setTimeout(() => tapRandomItem(guestId, random), at));
    }
  }
  return () => timers.forEach(clearTimeout);
}

function tapRandomItem(guestId: string, random: () => number) {
  const { session, toggleClaim } = useSessionStore.getState();
  if (!session) return;
  const notMine = session.items.filter((item) => !(session.claims[item.id] ?? []).includes(guestId));
  if (notMine.length === 0) return;
  toggleClaim(notMine[Math.floor(random() * notMine.length)].id, guestId);
}
