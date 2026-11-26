import { ProductsView } from "@/components/products/products-view";
import { listProducts } from "@/lib/services/products.service";
import { listCategories } from "@/lib/services/categories.service";
import { listSuppliers } from "@/lib/services/suppliers.service";
import { getSettings } from "@/lib/services/settings.service";
import { fromDrivebaseError } from "@/lib/services/errors";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : undefined;
  const categoryId = typeof params.categoryId === "string" ? params.categoryId : "";
  const supplierId = typeof params.supplierId === "string" ? params.supplierId : "";

  try {
    const [page, categories, suppliers, settings] = await Promise.all([
      listProducts({
        page: 1,
        perPage: 25,
        categoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
      }),
      listCategories(),
      listSuppliers(),
      getSettings(),
    ]);
    return (
      <ProductsView
        initialPage={page}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        currency={settings.currency}
        defaultUnit={settings.defaultUnit}
        lowStockThreshold={settings.lowStockThreshold}
        openNew={action === "new"}
        initialCategoryId={categoryId}
        initialSupplierId={supplierId}
      />
    );
  } catch (err) {
    const serviceError = fromDrivebaseError(err);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Products</h1>
          <p className="mt-0.5 text-xs text-mutedslate">Product catalog stored in Drivebase.</p>
        </div>
        <SetupNotice title="Products are unavailable" detail={serviceError.message} />
      </div>
    );
  }
}
