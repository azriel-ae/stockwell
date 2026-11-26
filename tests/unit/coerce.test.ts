import { describe, expect, it } from "vitest";
import { coerceBoolean, coerceNumber, coerceText, normalizeRecord } from "@/lib/drivebase/records";
import { buildQuery } from "@/lib/drivebase/records";

describe("value coercion (Google Sheets returns formatted strings)", () => {
  it("coerces numeric strings including thousands separators", () => {
    expect(coerceNumber("42")).toBe(42);
    expect(coerceNumber("1,234.5")).toBe(1234.5);
    expect(coerceNumber("")).toBeNull();
    expect(coerceNumber("abc")).toBeNull();
    expect(coerceNumber(null)).toBeNull();
  });

  it("coerces boolean-ish strings", () => {
    expect(coerceBoolean("TRUE")).toBe(true);
    expect(coerceBoolean("false")).toBe(false);
    expect(coerceBoolean("")).toBeNull();
    expect(coerceBoolean("maybe")).toBeNull();
  });

  it("coerces text safely", () => {
    expect(coerceText(12)).toBe("12");
    expect(coerceText(null)).toBeNull();
  });

  it("normalizes a record payload against column types", () => {
    const columns = [
      { name: "qty", type: "number" as const },
      { name: "active", type: "boolean" as const },
      { name: "sku", type: "text" as const },
    ];
    const out = normalizeRecord(columns, {
      id: "r1",
      qty: "15",
      active: "true",
      sku: "SW-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(out.qty).toBe(15);
    expect(out.active).toBe(true);
    expect(out.sku).toBe("SW-1");
    expect(out.id).toBe("r1");
  });
});

describe("buildQuery (verified Drivebase query syntax)", () => {
  it("serializes filters, operators, sort, fields and expand", () => {
    const q = buildQuery({
      limit: 50,
      offset: 25,
      sort: "-__created_at",
      fields: ["sku", "name"],
      expand: ["category_id"],
      filters: [
        { column: "sku", value: "SW-1" },
        { column: "name", op: "contains", value: "paper" },
        { column: "status", op: "in", value: "a,b" },
      ],
    });
    expect(q).toContain("limit=50");
    expect(q).toContain("offset=25");
    expect(q).toContain("sort=-__created_at");
    expect(q).toContain("fields=sku%2Cname");
    expect(q).toContain("expand=category_id");
    expect(q).toContain("filter%5Bsku%5D=SW-1");
    expect(q).toContain("filter%5Bname%5D.contains=paper");
    expect(q).toContain("filter%5Bstatus%5D.in=a%2Cb");
  });

  it("keeps eq implicit", () => {
    const q = buildQuery({ filters: [{ column: "a", op: "eq", value: "1" }] });
    expect(q).toBe("?filter%5Ba%5D=1");
  });
});
