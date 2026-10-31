// Дословно из docs/SPEC.md «Контракт распознавания». Мок и будущий /api/parse-receipt отдают один тип.
export type ParsedReceipt = {
  merchant?: string;
  currency: "PLN";
  items: { name: string; priceGrosze: number }[]; // количество уже развёрнуто в строки
  serviceGrosze: number; // сервис/чаевые, 0 если нет
  totalGrosze: number;
};

export interface ReceiptParser {
  parse(file: File): Promise<ParsedReceipt>;
}
