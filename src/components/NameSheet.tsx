"use client";

import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Sheet } from "@/components/Sheet";
import { spring } from "@/lib/motion";

type Props = { open: boolean; onClose: () => void; onSubmit: (name: string) => void };

// Имя спрашиваем только при первом тапе гостя — docs/SPEC.md «Продуктовые правила»
export function NameSheet({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  function submit(event: FormEvent) {
    event.preventDefault(); // Enter в поле = «Gotowe»
    if (!trimmed) return;
    onSubmit(trimmed);
    setName("");
  }

  return (
    <Sheet open={open} onClose={onClose} title="Jak masz na imię?">
      <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Imię"
          placeholder="np. Ania"
          autoComplete="given-name"
          enterKeyHint="done"
          maxLength={24}
          // 16px — iOS не зумит поле при фокусе
          className="h-12 rounded-2xl border border-border bg-surface-1 px-4 text-base outline-none placeholder:text-text-muted focus:border-vista"
        />
        <motion.button
          type="submit"
          disabled={!trimmed}
          whileTap={trimmed ? { scale: 0.96 } : undefined}
          transition={spring.snappy}
          className="h-12 rounded-full bg-vista font-medium text-on-vista hover:bg-vista-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vista disabled:opacity-40"
        >
          Gotowe
        </motion.button>
      </form>
    </Sheet>
  );
}
