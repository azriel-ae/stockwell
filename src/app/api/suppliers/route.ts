import { withApi, jsonOk, readJsonBody, zodFieldErrors } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { createSupplier, listSuppliers } from "@/lib/services/suppliers.service";
import { supplierCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/suppliers — all suppliers with product counts. */
export const GET = withApi(async () => {
  return jsonOk(await listSuppliers());
});

/** POST /api/suppliers — create a supplier. */
export const POST = withApi(async (request) => {
  const body = await readJsonBody(request);
  const parsed = supplierCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Check the highlighted fields.", zodFieldErrors(parsed.error));
  }
  const supplier = await createSupplier(parsed.data);
  return jsonOk(supplier, { status: 201 });
});
