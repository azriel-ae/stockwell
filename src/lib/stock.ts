/**
 * Stock computation — pure functions, unit-tested.
 * Status is always derived from actual stock vs minimum_stock, never stored.
 */

import type { MovementType, Product, StockStatus } from "./models";

export function stockStatus(stockQuantity: number, minimumStock: number): StockStatus {
  if (stockQuantity <= 0) return "out_of_stock";
  if (minimumStock > 0 && stockQuantity <= minimumStock) return "low_stock";
  return "in_stock";
}

export function productStatus(product: Pick<Product, "stockQuantity" | "minimumStock">): StockStatus {
  return stockStatus(product.stockQuantity, product.minimumStock);
}

export const STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

/**
 * Computes the resulting stock of a movement. Returns an error string
 * instead of throwing so forms can surface it directly.
 */
export function applyMovement(
  previousStock: number,
  type: MovementType,
  quantity: number,
): { ok: true; resultingStock: number } | { ok: false; error: string } {
  if (!Number.isFinite(quantity)) return { ok: false, error: "Quantity must be a number" };
  if (!Number.isInteger(quantity)) return { ok: false, error: "Quantity must be a whole number" };
  if (quantity <= 0 && type !== "adjustment") {
    return { ok: false, error: "Quantity must be greater than zero" };
  }
  if (quantity === 0 && type === "adjustment") {
    return { ok: false, error: "Adjustment quantity cannot be zero" };
  }
  const resulting =
    type === "in" ? previousStock + quantity : type === "out" ? previousStock - quantity : previousStock + quantity;
  if (resulting < 0) {
    return {
      ok: false,
      error: `Insufficient stock: ${previousStock} in stock, cannot ${type === "out" ? "remove" : "adjust by"} ${Math.abs(quantity)}`,
    };
  }
  return { ok: true, resultingStock: resulting };
}

/**
 * Recomputes expected stock from the movement ledger (chronological):
 * first movement's previous_stock is the starting level; each movement
 * applies delta = resulting - previous. Returns null when the ledger is
 * empty (nothing to verify against).
 */
export function expectedStockFromLedger(
  movements: Array<{ previousStock: number; resultingStock: number }>,
): number | null {
  if (movements.length === 0) return null;
  let stock = movements[0].previousStock;
  for (const m of movements) {
    stock = m.resultingStock;
  }
  return stock;
}

/** IDR is the default; a small map of supported display currencies. */
export const CURRENCIES = ["IDR", "USD", "EUR", "SGD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
