"use client";

import { useLayoutEffect, useRef } from "react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";

type Props = { file: File };

// Карточка с фото и бегущей линией Vista — docs/SPEC.md «Сканирование»
export function ScanPreview({ file }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);

  // src пишем в DOM, а не в state: новый URL на каждый запуск — StrictMode-cleanup не оставит отозванный.
  // Layout-эффект — src стоит до первой отрисовки, без вспышки alt-текста.
  useLayoutEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    if (imgRef.current) imgRef.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring.smooth}
      className="flex flex-col items-center gap-5"
    >
      <div className="relative aspect-[3/4] w-64 overflow-hidden rounded-[20px] border border-border bg-surface-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL локального фото, next/image тут не нужен */}
        <img ref={imgRef} alt="Zdjęcie paragonu" className="h-full w-full object-cover" />
        {/* Обёртка во всю высоту: translateY 100% = высота карточки, анимируем только transform */}
        <motion.div
          aria-hidden
          className="absolute inset-0"
          initial={{ y: "0%" }}
          animate={{ y: "100%" }}
          // Декоративный цикл, не реакция на ввод — поэтому не spring
          transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
        >
          <div className="h-0.5 w-full bg-vista shadow-[0_0_16px_4px_var(--vista)]" />
        </motion.div>
      </div>
      <p role="status" className="text-base text-text-muted">
        Czytam paragon…
      </p>
    </motion.div>
  );
}
