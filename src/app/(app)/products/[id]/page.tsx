import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDetailView } from "@/components/products/product-detail";
import { getProduct } from "@/lib/services/products.service";
import { listMovementsForProduct, reconcileProductStock } from "@/lib/services/stock-movements.service";
import { getSettings } from "@/lib/services/settings.service";
import { ServiceError, fromDrivebaseError } from "@/lib/services/errors";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const product = await getProduct(id);
    if (!product) notFound();
    const [movements, integrity, settings] = await Promise.all([
      listMovementsForProduct(id),
      reconcileProductStock(id),
      getSettings(),
    ]);
    return (
      <ProductDetailView
        product={product}
        movements={movements.slice().reverse()}
        integrity={integrity}
        currency={settings.currency}
      />
    );
  } catch (err) {
    const serviceError =
      err instanceof ServiceError ? err : fromDrivebaseError(err);
    return (
      <div className="space-y-6">
        <Link href="/products" className="text-xs text-mutedslate hover:text-charcoal">
          ← Back to products
        </Link>
        <SetupNotice title="Product detail is unavailable" detail={serviceError.message} />
      </div>
    );
  }
}
