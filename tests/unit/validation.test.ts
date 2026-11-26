import { describe, expect, it } from "vitest";
import {
  categoryCreateSchema,
  movementCreateSchema,
  productCreateSchema,
  settingsUpdateSchema,
  supplierCreateSchema,
} from "@/lib/validation";
import { DrivebaseError } from "@/lib/drivebase/errors";
import { fromDrivebaseError } from "@/lib/services/errors";

describe("input validation (zod schemas)", () => {
  it("rejects invalid SKUs", () => {
    expect(productCreateSchema.safeParse({ sku: "-bad sku!", name: "x" }).success).toBe(false);
    expect(productCreateSchema.safeParse({ sku: "SW-001", name: "x" }).success).toBe(true);
  });

  it("rejects negative prices and quantities", () => {
    const result = productCreateSchema.safeParse({
      sku: "SW-1",
      name: "x",
      purchasePrice: -5,
      stockQuantity: -1,
    });
    expect(result.success).toBe(false);
  });

  it("requires a reason for stock adjustments", () => {
    const noNotes = movementCreateSchema.safeParse({
      productId: "p1",
      movementType: "adjustment",
      quantity: -2,
      idempotencyKey: "key-12345678",
    });
    expect(noNotes.success).toBe(false);

    const withNotes = movementCreateSchema.safeParse({
      productId: "p1",
      movementType: "adjustment",
      quantity: -2,
      notes: "Damaged in transit",
      idempotencyKey: "key-12345678",
    });
    expect(withNotes.success).toBe(true);
  });

  it("requires positive quantity for in/out movements", () => {
    const negative = movementCreateSchema.safeParse({
      productId: "p1",
      movementType: "in",
      quantity: -3,
      idempotencyKey: "key-12345678",
    });
    expect(negative.success).toBe(false);
  });

  it("validates supplier email", () => {
    const bad = supplierCreateSchema.safeParse({ name: "ACME", email: "not-an-email" });
    expect(bad.success).toBe(false);
    const good = supplierCreateSchema.safeParse({ name: "ACME", email: "a@b.co" });
    expect(good.success).toBe(true);
  });

  it("validates category name length", () => {
    expect(categoryCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: "Office supplies" }).success).toBe(true);
  });

  it("restricts currency to the supported set", () => {
    expect(settingsUpdateSchema.safeParse({
      businessName: "X",
      businessDescription: "",
      currency: "GBP",
      defaultUnit: "pcs",
      lowStockThreshold: 5,
    }).success).toBe(false);
  });
});

describe("Drivebase error translation", () => {
  it("maps 401 to a human message", () => {
    const err = fromDrivebaseError(new DrivebaseError("unauthorized", "nope", 401));
    expect(err.status).toBe(401);
    expect(err.message).toContain("API key");
  });

  it("maps validation_error details into field errors", () => {
    const db = new DrivebaseError("validation_error", "Record failed schema validation", 422, [
      { column: "email", message: "Expected a valid email address" },
    ]);
    const err = fromDrivebaseError(db);
    expect(err.status).toBe(422);
    expect(err.fieldErrors?.email).toContain("valid email");
  });

  it("maps network errors to 502", () => {
    const err = fromDrivebaseError(new DrivebaseError("network_error", "unreachable", 0));
    expect(err.status).toBe(502);
    expect(err.code).toBe("network_error");
  });

  it("maps rate limiting to 429 with a friendly message", () => {
    const err = fromDrivebaseError(new DrivebaseError("rate_limited", "slow down", 429));
    expect(err.status).toBe(429);
    expect(err.message).toContain("rate limit");
  });
});
