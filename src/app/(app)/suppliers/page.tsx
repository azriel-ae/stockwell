import { SuppliersView } from "@/components/suppliers-view";
import { listSuppliers } from "@/lib/services/suppliers.service";
import { fromDrivebaseError } from "@/lib/services/errors";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  try {
    const suppliers = await listSuppliers();
    return <SuppliersView suppliers={suppliers} />;
  } catch (err) {
    const serviceError = fromDrivebaseError(err);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Suppliers</h1>
          <p className="mt-0.5 text-xs text-mutedslate">Who you buy from.</p>
        </div>
        <SetupNotice title="Suppliers are unavailable" detail={serviceError.message} />
      </div>
    );
  }
}
