import { withApi, jsonOk } from "@/lib/http";
import { testConnection } from "@/lib/services/connection.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/connection — real round-trip connection test. */
export const GET = withApi(async () => {
  const report = await testConnection();
  return jsonOk(report);
});
