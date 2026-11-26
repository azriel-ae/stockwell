import { withApi, jsonOk, readJsonBody, zodFieldErrors } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { deleteCategory, getCategory, updateCategory } from "@/lib/services/categories.service";
import { categoryUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/categories/:id — one category. */
export const GET = withApi(async (_request, ctx: Params) => {
  const { id } = await ctx.params;
  const category = await getCategory(id);
  if (!category) throw new ServiceError(404, "not_found", "Category not found.");
  return jsonOk(category);
});

/** PATCH /api/categories/:id — rename / edit description. */
export const PATCH = withApi(async (request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await readJsonBody(request);
  const parsed = categoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Check the highlighted fields.", zodFieldErrors(parsed.error));
  }
  const category = await updateCategory(id, parsed.data);
  return jsonOk(category);
});

/** DELETE /api/categories/:id — refused while products still use it. */
export const DELETE = withApi(async (_request, ctx: Params) => {
  const { id } = await ctx.params;
  const result = await deleteCategory(id);
  return jsonOk({ deleted: true, id, ...result });
});
