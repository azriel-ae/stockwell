import Link from "next/link";
import { ArrowRight, PackagePlus, TrendingDown } from "lucide-react";
import { MovementTrendChart, CategoryDistributionChart } from "@/components/charts";
import { Badge, Button, EmptyState, MovementTypeBadge, StatusBadge } from "@/components/ui";
import { getDashboardData } from "@/lib/services/reports.service";
import { fromDrivebaseError } from "@/lib/services/errors";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { productStatus } from "@/lib/stock";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  let data;
  try {
    data = await getDashboardData();
  } catch (err) {
    const serviceError = fromDrivebaseError(err);
    return (
      <div className="space-y-6">
        <PageHeader />
        <SetupNotice
          title="Dashboard data is unavailable"
          detail={serviceError.message}
        />
      </div>
    );
  }

  const { stats, currency } = data;

  return (
    <div className="space-y-6">
      <PageHeader>
        <div className="flex flex-wrap gap-2">
          <Link href="/products?action=new">
            <Button variant="sage" size="sm">
              <PackagePlus size={14} /> Add product
            </Button>
          </Link>
          <Link href="/movements?action=new">
            <Button variant="outline" size="sm">
              <TrendingDown size={14} /> Record stock movement
            </Button>
          </Link>
          <Link href="/products">
            <Button variant="ghost" size="sm">
              View inventory <ArrowRight size={13} />
            </Button>
          </Link>
        </div>
      </PageHeader>

      {data.empty ? (
        <section className="rounded-lg border border-line bg-white">
          <EmptyState
            icon={<PackagePlus size={28} strokeWidth={1.4} />}
            title="No products yet"
            description="Add your first product to start tracking stock. Products, movements and reports are all stored through the Drivebase API."
            action={
              <Link href="/products?action=new">
                <Button variant="sage" size="sm">
                  <PackagePlus size={14} /> Add product
                </Button>
              </Link>
            }
          />
        </section>
      ) : (
        <>
          {/* Statistics strip — thin dividers, not a wall of cards */}
          <section className="grid grid-cols-2 divide-line border-y border-line bg-white sm:grid-cols-3 sm:divide-x lg:grid-cols-5">
            <Stat label="Total products" value={formatNumber(stats.totalProducts)} />
            <Stat label="Stock units" value={formatNumber(stats.totalStockUnits)} />
            <Stat label="Low stock" value={formatNumber(stats.lowStockCount)} tone={stats.lowStockCount > 0 ? "warning" : undefined} />
            <Stat label="Out of stock" value={formatNumber(stats.outOfStockCount)} tone={stats.outOfStockCount > 0 ? "danger" : undefined} />
            <Stat
              label="Inventory value"
              value={formatCurrency(stats.totalInventoryValue, currency)}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-5">
            <div className="rounded-lg border border-line bg-white p-5 lg:col-span-3">
              <ChartHeader
                title="Stock movement trends"
                note="Last 14 days, from the movement ledger"
              />
              <MovementTrendChart data={data.trend} />
            </div>
            <div className="rounded-lg border border-line bg-white p-5 lg:col-span-2">
              <ChartHeader
                title="Inventory by category"
                note="Stock units per category"
              />
              {data.categoryDistribution.length === 0 ? (
                <p className="py-10 text-center text-xs text-mutedslate">
                  No categories with stock yet.
                </p>
              ) : (
                <CategoryDistributionChart data={data.categoryDistribution} />
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-5">
            <div className="rounded-lg border border-line bg-white lg:col-span-3">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold text-charcoal">Recent stock movements</h2>
                <Link
                  href="/movements"
                  className="flex items-center gap-1 text-xs text-mutedslate hover:text-charcoal"
                >
                  All movements <ArrowRight size={12} />
                </Link>
              </div>
              {data.recentMovements.length === 0 ? (
                <p className="px-5 py-10 text-center text-xs text-mutedslate">
                  No stock movements recorded yet.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-[11px] tracking-wide text-mutedslate uppercase">
                      <th className="px-5 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-5 py-2 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linemuted">
                    {data.recentMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-warmivory/60">
                        <td className="px-5 py-2.5 text-xs text-mutedslate">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 text-charcoal">
                          {m.productName ?? "Deleted product"}
                        </td>
                        <td className="px-3 py-2.5">
                          <MovementTypeBadge type={m.movementType} />
                        </td>
                        <td className="tabular px-5 py-2.5 text-right text-charcoal">
                          {m.movementType === "out" ? "−" : "+"}
                          {formatNumber(m.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-lg border border-line bg-white p-5 lg:col-span-2">
              <ChartHeader title="Product stock overview" note="Largest stock on hand" />
              <ul className="divide-y divide-linemuted">
                {data.topProducts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/products/${p.id}`}
                        className="block truncate text-[13px] font-medium text-charcoal hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="text-[11px] text-mutedslate">{p.sku}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-[13px] text-charcoal">
                        {formatNumber(p.stock)} {p.unit ?? ""}
                      </p>
                      <StatusBadge
                        status={productStatus({
                          stockQuantity: p.stock,
                          minimumStock: p.minimum,
                        })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-end">
                <Link
                  href="/products"
                  className="flex items-center gap-1 text-xs text-mutedslate hover:text-charcoal"
                >
                  All products <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PageHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-charcoal">Dashboard</h1>
        <p className="mt-0.5 text-xs text-mutedslate">
          Live inventory overview — every figure is computed from Drivebase data.
        </p>
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "danger";
}) {
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

function ChartHeader({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
        <Badge tone="outline">Drivebase</Badge>
      </div>
      <p className="mt-0.5 text-[11px] text-mutedslate">{note}</p>
    </div>
  );
}
