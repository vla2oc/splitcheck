import type { SessionTransport } from "@/lib/transport/types";
import type { Session } from "@/lib/types";

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
type Deps = { storage: KeyValueStorage; openChannel: (name: string) => Channel };

export function createBroadcastTransport({ storage, openChannel }: Deps): SessionTransport {
  // Самый свежий виденный снимок каждой сессии: фильтр эха/опоздавших и база для update, если хранилища нет
  const latest = new Map<string, Envelope>();
  const senders = new Map<string, Channel>();

  const seen = (sessionId: string) => latest.get(sessionId)?.version ?? 0;
  function remember(sessionId: string, envelope: Envelope) {
    if (envelope.version > seen(sessionId)) latest.set(sessionId, envelope);
  }

  function read(sessionId: string): Envelope | null {
    try {
      const raw = storage.getItem(sessionKey(sessionId));
      return raw ? (JSON.parse(raw) as Envelope) : null;
    } catch {
      return null; // нет хранилища или битый JSON — как будто сессии нет
    }
  }

  // Хранилище общее для вкладок — обычно оно свежее; память — если хранилища нет
  function newest(sessionId: string): Envelope | null {
    const stored = read(sessionId);
    const known = latest.get(sessionId) ?? null;
    if (!stored || !known) return stored ?? known;
    return stored.version >= known.version ? stored : known;
  }

  function sender(sessionId: string) {
    let channel = senders.get(sessionId);
    if (!channel) {
      channel = openChannel(channelName(sessionId));
      senders.set(sessionId, channel);
    }
    return channel;
  }

  function write(session: Session) {
    const envelope = { version: (newest(session.id)?.version ?? 0) + 1, session };
    remember(session.id, envelope);
    try {
      storage.setItem(sessionKey(session.id), JSON.stringify(envelope));
    } catch {
      // нет места / приватный режим — вкладки всё равно получат снимок по каналу
    }
    sender(session.id).postMessage(envelope);
  }

  return {
    async load(sessionId) {
      const envelope = read(sessionId);
      if (!envelope) return null;
      remember(sessionId, envelope);
      return envelope.session;
    },

    save: write,

    // localStorage синхронный: чтение → apply → запись идут без await, т. е. по порядку вызова и без
    // чужой записи посередине (окно между вкладками — микросекунды, DECISIONS 2026-10-31 «update»)
    async update(sessionId, apply) {
      const base = newest(sessionId);
      if (!base) return null;
      remember(sessionId, base);
      const next = apply(base.session);
      if (next !== base.session) write(next); // повтор уже применённого — без новой версии
      return next;
    },

    subscribe(sessionId, onSession) {
      const channel = openChannel(channelName(sessionId));
      channel.listen((envelope) => {
        // Своё эхо (другой объект канала в той же вкладке) и опоздавшие снимки отбрасываем
        if (envelope.version <= seen(sessionId)) return;
        remember(sessionId, envelope);
        onSession(envelope.session);
      });
      return () => channel.close();
    },
  };
}

function browserChannel(name: string): Channel {
  const channel = new BroadcastChannel(name);
  return {
    postMessage: (message) => channel.postMessage(message),
    listen: (onMessage) => {
      channel.onmessage = (event: MessageEvent<Envelope>) => onMessage(event.data);
    },
    close: () => channel.close(),
  };
}

let browserTransport: SessionTransport | null = null;

// Лениво: на сервере (SSR) нет ни localStorage, ни BroadcastChannel
export function getBrowserTransport(): SessionTransport {
  browserTransport ??= createBroadcastTransport({ storage: localStorage, openChannel: browserChannel });
  return browserTransport;
}
