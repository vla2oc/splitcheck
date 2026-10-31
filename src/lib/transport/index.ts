import { getBrowserTransport } from "@/lib/transport/broadcast";
import { getSupabaseTransport } from "@/lib/transport/supabase";
import type { SessionTransport } from "@/lib/transport/types";

// Next подставляет в клиентский бандл только буквальные process.env.NEXT_PUBLIC_* — не деструктурировать
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Точка подмены реализации — стор и UI не меняются. Есть .env.local → Supabase (между устройствами),
// нет → вкладки одного браузера (localStorage + BroadcastChannel). На сервере (SSR) транспорта нет
export function defaultTransport(): SessionTransport | null {
  if (typeof window === "undefined") return null;
  return SUPABASE_URL && SUPABASE_KEY ? getSupabaseTransport(SUPABASE_URL, SUPABASE_KEY) : getBrowserTransport();
}
