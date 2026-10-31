import { nanoid } from "nanoid";
import { create } from "zustand";
import type { ParsedReceipt } from "@/lib/receipt/types";
import { defaultTransport } from "@/lib/transport";
import type { Apply, SessionTransport } from "@/lib/transport/types";
import type { Session } from "@/lib/types";

// «Кто я на этом устройстве» — docs/SPEC.md «Состояние сессии»
export const meKey = (sessionId: string) => `splitcheck:me:${sessionId}`;

// Пометка вкладки ?as=guest: «я гость, участника ещё нет» (создаётся на первом тапе)
const GUEST_MARK = "";

// Нет хранилища (SSR, Node, приватный режим) — молча null / no-op
function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // см. safeGet
  }
}

// Сначала вкладка, потом устройство: localStorage общий для вкладок (DECISIONS 2026-10-31 «Кто я»)
export function readMe(sessionId: string): string | null {
  return safeGet(() => sessionStorage, meKey(sessionId)) ?? safeGet(() => localStorage, meKey(sessionId));
}

// Гостевая вкладка (?as=guest) пишет только себе, иначе — и вкладке, и устройству
export function writeMe(sessionId: string, participantId: string) {
  const guestTab = safeGet(() => sessionStorage, meKey(sessionId)) === GUEST_MARK;
  safeSet(() => sessionStorage, meKey(sessionId), participantId);
  if (!guestTab) safeSet(() => localStorage, meKey(sessionId), participantId);
}

// ?as=guest: вкладка перестаёт наследовать «кто я» из localStorage. Уже выбранного гостя не трогает (F5)
export function markGuestTab(sessionId: string) {
  const key = meKey(sessionId);
  if (safeGet(() => sessionStorage, key) === null) safeSet(() => sessionStorage, key, GUEST_MARK);
}

// Номер BLIK хоста — один на устройство, подставляется во все его новые сессии
const BLIK_KEY = "splitcheck:blik";

function readBlik(): string | null {
  try {
    return localStorage.getItem(BLIK_KEY);
  } catch {
    return null;
  }
}

function writeBlik(digits: string | null) {
  try {
    if (digits) localStorage.setItem(BLIK_KEY, digits);
    else localStorage.removeItem(BLIK_KEY);
  } catch {
    // см. readMe
  }
}

// Польский номер: 9 цифр; пробелы, дефисы и +48 допускаются на вводе. Иначе null
export function normalizeBlik(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "").replace(/^\+48/, "");
  return /^\d{9}$/.test(digits) ? digits : null;
}

// 600123456 → «600 123 456»
export const formatBlik = (digits: string) => digits.replace(/(\d{3})(?=\d)/g, "$1 ");

// Гости по кругу; хост всегда vista — токены из src/app/globals.css
const AVATAR_COLORS = ["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"];

// Желаемое состояние, а не «переключить»: повтор на свежем снимке ничего не ломает (DECISIONS 2026-10-31 «apply»)
function setClaim(session: Session, itemId: string, participantId: string, take: boolean): Session {
  const current = session.claims[itemId] ?? [];
  if (current.includes(participantId) === take) return session;
  const next = take ? [...current, participantId] : current.filter((id) => id !== participantId);
  return { ...session, claims: { ...session.claims, [itemId]: next } };
}

// Тесты подставляют свой транспорт; иначе — defaultTransport() (на сервере его нет)
let transport: SessionTransport | null = null;

export function setTransport(next: SessionTransport | null) {
  transport = next;
}

function currentTransport(): SessionTransport | null {
  return transport ?? defaultTransport();
}

type SessionStore = {
  session: Session | null;
  // Снимок из транспорта (F5, другая вкладка) — без повторного сохранения
  applySnapshot: (session: Session) => void;
  createSession: (parsed: ParsedReceipt) => string;
  toggleClaim: (itemId: string, participantId: string) => void;
  // Не пишет «кто я»: фаза 5 добавляет им фейковых гостей. «Кто я» — writeMe после ввода имени
  addParticipant: (name: string) => string | null;
  renameParticipant: (participantId: string, name: string) => void;
  // Только целые гроши ≥ 0 (parsePLN отдаёт такие); иначе ничего не меняет
  updateItemPrice: (itemId: string, grosze: number) => void;
  // "" — стереть номер; невалидный → false, ничего не меняет
  setBlikPhone: (input: string) => boolean;
};

