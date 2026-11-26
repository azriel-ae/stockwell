import { CategoriesView } from "@/components/categories-view";
import { listCategories } from "@/lib/services/categories.service";
import { fromDrivebaseError } from "@/lib/services/errors";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  try {
    const categories = await listCategories();
    return <CategoriesView categories={categories} />;
  } catch (err) {
    const serviceError = fromDrivebaseError(err);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Categories</h1>
          <p className="mt-0.5 text-xs text-mutedslate">Group products into categories.</p>
        </div>
        <SetupNotice title="Categories are unavailable" detail={serviceError.message} />
      </div>
    );
  }
}
