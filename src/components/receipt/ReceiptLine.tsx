"use client";

import { memo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Pencil } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AvatarStack } from "@/components/AvatarStack";
import { formatAmount, formatPLN, parsePLN } from "@/lib/money";
import { receiptSpring, spring } from "@/lib/motion";
import type { Item, Participant } from "@/lib/types";

type Props = {
  item: Item;
  claimers: Participant[]; // в порядке входа, как в split.ts
  meId: string | null;
  canEdit: boolean;
  // Стабильные колбэки с itemId: строка в memo, замыкание на строку его бы ломало
  onToggle: (itemId: string) => void;
  onPriceChange: (itemId: string, grosze: number) => void;
};

// Строка позиции на бумаге: тап = «моё» / «не моё», карандаш хоста — правка цены.
// Контейнер — div: карандаш и инпут не могут лежать внутри <button> строки
export const ReceiptLine = memo(function ReceiptLine({ item, claimers, meId, canEdit, onToggle, onPriceChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  // Enter/Esc уже решили судьбу правки — blur при размонтировании инпута её не повторяет
  const settled = useRef(false);

  const mine = meId !== null && claimers.some((p) => p.id === meId);
  const others = claimers.filter((p) => p.id !== meId);
  const who = claimers.map((p) => (p.id === meId ? "Ty" : p.name)).join(", ");
  const label = `${item.name}, ${formatPLN(item.priceGrosze)}${who ? `, wybrane przez: ${who}` : ""}`;

  function startEdit() {
    setDraft(formatAmount(item.priceGrosze));
    setInvalid(false);
    settled.current = false;
    setEditing(true);
  }

  function finish() {
    settled.current = true;
    setInvalid(false);
    setEditing(false);
  }

  // Невалидное по Enter — подсветка и правка продолжается; по blur — выходим, цена прежняя
  function save(fromBlur: boolean) {
    if (settled.current) return;
    const grosze = parsePLN(draft);
    if (grosze === null) {
      if (fromBlur) finish();
      else setInvalid(true);
      return;
    }
    if (grosze !== item.priceGrosze) onPriceChange(item.id, grosze);
    finish();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") save(false);
    if (event.key === "Escape") finish();
  }

  return (
    <motion.div
      whileTap={editing ? undefined : { scale: 0.985 }}
      transition={spring.snappy}
      // motion ставит tabIndex=0 любому не-button с whileTap — лишняя остановка Tab на строке; фокус — у кнопок внутри
      tabIndex={-1}
      className="relative -mx-2 flex items-start rounded-lg"
    >
      {/* Фон «моей» строки отдельным слоем: меняем opacity, а не background-color */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg bg-paper-mine"
        initial={false}
        animate={{ opacity: mine ? 1 : 0 }}
        transition={spring.snappy}
      />
      <button
        type="button"
        aria-pressed={mine}
        aria-label={label}
        onClick={() => onToggle(item.id)}
        className={`relative flex min-w-0 flex-1 flex-col gap-1 rounded-lg py-2 pl-2 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vista ${canEdit ? "pr-0" : "pr-2"}`}
      >
        <span className="flex w-full items-baseline gap-2">
          <span className="min-w-0 flex-1 break-words">{item.name}</span>
          {!editing && (
            <>
              <span className="shrink-0">{formatAmount(item.priceGrosze)}</span>
              {/* Слот фиксированной ширины — цены выровнены и без галочки */}
              <span className="relative flex size-4 shrink-0 self-center">
                <AnimatePresence initial={false}>
                  {mine && (
                    <motion.span
                      key="check"
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={receiptSpring.select}
                    >
                      <Check aria-hidden size={16} strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </>
          )}
        </span>
        {(others.length > 0 || claimers.length >= 2) && (
          <span className="flex w-full items-center justify-between gap-2 pr-6">
            <AvatarStack participants={others} tone="paper" />
            {claimers.length >= 2 && (
              <span className="rounded-full border border-paper-rule px-1.5 text-xs text-paper-muted">÷{claimers.length}</span>
            )}
          </span>
        )}
      </button>
      {editing && (
        <span className="relative flex items-center py-1 pr-2">
          <input
            autoFocus
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => save(true)}
            onFocus={(event) => event.target.select()}
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={`Cena: ${item.name}`}
            aria-invalid={invalid}
            className={`h-8 w-20 rounded-md border bg-white px-1.5 text-right font-mono text-base text-oxford tabular-nums outline-none ${invalid ? "border-danger" : "border-oxford/40 focus:border-oxford"}`}
          />
        </span>
      )}
      {canEdit && !editing && (
        <button
          type="button"
          onClick={startEdit}
          aria-label={`Zmień cenę: ${item.name}`}
          className="relative flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-paper-muted hover:text-oxford focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vista"
        >
          <Pencil aria-hidden size={14} />
        </button>
      )}
    </motion.div>
  );
});
