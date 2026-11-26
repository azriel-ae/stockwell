import { withApi, jsonOk, zodFieldErrors } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { getReport, movementsCsv, productsCsv, summaryCsv } from "@/lib/services/reports.service";
import { reportQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reports — JSON report, or CSV with ?format=csv
 * (&type=products|movements|summary). All numbers come from Drivebase.
 */
export const GET = withApi(async (request) => {
  const url = new URL(request.url);
  const queryRaw: Record<string, string> = {};
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const categoryId = url.searchParams.get("categoryId");
  if (from) queryRaw.from = from;
  if (to) queryRaw.to = to;
  if (categoryId) queryRaw.categoryId = categoryId;

  const parsed = reportQuerySchema.safeParse(queryRaw);
  if (!parsed.success) {
    throw new ServiceError(422, "validation_error", "Invalid report filters.", zodFieldErrors(parsed.error));
  }
  const filters = parsed.data;

  if (url.searchParams.get("format") === "csv") {
    const type = url.searchParams.get("type") ?? "summary";
    let csv: string;
    let filename: string;
    if (type === "products") {
      csv = await productsCsv();
      filename = "stockwell-products.csv";
    } else if (type === "movements") {
      csv = await movementsCsv(filters);
      filename = "stockwell-movements.csv";
    } else {
      csv = await summaryCsv(filters);
      filename = "stockwell-report.csv";
    }
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const report = await getReport(filters);
  return jsonOk(report);
});
