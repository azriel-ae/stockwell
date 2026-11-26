import { withApi, jsonOk, readJsonBody, zodFieldErrors } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { listProducts, createProduct, updateProduct, getProduct } from "@/lib/services/products.service";
import { recordMovement } from "@/lib/services/stock-movements.service";
import { productCreateSchema } from "@/lib/validation";
import type { StockStatus } from "@/lib/models";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set<StockStatus>(["in_stock", "low_stock", "out_of_stock"]);
const SORTS = new Set(["name", "sku", "stock", "updated", "created"]);

/** GET /api/products — search, filter, sort, paginate. */
export const GET = withApi(async (request) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const sort = url.searchParams.get("sort");
  const page = await listProducts({
    search: url.searchParams.get("search") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    supplierId: url.searchParams.get("supplierId") ?? undefined,
    status: status && STATUSES.has(status as StockStatus) ? (status as StockStatus) : undefined,
    sort: sort && SORTS.has(sort) ? (sort as "name") : undefined,
    page: Number(url.searchParams.get("page") ?? 1) || 1,
    perPage: Number(url.searchParams.get("perPage") ?? 25) || 25,
  });
  return jsonOk(page);
});

/**
 * POST /api/products — create a product. When the initial stock is > 0 an
 * opening "in" movement is recorded so the ledger starts complete.
 */
export const POST = withApi(async (request) => {
  const body = await readJsonBody(request);
  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Check the highlighted fields.", zodFieldErrors(parsed.error));
  }
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 8
      ? body.idempotencyKey
      : randomUUID();

  // The product is created at 0 stock; the opening movement sets the real
  // quantity so the ledger starts consistent (stock 10 ⇒ one "in 10" row).
  const product = await createProduct(
    { ...parsed.data, stockQuantity: 0 },
    idempotencyKey,
  );

  if (parsed.data.stockQuantity > 0) {
    try {
      await recordMovement({
        productId: product.id,
        movementType: "in",
        quantity: parsed.data.stockQuantity,
        notes: "Opening stock",
        referenceNumber: "OPENING",
        idempotencyKey: `opening:${product.id}`,
      });
    } catch {
      // Fallback: keep the requested stock on the product even if the
      // ledger write failed (reconciliation can complete it later).
      try {
        await updateProduct(product.id, { stockQuantity: parsed.data.stockQuantity });
      } catch {
        // Product exists at 0; the user can record an opening movement.
      }
    }
  }
  const fresh = await getProduct(product.id);
  return jsonOk(fresh ?? product, { status: 201 });
});
