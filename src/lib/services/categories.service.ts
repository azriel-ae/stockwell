/**
 * Category service. Deleting a category that is still referenced by
 * products is refused with an explanation (no silent data loss).
 */

import { TABLES } from "@/lib/drivebase/config";
import {
  deleteRecord,
  getAllRecords,
  getRecord,
  insertRecord,
  listRecords,
  updateRecord,
} from "@/lib/drivebase/records";
import { CATEGORY_COLUMNS } from "@/lib/schema";
import { mapCategory, mapProduct } from "@/lib/models";
import type { Category } from "@/lib/models";
import { ServiceError, fromDrivebaseError } from "./errors";
import type { CategoryCreateInput, CategoryUpdateInput } from "@/lib/validation";

function toDrivebaseValues(input: Partial<CategoryCreateInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("name" in input) out.name = input.name ?? "";
  if ("description" in input) out.description = input.description ?? null;
  return out;
}

export async function listCategories(): Promise<
  Array<Category & { productCount: number }>
> {
  try {
    const [rows, products] = await Promise.all([
      getAllRecords(TABLES.categories, { maxPages: 5, sort: "name" }),
      getAllRecords(TABLES.products, { maxPages: 10, fields: ["category_id"] }),
    ]);
    const counts = new Map<string, number>();
    for (const p of products.map(mapProduct)) {
      if (p.categoryId) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    }
    return rows.map(mapCategory).map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 }));
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function getCategory(id: string): Promise<Category | null> {
  try {
    const rec = await getRecord(TABLES.categories, id);
    return rec ? mapCategory(rec) : null;
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function createCategory(input: CategoryCreateInput): Promise<Category> {
  try {
    const rec = await insertRecord(TABLES.categories, toDrivebaseValues(input));
    return mapCategory(rec);
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function updateCategory(id: string, input: CategoryUpdateInput): Promise<Category> {
  try {
    const values = toDrivebaseValues(input);
    const rec = await updateRecord(TABLES.categories, id, values);
    return mapCategory(rec);
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function deleteCategory(id: string): Promise<{ productCount: number }> {
  try {
    // Guard: refuse deletion while products still reference the category.
    const referencing = await countProductsInCategory(id);
    if (referencing > 0) {
      throw new ServiceError(
        409,
        "category_in_use",
        `This category is still used by ${referencing} product${referencing === 1 ? "" : "s"}. Reassign or remove those products first.`,
      );
    }
    await deleteRecord(TABLES.categories, id);
    return { productCount: 0 };
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw fromDrivebaseError(err);
  }
}

export async function countProductsInCategory(categoryId: string): Promise<number> {
  const { meta } = await listRecords(TABLES.products, {
    filters: [{ column: "category_id", value: categoryId }],
    limit: 1,
  });
  return meta.total_matched;
}

/** Column definitions for normalizing category records. */
export { CATEGORY_COLUMNS };
