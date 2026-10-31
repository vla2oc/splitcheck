import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hostSecretKey, supabaseSessionsApi, type Row } from "@/lib/transport/supabase";
import type { Session } from "@/lib/types";

// supabaseSessionsApi поверх RPC и Broadcast (supabase/migrations/002_lockdown.sql) — на фейковом клиенте

const session = (id: string): Session => ({ id, items: [], serviceGrosze: 0, participants: [], claims: {}, createdAt: 0 });
const row = (id: string, version: number): Row => ({ id, version, data: session(id) });

function fakeClient(rows: Record<string, Row | null> = {}) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const channels: { name: string; signal: () => void; subscribed: (status: string) => void; removed: boolean }[] = [];
  let release: (() => void) | null = null; // держит get_session «в полёте», чтобы проверить схлопывание сигналов
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "get_session") {
        if (release === null) return { data: rows[args.p_id as string] ?? null, error: null };
        await new Promise<void>((resolve) => (release = resolve));
        return { data: rows[args.p_id as string] ?? null, error: null };
      }
      if (fn === "update_session") return { data: true, error: null };
      return { data: null, error: null };
    },
    channel(name: string) {
      const entry = { name, signal: () => {}, subscribed: (_: string) => {}, removed: false };
      channels.push(entry);
      const channel = {
        on(_type: string, _filter: unknown, cb: () => void) {
          entry.signal = cb;
          return channel;
        },
        subscribe(cb: (status: string) => void) {
          entry.subscribed = cb;
          return channel;
        },
      };
      return channel;
    },
    async removeChannel(channel: unknown) {
      void channel;
      channels[channels.length - 1].removed = true;
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    rpcCalls,
    channels,
    hold: () => (release = () => {}),
    releaseRead: () => {
      const r = release;
      release = null;
      r?.();
    },
  };
}

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("supabaseSessionsApi", () => {
  it("creates a session with a fresh host secret kept only on this device", async () => {
    const { client, rpcCalls } = fakeClient();
    await supabaseSessionsApi(client).insert(row("AAAAAAAAAA", 1));
    const call = rpcCalls[0];
    expect(call.fn).toBe("create_session");
    expect(call.args.p_host_secret).toMatch(/^[0-9a-f]{64}$/);
    expect(store.get(hostSecretKey("AAAAAAAAAA"))).toBe(call.args.p_host_secret);
  });

  it("writes with the host secret on the host's device and without it on a guest's", async () => {
    const { client, rpcCalls } = fakeClient();
    const api = supabaseSessionsApi(client);
    store.set(hostSecretKey("HOSTHOSTHO"), "s".repeat(64));
    expect(await api.updateIfVersion(row("HOSTHOSTHO", 3), 2)).toBe(true);
    await api.updateIfVersion(row("GUESTGUEST", 3), 2);
    expect(rpcCalls.map((c) => [c.fn, c.args.p_expected_version, c.args.p_host_secret])).toEqual([
      ["update_session", 2, "s".repeat(64)],
      ["update_session", 2, null],
    ]);
  });

  it("reads through get_session and returns null for a missing session", async () => {
    const { client } = fakeClient({ AAAAAAAAAA: row("AAAAAAAAAA", 4) });
    const api = supabaseSessionsApi(client);
    expect(await api.select("AAAAAAAAAA")).toEqual(row("AAAAAAAAAA", 4));
    expect(await api.select("BBBBBBBBBB")).toBeNull();
  });

  it("treats a broadcast as a signal only: the row comes from get_session", async () => {
    const { client, rpcCalls, channels } = fakeClient({ AAAAAAAAAA: row("AAAAAAAAAA", 5) });
    const got: Row[] = [];
    supabaseSessionsApi(client).watch("AAAAAAAAAA", (r) => got.push(r), () => {});
    expect(channels[0].name).toBe("session:AAAAAAAAAA");
    channels[0].signal();
    await tick();
    expect(rpcCalls.map((c) => c.fn)).toEqual(["get_session"]);
    expect(got).toEqual([row("AAAAAAAAAA", 5)]);
  });

  it("collapses a burst of signals into one read plus one follow-up", async () => {
    const fake = fakeClient({ AAAAAAAAAA: row("AAAAAAAAAA", 5) });
    supabaseSessionsApi(fake.client).watch("AAAAAAAAAA", () => {}, () => {});
    fake.hold();
    for (let i = 0; i < 5; i++) fake.channels[0].signal();
    await tick();
    fake.releaseRead();
    await tick();
    await tick();
    expect(fake.rpcCalls.filter((c) => c.fn === "get_session")).toHaveLength(2);
  });

  it("shares one channel per session and closes it with the last watcher", async () => {
    const { client, channels } = fakeClient();
    const api = supabaseSessionsApi(client);
    const subscribed: string[] = [];
    const stopA = api.watch("AAAAAAAAAA", () => {}, () => subscribed.push("a"));
    channels[0].subscribed("SUBSCRIBED");
    const stopB = api.watch("AAAAAAAAAA", () => {}, () => subscribed.push("b"));
    expect(channels).toHaveLength(1);
    expect(subscribed).toEqual(["a", "b"]); // поздний подписчик тоже перечитывает снимок
    stopA();
    expect(channels[0].removed).toBe(false);
    stopB();
    expect(channels[0].removed).toBe(true);
  });
});
