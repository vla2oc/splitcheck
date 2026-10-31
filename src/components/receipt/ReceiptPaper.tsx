import type { ReactNode } from "react";

// Дата как на кассовом чеке: «31.10.2026 19:42»
const dateFormat = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" });

// Декоративный штрихкод из id сессии: на символ — бар, пробел, бар, пробел шириной 1–4 модуля из его битов.
// Модуль 2px: id сессии — 10 символов (nanoid(10)), при 1px штрихкод выходит узким, ~90px.
// Детерминированно — одинаково на сервере и клиенте. Один linear-gradient вместо десятков span.
const MODULE = 2;

function barcode(code: string): { width: number; backgroundImage: string } {
  const widths = [2, 1, 1, 1]; // стартовый guard
  for (const char of code) {
    const c = char.charCodeAt(0);
    widths.push((c & 3) + 1, ((c >> 2) & 1) + 1, ((c >> 3) & 3) + 1, ((c >> 5) & 1) + 1);
  }
  widths.push(1, 1, 2); // стоповый guard
  let x = 0;
  const stops = widths.map((w, i) => {
    const color = i % 2 === 0 ? "var(--oxford)" : "transparent";
    const stop = `${color} ${x}px ${x + w * MODULE}px`;
    x += w * MODULE;
    return stop;
  });
  return { width: x, backgroundImage: `linear-gradient(90deg, ${stops.join(", ")})` };
}

type Props = { title?: string; subtitle?: string; createdAt: number; code?: string; children: ReactNode };

// Бумага чека: шапка, содержимое, штрихкод, «Dziękujemy», волнистый край (.paper::after в globals.css).
// Ширина 320px — кратна шагу края 20px. Скролл — внутренний div: край на .paper не уезжает со строками.
// Высоту ограничивает родитель через --paper-max-h.
export function ReceiptPaper({ title, subtitle, createdAt, code, children }: Props) {
  return (
    <div className="paper relative mx-auto w-[320px] font-mono text-sm text-oxford tabular-nums">
      <div className="overflow-y-auto overscroll-contain px-5 pt-6 pb-5" style={{ maxHeight: "var(--paper-max-h, none)" }}>
        <header className="flex flex-col items-center gap-1 text-center">
          {title && <h2 className="text-base font-semibold tracking-wide uppercase">{title}</h2>}
          {subtitle && <p className="text-xs tracking-[0.2em] text-paper-muted uppercase">{subtitle}</p>}
          <p className="text-xs text-paper-muted">
            {dateFormat.format(createdAt)} · {timeFormat.format(createdAt)}
          </p>
        </header>
        <hr className="my-4 border-t border-dashed border-paper-rule" />
        {children}
        {code && (
          <div className="mt-6 flex flex-col items-center gap-1.5" aria-hidden>
            <div className="h-10" style={barcode(code)} />
            <span className="text-[11px] tracking-[0.3em] text-paper-muted">#{code}</span>
          </div>
        )}
        <p className="mt-5 flex items-center justify-center gap-2 text-paper-muted">
          Dziękujemy
          <span aria-hidden className="size-2 rounded-full bg-vista" />
        </p>
      </div>
    </div>
  );
}
