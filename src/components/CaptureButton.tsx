"use client";

import type { ChangeEvent } from "react";
import { Camera } from "lucide-react";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";

type Props = { onFile: (file: File) => void };

// Две точки входа в один и тот же сценарий: камера (capture) и галерея (без capture) — docs/SPEC.md «Главная»
export function CaptureButton({ onFile }: Props) {
  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // тот же файл можно выбрать повторно
    if (file) onFile(file);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {/* Единственный допустимый glow — docs/SPEC.md «Цвета» */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-16 rounded-full"
          style={{ background: "radial-gradient(closest-side, var(--vista-soft), transparent)" }}
        />
        <motion.label
          whileTap={{ scale: 0.96 }}
          transition={spring.snappy}
          className="relative flex h-14 cursor-pointer items-center gap-2.5 rounded-full bg-vista px-7 text-[17px] font-medium text-on-vista hover:bg-vista-strong has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-vista"
        >
          <Camera aria-hidden size={22} strokeWidth={2} />
          Zrób zdjęcie paragonu
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
        </motion.label>
      </div>
      <motion.label
        whileTap={{ scale: 0.96 }}
        transition={spring.snappy}
        className="flex min-h-12 cursor-pointer items-center px-4 text-[15px] text-vista underline-offset-4 hover:underline has-[input:focus-visible]:underline"
      >
        Wybierz z galerii
        <input type="file" accept="image/*" className="sr-only" onChange={pick} />
      </motion.label>
    </div>
  );
}
