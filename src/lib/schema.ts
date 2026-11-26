/**
 * Stockwell domain schema: the exact set of Drivebase tables, columns,
 * and relationships the app expects. Used by the idempotent initializer
 * and by record normalization.
 */

import type { ColumnDef } from "@/lib/drivebase/types";

export const PRODUCT_COLUMNS: ColumnDef[] = [
  { name: "sku", type: "text", required: true, description: "Unique product code" },
  { name: "name", type: "text", required: true },
  { name: "description", type: "text" },
  { name: "category_id", type: "text", description: "References categories.__id" },
  { name: "supplier_id", type: "text", description: "References suppliers.__id" },
  { name: "purchase_price", type: "number" },
  { name: "selling_price", type: "number" },
  { name: "stock_quantity", type: "number", default: 0 },
  { name: "minimum_stock", type: "number", default: 0 },
  { name: "unit", type: "text" },
  {
    name: "image",
    type: "text",
    description:
      "Drivebase file id (product photo) set via the Storage API. TEXT rather than FILE so the schema is identical whether tables are created by the REST initializer or the dashboard SQL editor (which has no FILE type)",
  },
];

export const CATEGORY_COLUMNS: ColumnDef[] = [
  { name: "name", type: "text", required: true },
  { name: "description", type: "text" },
];

export const SUPPLIER_COLUMNS: ColumnDef[] = [
  { name: "name", type: "text", required: true },
  { name: "contact_person", type: "text" },
  { name: "email", type: "email" },
  { name: "phone", type: "text" },
  { name: "address", type: "text" },
  { name: "notes", type: "text" },
];

export const STOCK_MOVEMENT_COLUMNS: ColumnDef[] = [
  { name: "product_id", type: "text", required: true, description: "References products.__id" },
  { name: "movement_type", type: "text", required: true, description: "in | out | adjustment" },
  { name: "quantity", type: "number", required: true, description: "Signed for adjustment" },
  { name: "previous_stock", type: "number", required: true },
  { name: "resulting_stock", type: "number", required: true },
  {
    name: "movement_date",
    type: "date",
    required: true,
    description: "Business date (YYYY-MM-DD) — used for report filtering",
  },
  { name: "notes", type: "text" },
  { name: "reference_number", type: "text" },
  { name: "operation_key", type: "text", description: "Links to operations.operation_key" },
];

export const APP_SETTINGS_COLUMNS: ColumnDef[] = [
  { name: "key", type: "text", required: true },
  {
    name: "value",
    type: "text",
    required: true,
    description: "Plain-text setting value; typed fields are normalized on read",
  },
];

export const OPERATIONS_COLUMNS: ColumnDef[] = [
  { name: "operation_key", type: "text", required: true, description: "Idempotency key of the user action" },
  { name: "kind", type: "text", required: true, description: "stock_movement | product_delete | …" },
  { name: "status", type: "text", required: true, description: "pending | applied | failed" },
  { name: "product_id", type: "text" },
  { name: "payload", type: "json" },
  { name: "result", type: "json" },
];

export interface ExpectedTable {
  name: string;
  columns: ColumnDef[];
  description: string;
}

export const EXPECTED_TABLES: ExpectedTable[] = [
  { name: "products", columns: PRODUCT_COLUMNS, description: "Stockwell product catalog" },
  { name: "categories", columns: CATEGORY_COLUMNS, description: "Stockwell product categories" },
  { name: "suppliers", columns: SUPPLIER_COLUMNS, description: "Stockwell suppliers" },
  { name: "stock_movements", columns: STOCK_MOVEMENT_COLUMNS, description: "Stockwell movement ledger" },
  { name: "app_settings", columns: APP_SETTINGS_COLUMNS, description: "Stockwell application settings" },
  { name: "operations", columns: OPERATIONS_COLUMNS, description: "Stockwell consistency bookkeeping" },
];

export interface ExpectedRelationship {
  name: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  type: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
  description: string;
}

export const EXPECTED_RELATIONSHIPS: ExpectedRelationship[] = [
  {
    name: "products → categories",
    sourceTable: "products",
    sourceColumn: "category_id",
    targetTable: "categories",
    targetColumn: "__id",
    type: "many_to_one",
    description: "Each product belongs to one category",
  },
  {
    name: "products → suppliers",
    sourceTable: "products",
    sourceColumn: "supplier_id",
    targetTable: "suppliers",
    targetColumn: "__id",
    type: "many_to_one",
    description: "Each product is supplied by one supplier",
  },
  {
    name: "stock_movements → products",
    sourceTable: "stock_movements",
    sourceColumn: "product_id",
    targetTable: "products",
    targetColumn: "__id",
    type: "many_to_one",
    description: "Each movement affects one product",
  },
];
