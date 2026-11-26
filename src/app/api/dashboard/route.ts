import { withApi, jsonOk } from "@/lib/http";
import { getDashboardData } from "@/lib/services/reports.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dashboard — dashboard aggregates from actual Drivebase data. */
export const GET = withApi(async () => {
  const data = await getDashboardData();
  return jsonOk(data);
});
