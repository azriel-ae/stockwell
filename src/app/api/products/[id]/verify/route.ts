import { withApi, jsonOk } from "@/lib/http";
import { reconcileProductStock } from "@/lib/services/stock-movements.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/products/:id/verify — recomputes the stock from the movement
 * ledger and repairs drift (manual integrity check).
 */
export const POST = withApi(async (_request, ctx: Params) => {
  const { id } = await ctx.params;
  const report = await reconcileProductStock(id);
  return jsonOk(report);
});
