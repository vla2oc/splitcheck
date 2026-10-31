import { describe, expect, test } from "vitest";
import { printerReducer, resolvePrinterPhase, skipsPrint } from "@/lib/printerPhase";

describe("printerReducer", () => {
  test("printing → leaving → interactive", () => {
    expect(printerReducer("printing", { type: "printed" })).toBe("leaving");
    expect(printerReducer("leaving", { type: "left" })).toBe("interactive");
  });

  test("лишние события игнорируются", () => {
    expect(printerReducer("leaving", { type: "printed" })).toBe("leaving");
    expect(printerReducer("interactive", { type: "printed" })).toBe("interactive");
    expect(printerReducer("printing", { type: "left" })).toBe("printing");
  });
});

describe("resolvePrinterPhase", () => {
  test("сервер/гидрация (флаг не прочитан) — pending", () => {
    expect(resolvePrinterPhase("printing", null, null)).toBe("pending");
  });

  test("первый раз на устройстве — печать", () => {
    expect(resolvePrinterPhase("printing", false, false)).toBe("printing");
    expect(resolvePrinterPhase("leaving", false, false)).toBe("leaving");
  });

  test("флаг есть (F5, realtime-обновление) — сразу interactive", () => {
    expect(resolvePrinterPhase("printing", true, false)).toBe("interactive");
  });

  test("reduced motion — сразу interactive, даже при force=printing (персональный чек)", () => {
    expect(resolvePrinterPhase("printing", false, true)).toBe("interactive");
    expect(resolvePrinterPhase("printing", false, true, "printing")).toBe("interactive");
    expect(skipsPrint(false, true, "printing")).toBe(true);
  });

  test("force=printing печатает мимо флага; force=interactive — без печати", () => {
    expect(resolvePrinterPhase("printing", true, false, "printing")).toBe("printing");
    expect(resolvePrinterPhase("printing", null, false, "printing")).toBe("printing");
    expect(resolvePrinterPhase("printing", false, false, "interactive")).toBe("interactive");
  });

  test("reduced motion ещё не известен (null) — не мешает печати", () => {
    expect(resolvePrinterPhase("printing", false, null)).toBe("printing");
  });
});
