"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, stagger, type Variants } from "motion/react";
import { CaptureButton } from "@/components/CaptureButton";
import { ScanPreview } from "@/components/ScanPreview";
import { spring } from "@/lib/motion";
import { httpReceiptParser } from "@/lib/receipt/httpParser";
import type { ReceiptParser } from "@/lib/receipt/types";
import { useSessionStore } from "@/lib/store";

// Единственная точка подмены парсера: фото → POST /api/parse нашего бэкенда (Claude), ?demo → демо-чек
const parser: ReceiptParser = httpReceiptParser;

const enter: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring.smooth },
};

export default function Home() {
  const router = useRouter();
  const createSession = useSessionStore((state) => state.createSession);
  const [file, setFile] = useState<File | null>(null);

  async function handleFile(picked: File) {
    setFile(picked);
    try {
      const id = createSession(await parser.parse(picked));
      router.push(`/s/${id}`);
    } catch (error) {
      console.warn("[parse] failed", error);
      setFile(null); // парсер упал — назад к кнопкам, а не вечный скан
    }
  }

  return (
    <motion.main
      initial="hidden"
      animate="show"
      transition={{ delayChildren: stagger(0.06) }}
      className="mx-auto flex w-full max-w-[440px] flex-1 flex-col items-center justify-center gap-10 px-4 text-center"
    >
      {file ? (
        <ScanPreview file={file} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <motion.h1
              variants={enter}
              className="text-[32px] leading-tight font-medium tracking-[-0.02em] leading-relaxed p-2"
            >
              Podziel rachunek <br />w 10{" "}
              <span className="font-serif italic">sekund</span>
            </motion.h1>
            <motion.p variants={enter} className="text-base text-text-muted">
              Bez rejestracji. Bez aplikacji.
            </motion.p>
          </div>
          <motion.div variants={enter}>
            <CaptureButton onFile={handleFile} />
          </motion.div>
        </>
      )}
    </motion.main>
  );
}
