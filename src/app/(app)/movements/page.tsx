import { MovementsView } from "@/components/movements-view";
import { listMovements } from "@/lib/services/stock-movements.service";
import { listProducts } from "@/lib/services/products.service";
import { fromDrivebaseError } from "@/lib/services/errors";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock movements" };

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : undefined;
  const productFilter = typeof params.product === "string" ? params.product : undefined;

  try {
    const [movements, products] = await Promise.all([
      listMovements({ productId: productFilter, perPage: 25 }),
      listProducts({ perPage: 100 }),
    ]);
    return (
      <MovementsView
        initialResult={movements}
        products={products.products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stock: p.stockQuantity,
          unit: p.unit,
        }))}
        openNew={action === "new"}
        initialProductFilter={productFilter ?? ""}
      />
    );
  } catch (err) {
    const serviceError = fromDrivebaseError(err);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Stock movements</h1>
          <p className="mt-0.5 text-xs text-mutedslate">
            Every stock change, with a full audit trail.
          </p>
        </div>
        <SetupNotice title="Movements are unavailable" detail={serviceError.message} />
      </div>
    );
  }
}
