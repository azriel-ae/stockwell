/**
 * Supplier service. Deleting a supplier still referenced by products is
 * refused with an explanation, and the detail view lists its products.
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
import { mapProduct, mapSupplier } from "@/lib/models";
import type { Product, Supplier } from "@/lib/models";
import { ServiceError, fromDrivebaseError } from "./errors";
import type { SupplierCreateInput, SupplierUpdateInput } from "@/lib/validation";

function toDrivebaseValues(input: Partial<SupplierCreateInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("name" in input) out.name = input.name ?? "";
  if ("contactPerson" in input) out.contact_person = input.contactPerson ?? null;
  if ("email" in input) out.email = input.email ?? null;
  if ("phone" in input) out.phone = input.phone ?? null;
  if ("address" in input) out.address = input.address ?? null;
  if ("notes" in input) out.notes = input.notes ?? null;
  return out;
}

export async function listSuppliers(): Promise<Array<Supplier & { productCount: number }>> {
  try {
    const [rows, products] = await Promise.all([
      getAllRecords(TABLES.suppliers, { maxPages: 5, sort: "name" }),
      getAllRecords(TABLES.products, { maxPages: 10, fields: ["supplier_id"] }),
    ]);
    const counts = new Map<string, number>();
    for (const p of products.map(mapProduct)) {
      if (p.supplierId) counts.set(p.supplierId, (counts.get(p.supplierId) ?? 0) + 1);
    }
    return rows.map(mapSupplier).map((s) => ({ ...s, productCount: counts.get(s.id) ?? 0 }));
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function getSupplier(
  id: string,
): Promise<{ supplier: Supplier; products: Product[] } | null> {
  try {
    const rec = await getRecord(TABLES.suppliers, id);
    if (!rec) return null;
    const supplier = mapSupplier(rec);
    const { records } = await listRecords(TABLES.products, {
      filters: [{ column: "supplier_id", value: id }],
      limit: 100,
      sort: "name",
    });
    return { supplier, products: records.map(mapProduct) };
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function createSupplier(input: SupplierCreateInput): Promise<Supplier> {
  try {
    const rec = await insertRecord(TABLES.suppliers, toDrivebaseValues(input));
    return mapSupplier(rec);
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function updateSupplier(id: string, input: SupplierUpdateInput): Promise<Supplier> {
  try {
    const rec = await updateRecord(TABLES.suppliers, id, toDrivebaseValues(input));
    return mapSupplier(rec);
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function deleteSupplier(id: string): Promise<{ productCount: number }> {
  try {
    const { meta } = await listRecords(TABLES.products, {
      filters: [{ column: "supplier_id", value: id }],
      limit: 1,
    });
    if (meta.total_matched > 0) {
      throw new ServiceError(
        409,
        "supplier_in_use",
        `This supplier is still linked to ${meta.total_matched} product${meta.total_matched === 1 ? "" : "s"}. Reassign or remove those products first.`,
      );
    }
    await deleteRecord(TABLES.suppliers, id);
    return { productCount: 0 };
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw fromDrivebaseError(err);
  }
}
