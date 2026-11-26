import { withApi, jsonOk, readJsonBody, zodFieldErrors } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { getProduct, updateProduct, deleteProduct } from "@/lib/services/products.service";
import { listMovementsForProduct, reconcileProductStock } from "@/lib/services/stock-movements.service";
import { productUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/products/:id — product + movement history + integrity report. */
export const GET = withApi(async (_request, ctx: Params) => {
  const { id } = await ctx.params;
  const product = await getProduct(id);
  if (!product) throw new ServiceError(404, "not_found", "Product not found.");
  const [movements, integrity] = await Promise.all([
    listMovementsForProduct(id),
    reconcileProductStock(id),
  ]);
  return jsonOk({ product, movements, integrity });
});

/** PATCH /api/products/:id — partial update with SKU uniqueness. */
export const PATCH = withApi(async (request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await readJsonBody(request);
  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Check the highlighted fields.", zodFieldErrors(parsed.error));
  }
  const product = await updateProduct(id, parsed.data);
  return jsonOk(product);
});

/** DELETE /api/products/:id — removes movements + image + product. */
export const DELETE = withApi(async (_request, ctx: Params) => {
  const { id } = await ctx.params;
  await deleteProduct(id);
  return jsonOk({ deleted: true, id });
});
