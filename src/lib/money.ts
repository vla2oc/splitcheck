const plnFormat = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const amountFormat = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Округляет вход сам: useSpring (фаза 3) отдаёт дробные гроши, компонентам округлять запрещено.
export function formatPLN(grosze: number): string {
  return plnFormat.format(Math.round(grosze) / 100);
}

// То же число без «zł» — для «Rozdzielono 160,00 / 214,50 zł», где валюта стоит один раз
export function formatAmount(grosze: number): string {
  return amountFormat.format(Math.round(grosze) / 100);
}

// Принимает «214,50» / «214.50» / «214», с «zł» и пробелами (в т.ч. NBSP) или без. Иначе null.
export function parsePLN(input: string): number | null {
  const cleaned = input.replace(/zł/gi, "").replace(/\s/g, "");
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const zloty = Number(match[1]);
  const grosze = Number((match[2] ?? "").padEnd(2, "0"));
  return zloty * 100 + grosze;
}
