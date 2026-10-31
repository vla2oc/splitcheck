"use client";

import { useEffect, useReducer, useRef, useSyncExternalStore, type ReactNode } from "react";
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PRINTER_HEIGHT, PrinterHead, SLOT_FROM_BOTTOM, SLOT_HEIGHT } from "@/components/receipt/PrinterHead";
import { receiptSpring } from "@/lib/motion";
import { printerReducer, resolvePrinterPhase, skipsPrint, type PrinterPhase } from "@/lib/printerPhase";

export type { PrinterPhase };

export const printedKey = (sessionId: string) => `splitcheck:printed:${sessionId}`;

function readPrinted(sessionId: string): boolean {
  try {
    return sessionStorage.getItem(printedKey(sessionId)) !== null;
  } catch {
    return false;
  }
}

const noopSubscribe = () => () => {};

// Бумага начинает выходить, когда принтер почти приземлился
const PRINT_DELAY = 0.3;
// Рывок отрыва: поворот вокруг щели (верх бумаги), на длинном чеке низ уходит вбок ≤ ~30px
const TUG_DEG = -1.2;

const scaled = <T extends { visualDuration: number }>(spring: T, slow: number) => ({
  ...spring,
  visualDuration: spring.visualDuration * slow,
});

// Верх маски — середина щели: бумага выходит «из глубины» щели и свисает на передний край корпуса
const MASK_OVERLAP = SLOT_FROM_BOTTOM + SLOT_HEIGHT / 2;

type Props = {
  sessionId: string;
  lines: number; // от длины чека зависит длительность печати
  force?: PrinterPhase; // мимо флага: песочница (?phase=) и персональный чек (печатается при каждом открытии)
  duration?: number; // своя длительность печати вместо расчёта по lines (персональный чек — receiptSpring.personal)
  slow?: number; // песочница: ?slow=1 → ×4
  children: ReactNode; // бумага
};

// Печать один раз на сессию на устройство: флаг в sessionStorage пишется, когда принтер ушёл.
// Флаг есть / reduced motion → сразу interactive; realtime-обновления и F5 печать не перезапускают.
export function ReceiptPrinter({ sessionId, lines, force, duration, slow = 1, children }: Props) {
  const [state, dispatch] = useReducer(printerReducer, "printing");
  // На сервере и при гидрации — null: до монтирования бумага скрыта, без hydration mismatch
  const printed = useSyncExternalStore(noopSubscribe, () => readPrinted(sessionId), () => null);
  const reduced = useReducedMotion();

  const skip = skipsPrint(printed, reduced, force);
  const phase = resolvePrinterPhase(state, printed, reduced, force);
  const printDuration = (duration ?? Math.min(2.4, Math.max(1.2, 1.2 + lines * 0.05))) * slow;
  const collapse = scaled(receiptSpring.collapse, slow);
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase === "printing") navigator.vibrate?.([8, 110, 8, 110, 8]);
  }, [phase]);

  useEffect(() => {
    if (phase !== "interactive" || force) return;
    try {
      sessionStorage.setItem(printedKey(sessionId), "1");
    } catch {
      // приватный режим — печать повторится при F5, не страшно
    }
  }, [phase, force, sessionId]);

  if (phase === "pending") return <div className="invisible">{children}</div>;

  // Конец печати: рывок отрыва → принтер уходит, бумага качается на пружине и успокаивается
  async function tearOff() {
    if (phase !== "printing") return;
    const paper = paperRef.current;
    navigator.vibrate?.(12);
    if (paper) await animate(paper, { rotate: TUG_DEG }, scaled(receiptSpring.tug, slow));
    dispatch({ type: "printed" });
    if (paper) animate(paper, { rotate: 0 }, scaled(receiptSpring.tear, slow));
  }

  // Маска, тень щели и нахлёст на корпус — только пока принтер на месте: снимаются одним layout-переходом с его уходом
  const withPrinter = phase === "printing";
  const animated = !skip; // при пропуске печати — ни одного начального движения

  return (
    <div className="relative flex flex-col items-center">
      {/* popLayout: уходящий принтер сразу выпадает из потока, бумага едет вверх одновременно с ним.
          Без initial={false}: принтер въезжает сверху на монтировании */}
      <AnimatePresence mode="popLayout" onExitComplete={() => dispatch({ type: "left" })}>
        {phase === "printing" && (
          <motion.div
            key="printer"
            initial={{ y: -PRINTER_HEIGHT / 3, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1, transition: scaled(receiptSpring.arrive, slow) }}
            exit={{ y: -PRINTER_HEIGHT / 2, opacity: 0, scale: 0.96 }}
            transition={collapse}
          >
            <PrinterHead />
          </motion.div>
        )}
      </AnimatePresence>
      {/* position, не layout: смена высоты бумаги (итоги, правка цены) не должна растягивать текст scaleY */}
      <motion.div
        layout="position"
        transition={collapse}
        className="relative z-10"
        // clip-path, а не overflow: режем только верх (щель), волнистый край и тень снизу остаются
        style={{
          marginTop: withPrinter ? -MASK_OVERLAP : 0,
          clipPath: withPrinter ? "inset(0 -48px -64px -48px)" : undefined,
        }}
      >
        {withPrinter && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5 bg-gradient-to-b from-[rgba(7,4,26,0.55)] to-transparent"
          />
        )}
        <motion.div
          ref={paperRef}
          initial={animated ? { y: "-100%" } : false}
          animate={{ y: 0 }}
          transition={{ ...receiptSpring.print(printDuration), delay: PRINT_DELAY * slow }}
          onAnimationComplete={tearOff}
          style={{ willChange: phase === "printing" ? "transform" : "auto", transformOrigin: "50% 0%" }}
          // pb = высота волнистого края (.paper::after, bottom: -10px): иначе -100% не прячет его над щелью
          className="pb-2.5"
        >
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
}
