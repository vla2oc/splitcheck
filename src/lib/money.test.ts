import { describe, expect, test } from "vitest";
import { formatAmount, formatPLN, parsePLN } from "@/lib/money";

// Intl ставит NBSP перед «zł» и между тысячами — нормализуем для сравнения
const plain = (s: string) => s.replace(/ /g, " ");

describe("formatPLN", () => {
  test("гроши → злотые с запятой", () => {
    expect(plain(formatPLN(21450))).toBe("214,50 zł");
    expect(plain(formatPLN(0))).toBe("0,00 zł");
    expect(plain(formatPLN(5))).toBe("0,05 zł");
  });

  test("округляет дробные гроши от useSpring", () => {
    expect(plain(formatPLN(21449.6))).toBe("214,50 zł");
    expect(plain(formatPLN(21449.4))).toBe("214,49 zł");
  });
});

describe("formatAmount", () => {
  test("число без валюты, округляет как formatPLN", () => {
    expect(plain(formatAmount(16000))).toBe("160,00");
    expect(plain(formatAmount(21449.6))).toBe("214,50");
  });

  test("совпадает с formatPLN посимвольно, минус « zł»", () => {
    for (const g of [0, 5, 16000, 121450, 1214500, 123456789]) {
      expect(formatPLN(g)).toBe(`${formatAmount(g)}\u00a0zł`);
    }
  });
});

describe("parsePLN", () => {
  test("запятая, точка, целые", () => {
    expect(parsePLN("214,50")).toBe(21450);
    expect(parsePLN("214.50")).toBe(21450);
    expect(parsePLN("214")).toBe(21400);
    expect(parsePLN("214,5")).toBe(21450);
  });

  test("zł и пробелы", () => {
    expect(parsePLN(" 214,50 zł ")).toBe(21450);
    expect(parsePLN("214,50zł")).toBe(21450);
  });

  test("обратим к formatPLN, включая NBSP-разделитель тысяч", () => {
    for (const g of [0, 5, 21450, 121450, 1214500]) {
      expect(parsePLN(formatPLN(g))).toBe(g);
    }
  });

  test("мусор → null", () => {
    for (const s of ["", "zł", "abc", "-3,00", "1,234", "1,2,3", "12,", ",50"]) {
      expect(parsePLN(s)).toBeNull();
    }
  });
});
