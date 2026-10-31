import { afterEach, describe, expect, it, vi } from "vitest";
import { httpSessionsApi } from "@/lib/transport/http";
import type { Session } from "@/lib/types";

const session: Session = { id: "s1", items: [], serviceGrosze: 0, participants: [], claims: {}, createdAt: 0 };

function stubFetch(status: number, body: unknown = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Response.json(body, { status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("httpSessionsApi", () => {
  it("select: 404 → null, 200 → строка", async () => {
    stubFetch(404, { error: "not_found" });
    expect(await httpSessionsApi().select("s1")).toBeNull();
    stubFetch(200, { id: "s1", version: 3, data: session });
    expect(await httpSessionsApi().select("s1")).toEqual({ id: "s1", version: 3, data: session });
  });

  it("updateIfVersion: 409 → false (кто-то записал раньше), 200 → true; шлёт expected_version", async () => {
    const calls = stubFetch(409, { error: "version_conflict" });
    expect(await httpSessionsApi().updateIfVersion({ id: "s1", version: 3, data: session }, 2)).toBe(false);
    expect(calls[0].url).toBe("/api/sessions/s1");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ version: 3, expected_version: 2, data: session });
    stubFetch(200, { ok: true });
    expect(await httpSessionsApi().updateIfVersion({ id: "s1", version: 3, data: session }, 2)).toBe(true);
  });

  it("сеть/сервер упали → исключение (транспорт перечитает и не потеряет снимок)", async () => {
    stubFetch(500, { error: "internal" });
    await expect(httpSessionsApi().insert({ id: "s1", version: 1, data: session })).rejects.toThrow("500 internal");
  });
});
