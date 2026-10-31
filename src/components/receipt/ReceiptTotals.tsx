"use client";

import { AnimatePresence, motion } from "motion/react";
import { AnimatedAmount } from "@/components/AnimatedAmount";
import { formatAmount } from "@/lib/money";
import { spring } from "@/lib/motion";

// Все суммы — из split.ts на стороне вызывающего; здесь только вывод.
// canEdit — тот же, что у строк: правый отступ = слот галочки (+ карандаш хоста), суммы в одной колонке с ценами
type Props = {
  itemsGrosze: number;
  serviceGrosze: number;
  unallocatedGrosze: number;
  totalGrosze: number;
  canEdit: boolean;
};

export function ReceiptTotals({ itemsGrosze, serviceGrosze, unallocatedGrosze, totalGrosze, canEdit }: Props) {
  return (
    <div className={`flex flex-col gap-1.5 ${canEdit ? "[--gutter:48px]" : "[--gutter:24px]"}`}>
      <hr className="mb-2.5 border-t border-dashed border-paper-rule" />
      <Row label="Suma" grosze={itemsGrosze} />
      {serviceGrosze > 0 && <Row label="Serwis" grosze={serviceGrosze} />}
      <AnimatePresence initial={false}>
        {unallocatedGrosze > 0 && (
          <motion.div
            key="unallocated"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring.smooth}
            // Vista текстом на бумаге ≈ 2:1 — нечитаемо; акцент — фоном, текст Oxford (docs/DECISIONS.md)
            className="-mx-2 flex items-baseline justify-between gap-4 rounded-md bg-vista/45 py-0.5 pl-2 pr-[calc(var(--gutter)+8px)]"
          >
            <span>Nierozdzielone</span>
            <AnimatedAmount grosze={unallocatedGrosze} format={formatAmount} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Двойная черта перед итогом — как «====» на кассовой ленте */}
      <hr className="my-2.5 border-t-[3px] border-double border-oxford/45" />
      <div className="flex items-baseline justify-between gap-4 pr-(--gutter) text-base font-semibold">
        <span>RAZEM</span>
        <AnimatedAmount grosze={totalGrosze} format={formatAmount} />
      </div>
    </div>
  );
}

function Row({ label, grosze }: { label: string; grosze: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 pr-(--gutter)">
      <span>{label}</span>
      <AnimatedAmount grosze={grosze} format={formatAmount} />
    </div>
  );
}
