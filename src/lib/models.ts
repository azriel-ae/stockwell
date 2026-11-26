/**
 * Domain models and mappers from Drivebase record payloads.
 *
 * Google Sheets serves cell values as strings; `coerce*` (adapter) restores
 * types, then these mappers shape records into typed domain objects.
 * `?expand=` replaces relationship column values with related record
 * objects — mappers accept both the raw id and the expanded form.
 */

import { coerceNumber, coerceText } from "@/lib/drivebase/records";
import type { RecordPayload } from "@/lib/drivebase/types";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type MovementType = "in" | "out" | "adjustment";

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  purchasePrice: number | null;
  sellingPrice: number | null;
  stockQuantity: number;
  minimumStock: number;
  unit: string | null;
  imageFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** Filled by services: number of products in this category. */
  productCount?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  productCount?: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  movementType: MovementType;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  movementDate: string;
  notes: string | null;
  referenceNumber: string | null;
  operationKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Operation {
  id: string;
  operationKey: string;
  kind: string;
  status: "pending" | "applied" | "failed";
  productId: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function refId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** Name of an expanded relationship object, when present. */
function refName(value: unknown): string | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const name = (value as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function mapProduct(rec: RecordPayload): Product {
  return {
    id: rec.id,
    sku: coerceText(rec.sku) ?? "",
    name: coerceText(rec.name) ?? "",
    description: coerceText(rec.description),
    categoryId: refId(rec.category_id),
    categoryName: refName(rec.category_id),
    supplierId: refId(rec.supplier_id),
    supplierName: refName(rec.supplier_id),
    purchasePrice: coerceNumber(rec.purchase_price),
    sellingPrice: coerceNumber(rec.selling_price),
    stockQuantity: coerceNumber(rec.stock_quantity) ?? 0,
    minimumStock: coerceNumber(rec.minimum_stock) ?? 0,
    unit: coerceText(rec.unit),
    imageFileId: refId(rec.image),
    createdAt: rec.created_at,
    updatedAt: rec.updated_at,
  };
}

export function mapCategory(rec: RecordPayload): Category {
  return {
    id: rec.id,
    name: coerceText(rec.name) ?? "",
    description: coerceText(rec.description),
    createdAt: rec.created_at,
    updatedAt: rec.updated_at,
  };
}

export function mapSupplier(rec: RecordPayload): Supplier {
  return {
    id: rec.id,
    name: coerceText(rec.name) ?? "",
    contactPerson: coerceText(rec.contact_person),
    email: coerceText(rec.email),
    phone: coerceText(rec.phone),
    address: coerceText(rec.address),
    notes: coerceText(rec.notes),
    createdAt: rec.created_at,
    updatedAt: rec.updated_at,
  };
}

const MOVEMENT_TYPES: MovementType[] = ["in", "out", "adjustment"];

export function mapMovement(rec: RecordPayload): StockMovement {
  const rawType = coerceText(rec.movement_type) ?? "";
  return {
    id: rec.id,
    productId: coerceText(rec.product_id) ?? "",
    movementType: MOVEMENT_TYPES.includes(rawType as MovementType) ? (rawType as MovementType) : "adjustment",
    quantity: coerceNumber(rec.quantity) ?? 0,
    previousStock: coerceNumber(rec.previous_stock) ?? 0,
    resultingStock: coerceNumber(rec.resulting_stock) ?? 0,
    movementDate: coerceText(rec.movement_date) ?? rec.created_at.slice(0, 10),
    notes: coerceText(rec.notes),
    referenceNumber: coerceText(rec.reference_number),
    operationKey: coerceText(rec.operation_key),
    createdAt: rec.created_at,
    updatedAt: rec.updated_at,
  };
}

export function mapOperation(rec: RecordPayload): Operation {
  const rawStatus = coerceText(rec.status) ?? "";
  return {
    id: rec.id,
    operationKey: coerceText(rec.operation_key) ?? "",
    kind: coerceText(rec.kind) ?? "",
    status: (["pending", "applied", "failed"] as const).includes(rawStatus as Operation["status"])
      ? (rawStatus as Operation["status"])
      : "failed",
    productId: coerceText(rec.product_id),
    payload: jsonObject(rec.payload),
    result: jsonObject(rec.result),
    createdAt: rec.created_at,
    updatedAt: rec.updated_at,
  };
}
