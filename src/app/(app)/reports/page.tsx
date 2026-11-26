import Link from "next/link";
import { Download, FileBarChart } from "lucide-react";
import { InOutBarChart, CategoryDistributionChart } from "@/components/charts";
import { Badge, EmptyState } from "@/components/ui";
import { getReport } from "@/lib/services/reports.service";
import { listCategories } from "@/lib/services/categories.service";
import { fromDrivebaseError } from "@/lib/services/errors";
import { formatCurrency, formatDate, formatNumber, shortDate } from "@/lib/format";
import { reportQuerySchema } from "@/lib/validation";
import { SetupNotice } from "@/components/setup-notice";
import { ReportFiltersForm } from "@/components/report-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw: Record<string, string> = {};
  if (typeof params.from === "string") raw.from = params.from;
  if (typeof params.to === "string") raw.to = params.to;
  if (typeof params.categoryId === "string") raw.categoryId = params.categoryId;
  const parsed = reportQuerySchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : {};

  try {
    const [report, categories] = await Promise.all([getReport(filters), listCategories()]);
    const csvBase = new URLSearchParams(
      Object.entries(raw).filter(([, v]) => v !== ""),
    ).toString();

    // Daily in/out for the chart (from the filtered movement list).
    const byDay = new Map<string, { date: string; in: number; out: number }>();
    for (const m of report.movements) {
      const bucket = byDay.get(m.movementDate) ?? { date: m.movementDate, in: 0, out: 0 };
      if (m.movementType === "in") bucket.in += m.quantity;
      if (m.movementType === "out") bucket.out += m.quantity;
      byDay.set(m.movementDate, bucket);
    }
    const chartData = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-charcoal">Reports</h1>
            <p className="mt-0.5 text-xs text-mutedslate">
              Inventory analytics computed live from Drivebase data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CsvButton
              href={`/api/reports?format=csv&type=summary&${csvBase}`}
              label="Export summary CSV"
            />
            <CsvButton
              href={`/api/reports?format=csv&type=products&${csvBase}`}
              label="Export products CSV"
            />
            <CsvButton
              href={`/api/reports?format=csv&type=movements&${csvBase}`}
              label="Export movements CSV"
            />
          </div>
        </div>

        <ReportFiltersForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          from={filters.from ?? ""}
          to={filters.to ?? ""}
          categoryId={filters.categoryId ?? ""}
        />

        {/* Summary statistics */}
        <section className="grid grid-cols-2 divide-line border-y border-line bg-white sm:grid-cols-3 sm:divide-x lg:grid-cols-5">
          <Stat label="Total products" value={formatNumber(report.stats.totalProducts)} />
          <Stat label="Stock units" value={formatNumber(report.stats.totalStockUnits)} />
          <Stat label="Inventory value" value={formatCurrency(report.stats.totalInventoryValue, report.currency)} />
          <Stat
            label="Low stock"
            value={formatNumber(report.stats.lowStockCount)}
            tone={report.stats.lowStockCount > 0 ? "warning" : undefined}
          />
          <Stat
            label="Out of stock"
            value={formatNumber(report.stats.outOfStockCount)}
            tone={report.stats.outOfStockCount > 0 ? "danger" : undefined}
          />
        </section>

        {/* Stock in vs out */}
        <section className="rounded-lg border border-line bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-charcoal">Stock in vs stock out</h2>
              <p className="mt-0.5 text-[11px] text-mutedslate">
                {filters.from || filters.to
                  ? `${filters.from ? formatDate(filters.from) : "start"} – ${filters.to ? formatDate(filters.to) : "today"}`
                  : "All recorded movements, grouped by day (last 30 days with data)"}
              </p>
            </div>
            <div className="flex gap-2 text-[11px] text-graphite">
              <Badge tone="success">In {formatNumber(report.movementTotals.in)}</Badge>
              <Badge tone="danger">Out {formatNumber(report.movementTotals.out)}</Badge>
              <Badge tone="warning">Adj {formatNumber(report.movementTotals.adjustments)}</Badge>
              <Badge tone="outline">Net {formatNumber(report.movementTotals.net)}</Badge>
            </div>
          </div>
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-xs text-mutedslate">
              No movements in the selected range.
            </p>
          ) : (
            <InOutBarChart data={chartData} />
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Inventory by category */}
          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-sm font-semibold text-charcoal">Inventory by category</h2>
            <p className="mt-0.5 mb-4 text-[11px] text-mutedslate">
              Stock units and value per category
            </p>
            {report.byCategory.length === 0 ? (
              <p className="py-10 text-center text-xs text-mutedslate">No products to report.</p>
            ) : (
              <>
                <CategoryDistributionChart
                  data={report.byCategory.map((c) => ({ category: c.category, units: c.units }))}
                />
                <table className="mt-4 w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-[10px] tracking-wide text-mutedslate uppercase">
                      <th className="py-1.5 pr-2 font-medium">Category</th>
                      <th className="px-2 py-1.5 text-right font-medium">Products</th>
                      <th className="px-2 py-1.5 text-right font-medium">Units</th>
                      <th className="py-1.5 pl-2 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linemuted">
                    {report.byCategory.map((c) => (
                      <tr key={c.category}>
                        <td className="py-1.5 pr-2 text-charcoal">{c.category}</td>
                        <td className="tabular px-2 py-1.5 text-right text-graphite">{c.products}</td>
                        <td className="tabular px-2 py-1.5 text-right text-graphite">{formatNumber(c.units)}</td>
                        <td className="tabular py-1.5 pl-2 text-right text-charcoal">
                          {formatCurrency(c.value, report.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          {/* Watchlists */}
          <div className="space-y-6">
            <section className="rounded-lg border border-line bg-white">
              <h2 className="border-b border-line px-5 py-4 text-sm font-semibold text-charcoal">
                Low stock watchlist
              </h2>
              {report.lowStockProducts.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-mutedslate">
                  Nothing below its minimum level.
                </p>
              ) : (
                <ul className="divide-y divide-linemuted">
                  {report.lowStockProducts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={`/products/${p.id}`} className="font-medium text-charcoal hover:underline">
                          {p.name}
                        </Link>
                        <p className="font-mono text-[10px] text-mutedslate">{p.sku}</p>
                      </div>
                      <p className="tabular text-xs text-warning">
                        {formatNumber(p.stock)} / min {formatNumber(p.minimum)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-lg border border-line bg-white">
              <h2 className="border-b border-line px-5 py-4 text-sm font-semibold text-charcoal">
                Out of stock
              </h2>
              {report.outOfStockProducts.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-mutedslate">
                  All products have stock on hand.
                </p>
              ) : (
                <ul className="divide-y divide-linemuted">
                  {report.outOfStockProducts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={`/products/${p.id}`} className="font-medium text-charcoal hover:underline">
                          {p.name}
                        </Link>
                        <p className="font-mono text-[10px] text-mutedslate">{p.sku}</p>
                      </div>
                      <Badge tone="danger">0 {p.unit ?? ""}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* Movement history table */}
        <section className="overflow-hidden rounded-lg border border-line bg-white">
          <h2 className="border-b border-line px-5 py-4 text-sm font-semibold text-charcoal">
            Stock movement history{" "}
            <span className="ml-1 text-[11px] font-normal text-mutedslate">
              ({report.movements.length} in range)
            </span>
          </h2>
          {report.movements.length === 0 ? (
            <EmptyState
              icon={<FileBarChart size={26} strokeWidth={1.4} />}
              title="No movements in this range"
              description="Adjust the date range or record stock movements to populate the report."
            />
          ) : (
            <div className="scroll-thin max-h-96 overflow-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b border-line bg-warmivory text-[11px] tracking-wide text-mutedslate uppercase">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Date</th>
                    <th className="px-3 py-2.5 font-medium">Product</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Prev → Result</th>
                    <th className="py-2.5 pr-5 pl-3 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linemuted">
                  {report.movements.slice(0, 200).map((m) => (
                    <tr key={m.id} className="hover:bg-warmivory/50">
                      <td className="py-2.5 pr-3 pl-5 text-xs text-mutedslate">
                        {shortDate(m.movementDate)}
                      </td>
                      <td className="px-3 py-2.5 text-charcoal">
                        {m.productName ?? "Deleted product"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-graphite capitalize">
                        {m.movementType}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-charcoal">
                        {m.movementType === "out" ? "−" : "+"}
                        {formatNumber(m.quantity)}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-graphite">
                        {formatNumber(m.previousStock)} → {formatNumber(m.resultingStock)}
                      </td>
                      <td className="py-2.5 pr-5 pl-3 text-xs text-mutedslate">
                        {m.referenceNumber ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  } catch (err) {
    const serviceError = fromDrivebaseError(err);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Reports</h1>
          <p className="mt-0.5 text-xs text-mutedslate">Inventory analytics from Drivebase.</p>
        </div>
        <SetupNotice title="Reports are unavailable" detail={serviceError.message} />
      </div>
    );
  }
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  return (
    <div className="border-b border-line px-5 py-4 sm:border-b-0">
      <p className="text-[11px] font-medium tracking-wide text-mutedslate uppercase">{label}</p>
      <p
        className={`tabular mt-1 text-lg font-semibold ${
          tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-charcoal"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CsvButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-xs font-medium text-charcoal transition-colors hover:bg-warmivory"
    >
      <Download size={13} /> {label}
    </a>
  );
}
