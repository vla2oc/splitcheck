"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { spring } from "@/lib/motion";

// id — чтобы повторный «Skopiowano» показался заново, а не слился с текущим
export type ToastMessage = { id: number; text: string };

type Props = { toast: ToastMessage | null; onHide: () => void };

const VISIBLE_MS = 1800;

// Короткое подтверждение сверху экрана, исчезает само — docs/SPEC.md «тост „Skopiowano“»
export function Toast({ toast, onHide }: Props) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onHide, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast, onHide]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+16px)]"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={spring.snappy}
            className="rounded-full border border-border bg-surface-2 px-4 py-2 text-sm font-medium"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
