import { withApi, jsonOk } from "@/lib/http";
import { initialize } from "@/lib/services/init.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/init — idempotent table/relationship/settings initialization. */
export const POST = withApi(async () => {
  const report = await initialize();
  return jsonOk(report);
});