// Одна текущая сессия. Изменение: сразу в стор (оптимистично) → transport.update поверх свежего снимка →
// ответ транспорта в стор. Пока запись в пути, её apply накладывается на любой пришедший снимок
export const useSessionStore = create<SessionStore>()((set, get) => {
  const pending = new Map<Apply, string /* sessionId */>();

  function withPending(session: Session): Session {
    let result = session;
    for (const [apply, sessionId] of pending) if (sessionId === session.id) result = apply(result);
    return result;
  }

  function change(apply: Apply) {
    const { session } = get();
    if (!session) return;
    set({ session: apply(session) });
    const transport = currentTransport();
    if (!transport) return;
    pending.set(apply, session.id);
    transport.update(session.id, apply).then(
      (fresh) => {
        pending.delete(apply);
        if (fresh && get().session?.id === fresh.id) set({ session: withPending(fresh) });
      },
      (error: unknown) => {
        pending.delete(apply);
        console.warn("[store] update failed", error);
      },
    );
  }

  return {
    session: null,

    applySnapshot: (session) => set({ session: withPending(session) }),

    createSession: (parsed) => {
      const host = { id: nanoid(), name: "Host", color: "vista", isHost: true };
      const session: Session = {
        id: nanoid(10),
        merchant: parsed.merchant,
        items: parsed.items.map((item) => ({ id: nanoid(), name: item.name, priceGrosze: item.priceGrosze })),
        serviceGrosze: parsed.serviceGrosze,
        participants: [host],
        claims: {},
        blikPhone: readBlik() ?? undefined,
        createdAt: Date.now(),
      };
      writeMe(session.id, host.id);
      set({ session });
      currentTransport()?.save(session);
      return session.id;
    },

    toggleClaim: (itemId, participantId) => {
      const { session } = get();
      if (!session) return;
      // «Взять» или «снять» решается по тому, что человек видит в момент тапа
      const take = !(session.claims[itemId] ?? []).includes(participantId);
      change((s) => setClaim(s, itemId, participantId, take));
    },

    addParticipant: (name) => {
      if (!get().session) return null;
      const id = nanoid();
      // Цвет — по свежему снимку: два гостя с разных телефонов не получат один и тот же
      change((s) => {
        if (s.participants.some((p) => p.id === id)) return s;
        const guests = s.participants.filter((p) => !p.isHost).length;
        const guest = { id, name, color: AVATAR_COLORS[guests % AVATAR_COLORS.length], isHost: false };
        return { ...s, participants: [...s.participants, guest] };
      });
      return id;
    },

    renameParticipant: (participantId, name) => {
      change((s) => ({ ...s, participants: s.participants.map((p) => (p.id === participantId ? { ...p, name } : p)) }));
    },

    updateItemPrice: (itemId, grosze) => {
      if (!Number.isInteger(grosze) || grosze < 0) return;
      change((s) => ({
        ...s,
        items: s.items.map((item) => (item.id === itemId ? { ...item, priceGrosze: grosze } : item)),
      }));
    },

    setBlikPhone: (input) => {
      const clear = input.trim() === "";
      const digits = clear ? null : normalizeBlik(input);
      if (!clear && digits === null) return false;
      writeBlik(digits);
      change((s) => ({ ...s, blikPhone: digits ?? undefined }));
      return true;
    },
  };
});

// Вход на /s/<id>: снимок из транспорта в стор. false — такой сессии нет
export async function loadSession(sessionId: string): Promise<boolean> {
  const loaded = await currentTransport()?.load(sessionId);
  if (loaded) useSessionStore.getState().applySnapshot(loaded);
  return Boolean(loaded) || useSessionStore.getState().session?.id === sessionId;
}

// Снимки этой сессии из других вкладок → стор. Возвращает отписку
export function subscribeSession(sessionId: string): () => void {
  return currentTransport()?.subscribe(sessionId, useSessionStore.getState().applySnapshot) ?? (() => {});
}
