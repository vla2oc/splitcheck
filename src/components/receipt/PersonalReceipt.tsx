"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ReceiptPaper } from "@/components/receipt/ReceiptPaper";
import { ReceiptPrinter } from "@/components/receipt/ReceiptPrinter";
import { formatAmount, formatPLN } from "@/lib/money";
import { receiptSpring, spring } from "@/lib/motion";
import { itemSharesFor, shareOf } from "@/lib/split";
import { formatBlik } from "@/lib/store";
import type { Participant, Session } from "@/lib/types";

type Props = {
  open: boolean;
  session: Session;
  me: Participant | undefined;
  onClose: () => void;
  onCopyBlik: () => void;
};

// Персональный чек гостя: принтер возвращается и печатает только его позиции — при каждом открытии,
// по живым данным (выбор поменялся — пересчитается). Закрытие — кнопка или Esc; свайп — NOT_NOW.md
export function PersonalReceipt({ open, session, me, onClose, onCopyBlik }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && me && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Twój paragon"
          className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-oxford/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={spring.smooth}
        >
          <Content session={session} me={me} onClose={onClose} onCopyBlik={onCopyBlik} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Content({ session, me, onClose, onCopyBlik }: Omit<Props, "open"> & { me: Participant }) {
  // Время печати — момент открытия; Content монтируется только на клиенте по тапу
  const [printedAt] = useState(() => Date.now());
  const { items, service } = itemSharesFor(session, me.id);
  const names = new Map(session.items.map((item) => [item.id, item.name]));

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6 px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <ReceiptPrinter sessionId={session.id} lines={items.length} force="printing" duration={receiptSpring.personal.visualDuration}>
        <ReceiptPaper title="Twoja część" subtitle={me.name} createdAt={printedAt} code={session.id}>
          <ul role="list" className="flex flex-col gap-2">
            {items.map((line) => (
              <li key={line.itemId} className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 break-words">
                  {names.get(line.itemId)}
                  {line.ways >= 2 && <span className="text-paper-muted"> ÷{line.ways}</span>}
                  {line.ways === 0 && <span className="text-paper-muted"> (nierozdzielone)</span>}
                </span>
                <span className="shrink-0">{formatAmount(line.grosze)}</span>
              </li>
            ))}
          </ul>
          <hr className="my-3 border-t border-dashed border-paper-rule" />
          {session.serviceGrosze > 0 && (
            <div className="flex items-baseline justify-between gap-4">
              <span>Serwis (Twoja część)</span>
              <span className="shrink-0">{formatAmount(service)}</span>
            </div>
          )}
          <hr className="my-3 border-t-[3px] border-double border-oxford/45" />
          {/* Итог — тот же shareOf, что «Twoja część» в нижней панели; Σ строк + сервис === shareOf (split.test.ts) */}
          <div className="flex items-baseline justify-between gap-4 text-base font-semibold">
            <span>DO ZAPŁATY</span>
            <span className="shrink-0">{formatPLN(shareOf(session, me.id))}</span>
          </div>
          {session.blikPhone && !me.isHost && (
            <motion.button
              type="button"
              onClick={onCopyBlik}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              className="mt-5 h-11 w-full rounded-full bg-oxford font-sans text-sm font-medium text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vista"
            >
              Skopiuj numer BLIK · <span className="font-mono tabular-nums">{formatBlik(session.blikPhone)}</span>
            </motion.button>
          )}
        </ReceiptPaper>
      </ReceiptPrinter>
      <motion.button
        type="button"
        autoFocus
        onClick={onClose}
        whileTap={{ scale: 0.96 }}
        transition={spring.snappy}
        className="mx-auto h-12 rounded-full border border-border bg-surface-1 px-6 font-medium text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vista"
      >
        Wróć do paragonu
      </motion.button>
    </div>
  );
}
