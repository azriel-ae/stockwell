/**
 * Stock movement service — the consistency core of Stockwell.
 *
 * Drivebase has NO ACID transactions (documented): writes are sequential,
 * the per-table write lock is per-server-instance, and Vercel can run
 * several instances. Stockwell therefore implements a write-ahead style
 * ledger on top of the Drivebase API:
 *
 *  1. Every user action gets a client-generated `operation_key`.
 *  2. A row is inserted into the `operations` table with status `pending`
 *     BEFORE any stock is touched (write-ahead), using Drivebase's
 *     Idempotency-Key so network retries cannot duplicate it.
 *  3. The movement row is inserted (previous/resulting stock snapshot).
 *  4. The product stock is patched to the absolute resulting value.
 *  5. The operation is marked `applied` with the movement id.
 *
 * Retries with the same operation key replay the stored result instead of
 * executing again. Crashes leave a `pending` operation which
 * `reconcilePending()` completes or fails SAFELY (never both a stock
 * change and a missing ledger row, or vice versa). `reconcileProductStock`
 * recomputes the stock from the ledger and repairs drift.
 *
 * Known residual risk (honestly documented): two Vercel instances writing
 * the same product concurrently can interleave steps 3-5; the ledger stays
 * complete but the product stock can drift, which the reconciliation
 * repairs on demand.
 */

import { TABLES } from "@/lib/drivebase/config";
import {
  getAllRecords,
  getRecord,
  insertRecord,
  listRecords,
  updateRecord,
} from "@/lib/drivebase/records";
import { mapMovement, mapOperation, mapProduct } from "@/lib/models";
import type { MovementType, Operation, Product, StockMovement } from "@/lib/models";
import { applyMovement } from "@/lib/stock";
import { ServiceError, fromDrivebaseError } from "./errors";
import type { MovementCreateInput } from "@/lib/validation";

/** In-process per-product write lock (single-instance serialization). */
const g = globalThis as unknown as { __swProductLocks?: Map<string, Promise<unknown>> };
const productLocks: Map<string, Promise<unknown>> = (g.__swProductLocks ??= new Map());

async function withProductLock<T>(productId: string, fn: () => Promise<T>): Promise<T> {
  const previous = productLocks.get(productId) ?? Promise.resolve();
  // Run after the previous holder settles (success or failure).
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  productLocks.set(productId, tail);
  void tail.then(() => {
    if (productLocks.get(productId) === tail) productLocks.delete(productId);
  });
  return run;
}

export interface MovementResult {
  movement: StockMovement;
  product: Product;
  replayed: boolean;
}

async function findOperationByKey(operationKey: string): Promise<Operation | null> {
  const { records } = await listRecords(TABLES.operations, {
    filters: [{ column: "operation_key", value: operationKey }],
    limit: 1,
  });
  return records.length > 0 ? mapOperation(records[0]) : null;
}

async function findMovementByOperationKey(operationKey: string): Promise<StockMovement | null> {
  const { records } = await listRecords(TABLES.stockMovements, {
    filters: [{ column: "operation_key", value: operationKey }],
    limit: 1,
  });
  return records.length > 0 ? mapMovement(records[0]) : null;
}

