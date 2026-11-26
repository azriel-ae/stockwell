import Link from "next/link";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { getSupplier } from "@/lib/services/suppliers.service";
import { getSettings } from "@/lib/services/settings.service";
import { fromDrivebaseError } from "@/lib/services/errors";
import { productStatus } from "@/lib/stock";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const result = await getSupplier(id);
    if (!result) notFound();
    const settings = await getSettings();
    const { supplier, products } = result;

    const totalValue = products.reduce(
      (sum, p) => sum + (p.purchasePrice ?? 0) * p.stockQuantity,
      0,
    );

    return (
      <div className="space-y-5">
        <div>
          <Link href="/suppliers" className="text-xs text-mutedslate hover:text-charcoal">
            ← Back to suppliers
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-charcoal">
            {supplier.name}
          </h1>
          <p className="mt-0.5 text-xs text-mutedslate">
            Added {formatDateTime(supplier.createdAt)}
          </p>
        </div>

        <section className="rounded-lg border border-line bg-white p-5">
          <h2 className="mb-4 text-xs font-semibold tracking-wide text-graphite uppercase">
            Supplier information
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-[11px] font-medium tracking-wide text-mutedslate uppercase">
                Contact person
              </dt>
              <dd className="mt-1 text-sm text-charcoal">
                {supplier.contactPerson ?? <span className="text-mutedslate/60">—</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium tracking-wide text-mutedslate uppercase">
                Email
              </dt>
              <dd className="mt-1 text-sm">
                {supplier.email ? (
                  <a
                    href={`mailto:${supplier.email}`}
                    className="text-charcoal hover:underline"
                  >
                    {supplier.email}
                  </a>
                ) : (
                  <span className="text-mutedslate/60">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium tracking-wide text-mutedslate uppercase">
                Phone
              </dt>
              <dd className="mt-1 text-sm text-charcoal">
                {supplier.phone ?? <span className="text-mutedslate/60">—</span>}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-medium tracking-wide text-mutedslate uppercase">
                Address
              </dt>
              <dd className="mt-1 text-sm text-charcoal">
                {supplier.address ?? <span className="text-mutedslate/60">—</span>}
              </dd>
            </div>
          </dl>
          {supplier.notes ? (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1 text-[11px] font-medium tracking-wide text-mutedslate uppercase">
                Notes
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-graphite">
                {supplier.notes}
              </p>
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-charcoal">
              Products from this supplier
            </h2>
            <p className="text-xs text-mutedslate">
              {products.length} product{products.length === 1 ? "" : "s"} ·{" "}
              {formatCurrency(totalValue, settings.currency)} inventory value
            </p>
          </div>
          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Package size={26} strokeWidth={1.4} className="text-mutedslate/60" />
              <p className="text-xs text-mutedslate">
                No products linked to this supplier yet. Assign a supplier when creating or
                editing a product.
              </p>
            </div>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-warmivory/60 text-[11px] tracking-wide text-mutedslate uppercase">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Product</th>
                    <th className="px-3 py-2.5 font-medium">SKU</th>
                    <th className="px-3 py-2.5 text-right font-medium">Stock</th>
                    <th className="py-2.5 pr-5 pl-3 text-right font-medium">Purchase price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linemuted">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-warmivory/50">
                      <td className="py-2.5 pr-3 pl-5">
                        <Link
                          href={`/products/${p.id}`}
                          className="font-medium text-charcoal hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-graphite">{p.sku}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="tabular text-charcoal">
                            {formatNumber(p.stockQuantity)} {p.unit ?? ""}
                          </span>
                          <StatusBadge status={productStatus(p)} />
                        </div>
                      </td>
                      <td className="tabular py-2.5 pr-5 pl-3 text-right text-graphite">
                        {formatCurrency(p.purchasePrice, settings.currency)}
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
        <Link href="/suppliers" className="text-xs text-mutedslate hover:text-charcoal">
          ← Back to suppliers
        </Link>
        <SetupNotice title="Supplier detail is unavailable" detail={serviceError.message} />
      </div>
    );
  }
}
