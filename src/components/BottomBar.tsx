"use client";

import { motion } from "motion/react";
import { AnimatedAmount } from "@/components/AnimatedAmount";
import { formatPLN } from "@/lib/money";
import { spring } from "@/lib/motion";
import { formatBlik } from "@/lib/store";

type Props = {
  shareGrosze: number;
  isHost: boolean;
  blikPhone?: string;
  onShare: () => void;
  onCopyBlik: () => void;
  // Гость: персональный чек; активна, когда у него есть хотя бы одна позиция
  canShowReceipt: boolean;
  onShowReceipt: () => void;
};

const pill =
  "h-12 shrink-0 rounded-full bg-vista px-6 font-medium text-on-vista hover:bg-vista-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vista";

// «Twoja część» + действие — docs/SPEC.md «Экраны → 3 → Нижняя панель»
export function BottomBar({ shareGrosze, isHost, blikPhone, onShare, onCopyBlik, canShowReceipt, onShowReceipt }: Props) {
  const showBlik = !isHost && blikPhone !== undefined;

  return (
    // z-20: над бумагой чека (z-10 в ReceiptPrinter), под шторками (z-40/50)
    <div className="sticky bottom-0 z-20 border-t border-border bg-oxford/95 pb-[calc(env(safe-area-inset-bottom)+16px)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3 px-4 pt-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-text-muted">Twoja część</span>
            {/* Пружина меняет текст каждый кадр — читалке отдаём только итоговое значение */}
            <span aria-hidden className="leading-none">
              <AnimatedAmount grosze={shareGrosze} format={formatPLN} className="text-[36px] leading-none" />
            </span>
            <span className="sr-only" aria-live="polite">
              {formatPLN(shareGrosze)}
            </span>
          </div>
          {isHost && (
            <motion.button type="button" onClick={onShare} whileTap={{ scale: 0.96 }} transition={spring.snappy} className={pill}>
              Udostępnij
            </motion.button>
          )}
          {!isHost && (
            <motion.button
              type="button"
              onClick={onShowReceipt}
              disabled={!canShowReceipt}
              whileTap={canShowReceipt ? { scale: 0.96 } : undefined}
              transition={spring.snappy}
              className="h-12 shrink-0 rounded-full border border-vista px-5 font-medium text-vista hover:bg-vista-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vista disabled:border-border disabled:text-text-muted disabled:hover:bg-transparent"
            >
              Pokaż mój paragon
            </motion.button>
          )}
        </div>
        {/* Гостю — отдельной строкой: рядом с суммой 36px на 390px не помещается */}
        {showBlik && (
          <motion.button
            type="button"
            onClick={onCopyBlik}
            whileTap={{ scale: 0.96 }}
            transition={spring.snappy}
            className={`${pill} w-full`}
          >
            Skopiuj numer BLIK · <span className="font-mono tabular-nums">{formatBlik(blikPhone)}</span>
          </motion.button>
        )}
      </div>
    </div>
  );
}
