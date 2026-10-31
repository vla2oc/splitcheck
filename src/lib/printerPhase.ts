// Конечный автомат принтера чека — без React и motion, чтобы проверять тестами (printerPhase.test.ts)
export type PrinterPhase = "printing" | "leaving" | "interactive";
export type PrinterAction = { type: "printed" } | { type: "left" };

// Переходы только через dispatch; лишнее событие (напр. повторный onAnimationComplete) игнорируется
export function printerReducer(phase: PrinterPhase, action: PrinterAction): PrinterPhase {
  if (action.type === "printed" && phase === "printing") return "leaving";
  if (action.type === "left" && phase === "leaving") return "interactive";
  return phase;
}

// printed: флаг «уже печатали» из sessionStorage; null — сервер/гидрация, флаг ещё не прочитан.
// reduced: prefers-reduced-motion. force: мимо флага (песочница, персональный чек), но не мимо reduced motion
export function skipsPrint(printed: boolean | null, reduced: boolean | null, force?: PrinterPhase): boolean {
  return reduced === true || (force ? force === "interactive" : printed === true);
}

export function resolvePrinterPhase(
  state: PrinterPhase,
  printed: boolean | null,
  reduced: boolean | null,
  force?: PrinterPhase,
): PrinterPhase | "pending" {
  if (printed === null && !force) return "pending";
  // Пропуск перекрывает только фазы печати; interactive остаётся как есть
  return skipsPrint(printed, reduced, force) && state !== "interactive" ? "interactive" : state;
}