async function readProductForWrite(productId: string): Promise<Product> {
  const rec = await getRecord(TABLES.products, productId, { noCache: true });
  if (!rec) {
    throw new ServiceError(404, "not_found", "Product not found — it may have been deleted.");
  }
  return mapProduct(rec);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Records a stock movement with full consistency bookkeeping. */
export async function recordMovement(input: MovementCreateInput): Promise<MovementResult> {
  try {
    return await withProductLock(input.productId, async () => {
      const key = input.idempotencyKey;

      // Idempotent replay: the operation already completed.
      const existing = await findOperationByKey(key);
      if (existing && existing.status === "applied") {
        const movementId = existing.result?.movementId;
        const product = await readProductForWrite(input.productId);
        if (typeof movementId === "string") {
          const movement = await getMovementById(movementId);
          if (movement) return { movement, product, replayed: true };
        }
        // Applied operation without reachable movement: return current state.
        return {
          movement: {
            id: typeof movementId === "string" ? movementId : "",
            productId: product.id,
            movementType: input.movementType,
            quantity: input.quantity,
            previousStock: product.stockQuantity - input.quantity,
            resultingStock: product.stockQuantity,
            movementDate: today(),
            notes: input.notes ?? null,
            referenceNumber: input.referenceNumber ?? null,
            operationKey: key,
            createdAt: existing.updatedAt,
            updatedAt: existing.updatedAt,
          },
          product,
          replayed: true,
        };
      }

      const product = await readProductForWrite(input.productId);
      const applied = applyMovement(product.stockQuantity, input.movementType, input.quantity);
      if (!applied.ok) {
        throw new ServiceError(422, "invalid_quantity", applied.error, {
          quantity: applied.error,
        });
      }

      // (1) Write-ahead: pending operation row.
      let operationRowId = existing?.id ?? null;
      if (!operationRowId) {
        const opRec = await insertRecord(
          TABLES.operations,
          {
            operation_key: key,
            kind: "stock_movement",
            status: "pending",
            product_id: product.id,
            payload: {
              movementType: input.movementType,
              quantity: input.quantity,
              previousStock: product.stockQuantity,
              resultingStock: applied.resultingStock,
              notes: input.notes ?? null,
              referenceNumber: input.referenceNumber ?? null,
            },
          },
          { idempotencyKey: `op:${key}` },
        );
        operationRowId = opRec.id;
      }

      // (2) Ledger row.
      const movementRec = await insertRecord(
        TABLES.stockMovements,
        {
          product_id: product.id,
          movement_type: input.movementType,
          quantity: input.quantity,
          previous_stock: product.stockQuantity,
          resulting_stock: applied.resultingStock,
          movement_date: today(),
          notes: input.notes ?? null,
          reference_number: input.referenceNumber ?? null,
          operation_key: key,
        },
        { idempotencyKey: `mov:${key}` },
      );
      const movement = mapMovement(movementRec);

      // (3) Product stock to the absolute resulting value.
      const updatedProduct = await updateRecord(
        TABLES.products,
        product.id,
        { stock_quantity: movement.resultingStock },
        { idempotencyKey: `prod:${key}` },
      );

      // (4) Mark applied.
      await updateRecord(
        TABLES.operations,
        operationRowId as string,
        {
          status: "applied",
          result: {
            movementId: movement.id,
            previousStock: movement.previousStock,
            resultingStock: movement.resultingStock,
          },
        },
        { idempotencyKey: `opdone:${key}` },
      );

      return { movement, product: mapProduct(updatedProduct), replayed: false };
    });
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw fromDrivebaseError(err);
  }
}

export async function getMovementById(id: string): Promise<StockMovement | null> {
  const rec = await getRecord(TABLES.stockMovements, id);
  return rec ? mapMovement(rec) : null;
}

export interface MovementQuery {
  productId?: string;
  type?: MovementType;
  page?: number;
  perPage?: number;
}

export interface MovementWithProduct extends StockMovement {
  productName: string | null;
  productSku: string | null;
  productUnit: string | null;
}

export async function listMovements(
  query: MovementQuery = {},
): Promise<{
  movements: MovementWithProduct[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}> {
  try {
    const filters = [];
    if (query.productId) filters.push({ column: "product_id", value: query.productId });
    if (query.type) filters.push({ column: "movement_type", value: query.type });
    const perPage = Math.min(Math.max(query.perPage ?? 25, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const { records, meta } = await listRecords(TABLES.stockMovements, {
      filters,
      limit: perPage,
      offset: (page - 1) * perPage,
      sort: "-__created_at",
      expand: ["product_id"],
    });
    const movements = records.map((rec) => {
      const m = mapMovement(rec);
      const expanded = rec.product_id;
      const name =
        typeof expanded === "object" && expanded !== null
          ? (expanded as { name?: unknown }).name
          : null;
      const sku =
        typeof expanded === "object" && expanded !== null
          ? (expanded as { sku?: unknown }).sku
          : null;
      const unit =
        typeof expanded === "object" && expanded !== null
          ? (expanded as { unit?: unknown }).unit
          : null;
      return {
        ...m,
        productName: typeof name === "string" ? name : null,
        productSku: typeof sku === "string" ? sku : null,
        productUnit: typeof unit === "string" ? unit : null,
      };
    });
    const total = meta.total_matched;
    return {
      movements,
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function listMovementsForProduct(productId: string): Promise<StockMovement[]> {
  try {
    const records = await getAllRecords(TABLES.stockMovements, {
      filters: [{ column: "product_id", value: productId }],
      maxPages: 10,
      sort: "__created_at",
    });
    return records.map(mapMovement);
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

/* ------------------------------ reconciliation ----------------------------- */

export interface ReconcileOutcome {
  operationKey: string;
  outcome: "completed" | "already_consistent" | "failed" | "skipped_recent";
  detail: string;
}

/** Completes or safely fails pending operations (idempotent, re-runnable). */
export async function reconcilePending(minAgeMinutes = 2): Promise<ReconcileOutcome[]> {
  try {
    const { records } = await listRecords(TABLES.operations, {
      filters: [{ column: "status", value: "pending" }],
      limit: 100,
      sort: "__created_at",
    });
    const outcomes: ReconcileOutcome[] = [];
    const now = Date.now();
    for (const raw of records) {
      const op = mapOperation(raw);
      const ageMs = now - new Date(op.createdAt).getTime();
      if (Number.isFinite(ageMs) && ageMs < minAgeMinutes * 60_000) {
        outcomes.push({
          operationKey: op.operationKey,
          outcome: "skipped_recent",
          detail: `Pending for ${Math.max(0, Math.round(ageMs / 1000))}s — still within the retry window.`,
        });
        continue;
      }
      outcomes.push(await reconcileOperation(op));
    }
    return outcomes;
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

async function reconcileOperation(op: Operation): Promise<ReconcileOutcome> {
  const key = op.operationKey;
  const movement = await findMovementByOperationKey(key);
  if (movement) {
    // Ledger row exists: make sure the product reflects it.
    const product = await readProductForWrite(movement.productId);
    if (product.stockQuantity === movement.resultingStock) {
      await markOperation(op.id, "applied", {
        movementId: movement.id,
        resultingStock: movement.resultingStock,
        reconciled: true,
      });
      return {
        operationKey: key,
        outcome: "completed",
        detail: "Movement existed; operation marked applied.",
      };
    }
    await updateRecord(TABLES.products, product.id, {
      stock_quantity: movement.resultingStock,
    });
    await markOperation(op.id, "applied", {
      movementId: movement.id,
      resultingStock: movement.resultingStock,
      reconciled: true,
      repairedProductStock: true,
    });
    return {
      operationKey: key,
      outcome: "completed",
      detail: `Movement existed; product stock repaired ${product.stockQuantity} → ${movement.resultingStock}.`,
    };
  }

  // No ledger row: only safe to complete when the product is untouched.
  const payload = op.payload ?? {};
  const previousStock = typeof payload.previousStock === "number" ? payload.previousStock : null;
  const productId = op.productId;
  if (!productId || previousStock === null) {
    await markOperation(op.id, "failed", { reason: "incomplete_pending_payload" });
    return {
      operationKey: key,
      outcome: "failed",
      detail: "Pending operation has no usable payload; marked failed.",
    };
  }
  const product = await readProductForWrite(productId);
  if (product.stockQuantity === previousStock) {
    const movementType =
      payload.movementType === "in" || payload.movementType === "out" || payload.movementType === "adjustment"
        ? payload.movementType
        : "adjustment";
    const quantity = typeof payload.quantity === "number" ? payload.quantity : 0;
    const movementRec = await insertRecord(
      TABLES.stockMovements,
      {
        product_id: productId,
        movement_type: movementType,
        quantity,
        previous_stock: previousStock,
        resulting_stock: product.stockQuantity,
        movement_date: today(),
        notes: typeof payload.notes === "string" ? payload.notes : "Recovered by reconciliation",
        reference_number: typeof payload.referenceNumber === "string" ? payload.referenceNumber : null,
        operation_key: key,
      },
      { idempotencyKey: `mov:${key}` },
    );
    await markOperation(op.id, "applied", {
      movementId: movementRec.id,
      resultingStock: movementRec.resulting_stock ?? product.stockQuantity,
      reconciled: true,
    });
    return {
      operationKey: key,
      outcome: "completed",
      detail: "Product was untouched; movement created from the pending payload.",
    };
  }
  await markOperation(op.id, "failed", {
    reason: "concurrent_modification",
    stockAtFailure: product.stockQuantity,
  });
  return {
    operationKey: key,
    outcome: "failed",
    detail: `Product stock changed to ${product.stockQuantity} (expected ${previousStock}); operation failed safely without a ledger row.`,
  };
}

async function markOperation(
  operationRowId: string,
  status: Operation["status"],
  result: Record<string, unknown>,
): Promise<void> {
  await updateRecord(TABLES.operations, operationRowId, { status, result });
}

export interface StockIntegrityReport {
  productId: string;
  productName: string;
  recordedStock: number;
  ledgerStock: number | null;
  repaired: boolean;
  movementCount: number;
}

/** Recomputes a product's stock from the ledger and repairs drift. */
export async function reconcileProductStock(productId: string): Promise<StockIntegrityReport> {
  try {
    return await withProductLock(productId, async () => {
      const product = await readProductForWrite(productId);
      const movements = await listMovementsForProduct(productId);
      const ledgerStock =
        movements.length > 0 ? movements[movements.length - 1].resultingStock : null;
      let repaired = false;
      if (ledgerStock !== null && ledgerStock !== product.stockQuantity) {
        await updateRecord(TABLES.products, productId, { stock_quantity: ledgerStock });
        repaired = true;
      }
      return {
        productId,
        productName: product.name,
        recordedStock: product.stockQuantity,
        ledgerStock,
        repaired,
        movementCount: movements.length,
      };
    });
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}
