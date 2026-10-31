"use client";

import { useEffect, useId, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { spring } from "@/lib/motion";

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode };

const CLOSE_OFFSET = 100; // px вниз
const CLOSE_VELOCITY = 500; // px/с вниз

// Общий bottom sheet: smooth, тянуть вниз / Esc / тап по фону — закрыть. Переиспользует фаза 4 (ShareSheet)
export function Sheet({ open, onClose, title, children }: Props) {
  const titleId = useId();
  const drag = useDragControls();

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
      {open && (
        <>
          <motion.div
            aria-hidden
            className="fixed inset-0 z-40 bg-oxford/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring.smooth}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[440px] rounded-t-[20px] border-t border-border bg-surface-2 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.smooth}
            // Тянется только за шапку: в поле ввода вертикальный жест — выделение текста, а не закрытие
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > CLOSE_OFFSET || info.velocity.y > CLOSE_VELOCITY) onClose();
            }}
          >
            <div className="cursor-grab touch-none pt-3 pb-2" onPointerDown={(event) => drag.start(event)}>
              <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
              <h2 id={titleId} className="text-xl font-medium tracking-[-0.01em]">
                {title}
              </h2>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
