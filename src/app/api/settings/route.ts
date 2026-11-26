import { withApi, jsonOk, readJsonBody } from "@/lib/http";
import { getSettings, updateSettings } from "@/lib/services/settings.service";
import { ServiceError } from "@/lib/services/errors";
import { settingsUpdateSchema } from "@/lib/validation";
import { zodFieldErrors } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings — merged settings (defaults until saved). */
export const GET = withApi(async () => {
  return jsonOk(await getSettings());
});

/** PUT /api/settings — persist settings to Drivebase app_settings. */
export const PUT = withApi(async (request) => {
  const body = await readJsonBody(request);
  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Check the highlighted fields.", zodFieldErrors(parsed.error));
  }
  const settings = await updateSettings(parsed.data);
  return jsonOk(settings);
});
