"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReceiptLine } from "@/components/receipt/ReceiptLine";
import { ReceiptPaper } from "@/components/receipt/ReceiptPaper";
import { ReceiptPrinter, printedKey, type PrinterPhase } from "@/components/receipt/ReceiptPrinter";
import { ReceiptTotals } from "@/components/receipt/ReceiptTotals";
import { FpsMeter } from "./FpsMeter";
import { fixtureReceipt } from "@/lib/receipt/fixture";
import { allocated, totalOf } from "@/lib/split";
import type { Participant, Session } from "@/lib/types";

const LINES = [5, 12, 25];
const CREATED_AT = Date.UTC(2026, 9, 31, 18, 42); // фиксированное время — без hydration mismatch

const participants: Participant[] = [
  { id: "host", name: "Vlad", color: "vista", isHost: true },
  { id: "ania", name: "Ania", color: "avatar-1", isHost: false },
  { id: "kuba", name: "Kuba", color: "avatar-2", isHost: false },
  { id: "ola", name: "Ola", color: "avatar-3", isHost: false },
  { id: "piotr", name: "Piotr", color: "avatar-4", isHost: false },
  { id: "ewa", name: "Ewa", color: "avatar-5", isHost: false },
];

// Первые строки показывают все состояния: моя, чужая, общая моя, 5 чужих («+2»), ничья
function mockSession(lines: number): Session {
  const items = Array.from({ length: lines }, (_, i) => ({
    ...fixtureReceipt.items[i % fixtureReceipt.items.length],
    id: `i${i}`,
  }));
  return {
    id: "dev",
    merchant: fixtureReceipt.merchant,
    items,
    serviceGrosze: fixtureReceipt.serviceGrosze,
    participants,
    claims: { i0: ["host"], i1: ["ania"], i2: ["host", "ania"], i3: ["ania", "kuba", "ola", "piotr", "ewa"] },
    createdAt: CREATED_AT,
  };
}

export function ReceiptSandbox() {
  const searchParams = useSearchParams();
  const lines = Number(searchParams.get("lines")) || 12;
  const meId = searchParams.get("host") === "0" ? "ania" : "host";
  const phaseParam = searchParams.get("phase");
  const force = phaseParam === "printing" || phaseParam === "interactive" ? (phaseParam as PrinterPhase) : undefined;
  const slow = searchParams.get("slow") === "1" ? 4 : 1;
  const fps = searchParams.get("fps") === "1";
  return <Sandbox key={lines} lines={lines} meId={meId} force={force} slow={slow} fps={fps} />;
}

type SandboxProps = { lines: number; meId: string; force?: PrinterPhase; slow: number; fps: boolean };

function Sandbox({ lines, meId, force, slow, fps }: SandboxProps) {
  const [session, setSession] = useState(() => mockSession(lines));
  const [run, setRun] = useState(0); // Replay: новый key → принтер с нуля
  const canEdit = participants.find((p) => p.id === meId)?.isHost ?? false;

  const onToggle = useCallback(
    (itemId: string) =>
      setSession((s) => {
        const claimed = s.claims[itemId] ?? [];
        const next = claimed.includes(meId) ? claimed.filter((id) => id !== meId) : [...claimed, meId];
        return { ...s, claims: { ...s.claims, [itemId]: next } };
      }),
    [meId],
  );
  const onPriceChange = useCallback(
    (itemId: string, grosze: number) =>
      setSession((s) => ({ ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, priceGrosze: grosze } : it)) })),
    [],
  );

  function replay() {
    try {
      sessionStorage.removeItem(printedKey(session.id));
    } catch {}
    setRun((n) => n + 1);
  }

  const total = totalOf(session);
  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-6 px-4 py-8 [--paper-max-h:calc(100dvh-170px)]">
      {/* Счётчик сбрасывается на Replay: новый key — замер только этой печати */}
      {fps && <FpsMeter key={`fps-${run}`} />}
      <nav className="flex flex-wrap gap-3 text-sm text-text-muted">
        {LINES.map((n) => (
          <Link key={n} href={`?lines=${n}${meId === "ania" ? "&host=0" : ""}${fps ? "&fps=1" : ""}`} className="underline-offset-4 hover:underline">
            {n} linii
          </Link>
        ))}
        <Link href={`?lines=${lines}${meId === "ania" ? "" : "&host=0"}`} className="underline-offset-4 hover:underline">
          {meId === "ania" ? "jako host" : "jako gość"}
        </Link>
        <button type="button" onClick={replay} className="ml-auto text-vista underline-offset-4 hover:underline">
          Replay
        </button>
      </nav>
      <ReceiptPrinter key={run} sessionId={session.id} lines={session.items.length} force={force} slow={slow}>
        <ReceiptPaper title={session.merchant} subtitle="Paragon" createdAt={session.createdAt} code="V1StGXR8_Z">
          <ul role="list" className="flex flex-col">
            {session.items.map((item) => {
              const claimed = session.claims[item.id] ?? [];
              return (
                <li key={item.id}>
                  <ReceiptLine
                    item={item}
                    claimers={session.participants.filter((p) => claimed.includes(p.id))}
                    meId={meId}
                    canEdit={canEdit}
                    onToggle={onToggle}
                    onPriceChange={onPriceChange}
                  />
                </li>
              );
            })}
          </ul>
          <ReceiptTotals
            itemsGrosze={total - session.serviceGrosze}
            serviceGrosze={session.serviceGrosze}
            unallocatedGrosze={total - allocated(session)}
            totalGrosze={total}
            canEdit={canEdit}
          />
        </ReceiptPaper>
      </ReceiptPrinter>
    </main>
  );
}
