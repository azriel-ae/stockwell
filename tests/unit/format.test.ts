import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

describe("formatting", () => {
  it("formats IDR without decimals using Indonesian grouping", () => {
    // Node's ICU may insert a (non-breaking) space between Rp and the amount.
    expect(formatCurrency(1234567, "IDR")).toMatch(/^Rp[\s\u00a0]?1\.234\.567$/);
    expect(formatCurrency(0, "IDR")).toMatch(/^Rp[\s\u00a0]?0$/);
  });

  it("formats null money as a dash", () => {
    expect(formatCurrency(null, "IDR")).toBe("—");
    expect(formatCurrency(undefined, "IDR")).toBe("—");
  });

  it("formats USD with two decimals", () => {
    expect(formatCurrency(12.5, "USD")).toBe("$12.50");
  });

  it("formats quantities with Indonesian grouping", () => {
    expect(formatNumber(1234)).toBe("1.234");
    expect(formatNumber(null)).toBe("—");
  });

  it("renders dates without throwing on bad input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(typeof formatDate("2026-11-26T00:00:00Z")).toBe("string");
  });
});
