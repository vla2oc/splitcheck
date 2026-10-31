"use client";

import { AnimatePresence, motion } from "motion/react";
import { receiptSpring, spring } from "@/lib/motion";
import type { Participant } from "@/lib/types";

const MAX_VISIBLE = 4;

// Первая буква имени; Array.from — чтобы не резать эмодзи/суррогатные пары
const initialOf = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

// paper — на светлой бумаге чека: кольцо цвета бумаги, «+N» тёмным, до 3 аватаров — docs/DECISIONS.md
type Props = { participants: Participant[]; tone?: "dark" | "paper" };

// Кто взял позицию — docs/SPEC.md «Видно, кто взял каждую позицию»
export function AvatarStack({ participants, tone = "dark" }: Props) {
  const onPaper = tone === "paper";
  const visible = participants.slice(0, onPaper ? 3 : MAX_VISIBLE);
  const hidden = participants.length - visible.length;

  return (
    <div className="flex items-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {visible.map((p) => (
          <motion.span
            key={p.id}
            layout
            title={p.name}
            initial={{ scale: 0, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={onPaper ? receiptSpring.avatar : spring.bouncy}
            className={`-ml-1.5 flex size-6 items-center justify-center rounded-full font-sans text-xs font-medium text-oxford ring-2 first:ml-0 ${onPaper ? "ring-paper" : "ring-surface-1"}`}
            style={{ backgroundColor: `var(--${p.color})` }}
          >
            {initialOf(p.name)}
          </motion.span>
        ))}
      </AnimatePresence>
      {hidden > 0 && (
        <span className={`ml-1 text-xs tabular-nums ${onPaper ? "text-paper-muted" : "text-text-muted"}`}>+{hidden}</span>
      )}
    </div>
  );
}
