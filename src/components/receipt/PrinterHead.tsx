// Высота корпуса и положение щели — ReceiptPrinter стыкует по ним маску бумаги
export const PRINTER_HEIGHT = 84;
export const SLOT_FROM_BOTTOM = 16; // низ щели от низа корпуса
export const SLOT_HEIGHT = 10;

// Корпус принтера в оттенках Oxford: блик сверху, индикатор, щель внизу.
// Шире бумаги, на 360px — во всю ширину экрана (min(100vw, 376px)), щель 332px > бумаги 320px
// Статичный: всё движение принтера — пружины в ReceiptPrinter (дрожь keyframes убрана — минимализм, docs/DECISIONS.md)
export function PrinterHead() {
  return (
    <div
      aria-hidden
      className="relative w-[min(100vw,376px)] overflow-hidden rounded-[24px] bg-[#1c1645] shadow-[0_10px_30px_rgba(4,2,16,0.6)]"
      style={{ height: PRINTER_HEIGHT }}
    >
      <div className="absolute inset-x-0 top-0 h-[18px] bg-[rgba(146,172,255,0.18)]" />
      <div className="absolute top-[30px] right-6 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-vista shadow-[0_0_8px_var(--vista)]" />
      </div>
      <div
        className="absolute left-1/2 w-[332px] max-w-[calc(100%-16px)] -translate-x-1/2 rounded-full bg-[#07041a]"
        style={{ bottom: SLOT_FROM_BOTTOM, height: SLOT_HEIGHT }}
      />
    </div>
  );
}
