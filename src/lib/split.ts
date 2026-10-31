import type { Session } from "@/lib/types";

export function totalOf(session: Session): number {
  return session.items.reduce((sum, item) => sum + item.priceGrosze, 0) + session.serviceGrosze;
}

// Кто взял позицию — в порядке входа (session.participants); чужие и повторные id отбрасываются
function claimersOf(session: Session, itemId: string): string[] {
  const claimed = new Set(session.claims[itemId] ?? []);
  return session.participants.filter((p) => claimed.has(p.id)).map((p) => p.id);
}

// Доли позиций без сервиса: floor(price / n) каждому, остаток по 1 гр первым по порядку входа. Невзятое → хосту.
export function itemShares(session: Session): Record<string, number> {
  const shares: Record<string, number> = {};
  for (const p of session.participants) shares[p.id] = 0;
  const host = session.participants.find((p) => p.isHost);

  for (const item of session.items) {
    const claimers = claimersOf(session, item.id);
    if (claimers.length === 0) {
      if (host) shares[host.id] += item.priceGrosze;
      continue;
    }
    const base = Math.floor(item.priceGrosze / claimers.length);
    const rest = item.priceGrosze - base * claimers.length;
    claimers.forEach((id, i) => {
      shares[id] += base + (i < rest ? 1 : 0);
    });
  }
  return shares;
}

// Сервис пропорционально долям позиций: floor каждому, остаток по 1 гр по наибольшему дробному остатку,
// при равенстве — по порядку входа. Долей нет (Σ = 0) → весь сервис хосту.
function serviceShares(session: Session, items: Record<string, number>): Record<string, number> {
  const ids = session.participants.map((p) => p.id);
  const weightSum = ids.reduce((sum, id) => sum + items[id], 0);
  const shares: Record<string, number> = {};
  for (const id of ids) shares[id] = 0;

  if (weightSum === 0) {
    const host = session.participants.find((p) => p.isHost);
    if (host) shares[host.id] = session.serviceGrosze;
    return shares;
  }

  // Остаток держим числителем (целое), чтобы сравнивать без float
  const remainders = ids.map((id) => {
    const scaled = session.serviceGrosze * items[id];
    shares[id] = Math.floor(scaled / weightSum);
    return { id, remainder: scaled - shares[id] * weightSum };
  });
  let leftover = session.serviceGrosze - ids.reduce((sum, id) => sum + shares[id], 0);
  // sort стабильный → при равных остатках сохраняется порядок входа
  for (const { id } of remainders.sort((x, y) => y.remainder - x.remainder)) {
    if (leftover === 0) break;
    shares[id] += 1;
    leftover -= 1;
  }
  return shares;
}

export function shareOf(session: Session, participantId: string): number {
  const items = itemShares(session);
  if (!(participantId in items)) return 0;
  return items[participantId] + serviceShares(session, items)[participantId];
}

// Сколько уже распределено (без «невзятое → хосту»), для прогресс-бара. Всё взято → === totalOf.
export function allocated(session: Session): number {
  const itemsSum = session.items.reduce((sum, item) => sum + item.priceGrosze, 0);
  const claimedSum = session.items
    .filter((item) => claimersOf(session, item.id).length > 0)
    .reduce((sum, item) => sum + item.priceGrosze, 0);
  if (itemsSum === 0) return claimedSum;
  return claimedSum + Math.floor((session.serviceGrosze * claimedSum) / itemsSum);
}

// ways — на сколько человек делится позиция; 0 — невзятая, целиком хосту
export type ItemShare = { itemId: string; grosze: number; ways: number };

// Строки персонального чека: позиции участника с его долей по тому же правилу, что itemShares
// (остаток по 1 гр первым по порядку входа; невзятое → хосту), и его часть сервиса.
// Σ items[].grosze + service === shareOf. Порядок строк — как в чеке.
export function itemSharesFor(session: Session, participantId: string): { items: ItemShare[]; service: number } {
  if (!session.participants.some((p) => p.id === participantId)) return { items: [], service: 0 };
  const isHost = session.participants.find((p) => p.isHost)?.id === participantId;
  const items: ItemShare[] = [];

  for (const item of session.items) {
    const claimers = claimersOf(session, item.id);
    if (claimers.length === 0) {
      if (isHost) items.push({ itemId: item.id, grosze: item.priceGrosze, ways: 0 });
      continue;
    }
    const index = claimers.indexOf(participantId);
    if (index === -1) continue;
    const base = Math.floor(item.priceGrosze / claimers.length);
    const rest = item.priceGrosze - base * claimers.length;
    items.push({ itemId: item.id, grosze: base + (index < rest ? 1 : 0), ways: claimers.length });
  }
  return { items, service: serviceShares(session, itemShares(session))[participantId] };
}
