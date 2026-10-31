"use client";

import { motion } from "motion/react";
import { AnimatedAmount } from "@/components/AnimatedAmount";
import { formatAmount } from "@/lib/money";
import { spring } from "@/lib/motion";

type Props = { totalGrosze: number; allocatedGrosze: number };

// Прогресс «Rozdzielono X / Y zł» над бумагой чека; название и сумма — на самой бумаге (docs/DECISIONS.md)
export function ReceiptHeader({ totalGrosze, allocatedGrosze }: Props) {
  const progress = totalGrosze > 0 ? allocatedGrosze / totalGrosze : 0;

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="h-3 overflow-hidden rounded-full bg-vista/20">
          {/* scaleX, а не width: анимируем только transform */}
          <motion.div
            className="h-full origin-left bg-vista"
            initial={false}
            animate={{ scaleX: progress }}
            transition={spring.smooth}
          />
        </div>
        <p className="text-base text-text-muted">
          Rozdzielono{" "}
          <span className="font-semibold text-text">
            <AnimatedAmount grosze={allocatedGrosze} format={formatAmount} /> /{" "}
            <AnimatedAmount grosze={totalGrosze} format={formatAmount} /> zł
          </span>
        </p>
      </div>
    </header>
  );
}
