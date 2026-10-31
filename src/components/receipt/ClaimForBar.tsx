"use client";

import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import type { Participant } from "@/lib/types";

// Первая буква имени; Array.from — чтобы не резать эмодзи/суррогатные пары
const initialOf = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

type Props = {
  participants: Participant[];
  meId: string;
  activeId: string;
  onSelect: (participantId: string) => void;
};

// «Zaznaczam za: [Ja] [Ania] [Kuba]» — только хост. Тап по строке чека отмечает её за активного.
// «[+]» — в NOT_NOW.md: только уже вошедшие участники
export function ClaimForBar({ participants, meId, activeId, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-text-muted">Zaznaczam za:</span>
      <div role="group" aria-label="Zaznaczam za" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {participants.map((p) => {
          const active = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(p.id)}
              className="relative flex h-10 shrink-0 items-center gap-2 rounded-full bg-surface-1 pr-4 pl-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vista"
            >
              {active && (
                <motion.span
                  layoutId="claim-for-indicator"
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2 border-vista"
                  transition={spring.snappy}
                />
              )}
              <span
                className="flex size-7 items-center justify-center rounded-full text-xs font-medium text-oxford"
                style={{ backgroundColor: `var(--${p.color})` }}
              >
                {initialOf(p.name)}
              </span>
              <span className={active ? "text-text" : "text-text-muted"}>{p.id === meId ? "Ja" : p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
