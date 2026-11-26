import { withApi, jsonOk } from "@/lib/http";
import { reconcilePending } from "@/lib/services/stock-movements.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/movements/reconcile — completes or safely fails pending
 * operations left behind by crashes/retries (idempotent).
 */
export const POST = withApi(async () => {
  const outcomes = await reconcilePending();
  return jsonOk({ outcomes, at: new Date().toISOString() });
});
