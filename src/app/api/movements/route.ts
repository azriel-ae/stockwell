import { withApi, jsonOk, readJsonBody, zodFieldErrors } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { listMovements, recordMovement } from "@/lib/services/stock-movements.service";
import { movementCreateSchema } from "@/lib/validation";
import type { MovementType } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set<MovementType>(["in", "out", "adjustment"]);

/** GET /api/movements — paginated ledger (optional product/type filters). */
export const GET = withApi(async (request) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const result = await listMovements({
    productId: url.searchParams.get("productId") ?? undefined,
    type: type && TYPES.has(type as MovementType) ? (type as MovementType) : undefined,
    page: Number(url.searchParams.get("page") ?? 1) || 1,
    perPage: Number(url.searchParams.get("perPage") ?? 25) || 25,
  });
  return jsonOk(result);
});

/**
 * POST /api/movements — record a movement with the consistency protocol
 * (write-ahead operation row + idempotency keys + ledger + stock update).
 */
export const POST = withApi(async (request) => {
  const body = await readJsonBody(request);
  const parsed = movementCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Check the highlighted fields.", zodFieldErrors(parsed.error));
  }
  const result = await recordMovement(parsed.data);
  return jsonOk(result, { status: 201 });
});
