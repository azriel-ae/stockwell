import { describe, expect, it } from "vitest";
import { applyMovement, expectedStockFromLedger, stockStatus } from "@/lib/stock";

describe("stockStatus", () => {
  it("marks zero stock as out of stock regardless of minimum", () => {
    expect(stockStatus(0, 0)).toBe("out_of_stock");
    expect(stockStatus(0, 10)).toBe("out_of_stock");
  });

  it("marks stock at or below a positive minimum as low stock", () => {
    expect(stockStatus(5, 5)).toBe("low_stock");
    expect(stockStatus(3, 5)).toBe("low_stock");
    expect(stockStatus(6, 5)).toBe("in_stock");
  });

  it("treats minimum 0 as no low-stock alerting", () => {
    expect(stockStatus(1, 0)).toBe("in_stock");
    expect(stockStatus(500, 0)).toBe("in_stock");
  });
});

describe("applyMovement", () => {
  it("adds quantity for stock in", () => {
    expect(applyMovement(10, "in", 5)).toEqual({ ok: true, resultingStock: 15 });
  });

  it("subtracts quantity for stock out", () => {
    expect(applyMovement(10, "out", 4)).toEqual({ ok: true, resultingStock: 6 });
  });

  it("rejects stock out below zero", () => {
    const result = applyMovement(3, "out", 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Insufficient stock");
  });

  it("rejects negative resulting adjustments", () => {
    const result = applyMovement(2, "adjustment", -5);
    expect(result.ok).toBe(false);
  });

  it("applies signed adjustments", () => {
    expect(applyMovement(10, "adjustment", -3)).toEqual({ ok: true, resultingStock: 7 });
    expect(applyMovement(10, "adjustment", 3)).toEqual({ ok: true, resultingStock: 13 });
  });

  it("rejects zero adjustments and non-integer quantities", () => {
    expect(applyMovement(10, "adjustment", 0).ok).toBe(false);
    expect(applyMovement(10, "in", 1.5).ok).toBe(false);
    expect(applyMovement(10, "out", 0).ok).toBe(false);
  });
});

describe("expectedStockFromLedger", () => {
  it("returns the last resulting stock", () => {
    const ledger = [
      { previousStock: 0, resultingStock: 10 },
      { previousStock: 10, resultingStock: 7 },
      { previousStock: 7, resultingStock: 12 },
    ];
    expect(expectedStockFromLedger(ledger)).toBe(12);
  });

  it("returns null for an empty ledger", () => {
    expect(expectedStockFromLedger([])).toBeNull();
  });
});
