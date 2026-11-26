import { withApi, jsonOk, readJsonBody, zodFieldErrors } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { deleteSupplier, getSupplier, updateSupplier } from "@/lib/services/suppliers.service";
import { supplierUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/suppliers/:id — supplier detail + associated products. */
export const GET = withApi(async (_request, ctx: Params) => {
  const { id } = await ctx.params;
  const result = await getSupplier(id);
  if (!result) throw new ServiceError(404, "not_found", "Supplier not found.");
  return jsonOk(result);
});

/** PATCH /api/suppliers/:id — edit supplier info. */
export const PATCH = withApi(async (request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await readJsonBody(request);
  const parsed = supplierUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Check the highlighted fields.", zodFieldErrors(parsed.error));
  }
  const supplier = await updateSupplier(id, parsed.data);
  return jsonOk(supplier);
});

/** DELETE /api/suppliers/:id — refused while products still link to it. */
export const DELETE = withApi(async (_request, ctx: Params) => {
  const { id } = await ctx.params;
  const result = await deleteSupplier(id);
  return jsonOk({ deleted: true, id, ...result });
});
