import { withApi, jsonOk, readJsonBody, zodFieldErrors } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { createCategory, listCategories } from "@/lib/services/categories.service";
import { categoryCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/categories — all categories with product counts. */
export const GET = withApi(async () => {
  return jsonOk(await listCategories());
});

/** POST /api/categories — create a category. */
export const POST = withApi(async (request) => {
  const body = await readJsonBody(request);
  const parsed = categoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Check the highlighted fields.", zodFieldErrors(parsed.error));
  }
  const category = await createCategory(parsed.data);
  return jsonOk(category, { status: 201 });
});
