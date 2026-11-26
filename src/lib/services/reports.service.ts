/**
 * Reports & dashboard aggregation. Every number is computed from actual
 * Drivebase data (products, stock_movements, categories, app_settings) —
 * nothing is hardcoded. Empty states are surfaced, never faked.
 */

import { TABLES } from "@/lib/drivebase/config";
import { getAllRecords } from "@/lib/drivebase/records";
import { mapCategory, mapMovement, mapProduct } from "@/lib/models";
import type { Category, Product, StockMovement, Supplier } from "@/lib/models";
import { mapSupplier } from "@/lib/models";
import { productStatus } from "@/lib/stock";
import { fromDrivebaseError } from "./errors";
import { getSettings } from "./settings.service";

export interface DashboardStats {
  totalProducts: number;
  totalStockUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalInventoryValue: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentMovements: Array<StockMovement & { productName: string | null; productSku: string | null }>;
  trend: Array<{ date: string; in: number; out: number }>;
  categoryDistribution: Array<{ category: string; units: number; products: number; value: number }>;
  topProducts: Array<{ id: string; name: string; sku: string; stock: number; minimum: number; unit: string | null }>;
  currency: string;
  empty: boolean;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  categoryId?: string;
}

export interface ReportData {
  filters: ReportFilters;
  stats: DashboardStats;
  movementTotals: { in: number; out: number; adjustments: number; net: number; count: number };
  movements: Array<StockMovement & { productName: string | null; productSku: string | null }>;
  byCategory: Array<{ category: string; units: number; products: number; value: number }>;
  lowStockProducts: Array<{ id: string; sku: string; name: string; stock: number; minimum: number; unit: string | null }>;
  outOfStockProducts: Array<{ id: string; sku: string; name: string; unit: string | null }>;
  currency: string;
  categories: Array<Category & { productCount: number }>;
}

async function fetchCore(): Promise<{
  products: Product[];
  categories: Category[];
  suppliers: Supplier[];
}> {
  const [productRows, categoryRows, supplierRows] = await Promise.all([
    getAllRecords(TABLES.products, { maxPages: 10, expand: ["category_id", "supplier_id"], sort: "name" }),
    getAllRecords(TABLES.categories, { maxPages: 5, sort: "name" }),
    getAllRecords(TABLES.suppliers, { maxPages: 5, sort: "name" }),
  ]);
  return {
    products: productRows.map(mapProduct),
    categories: categoryRows.map(mapCategory),
    suppliers: supplierRows.map(mapSupplier),
  };
}

function computeStats(products: Product[]): DashboardStats {
  let totalStockUnits = 0;
  let totalInventoryValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const p of products) {
    totalStockUnits += p.stockQuantity;
    totalInventoryValue += (p.purchasePrice ?? 0) * p.stockQuantity;
    switch (productStatus(p)) {
      case "low_stock":
        lowStockCount++;
        break;
      case "out_of_stock":
        outOfStockCount++;
        break;
      default:
        break;
    }
  }
  return {
    totalProducts: products.length,
    totalStockUnits,
    lowStockCount,
    outOfStockCount,
    totalInventoryValue,
  };
}

function inRange(movement: StockMovement, from?: string, to?: string): boolean {
  const d = movement.movementDate;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const [{ products, categories }, movementRows, settings] = await Promise.all([
      fetchCore(),
      getAllRecords(TABLES.stockMovements, { maxPages: 10, sort: "-__created_at" }),
      getSettings(),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const movements = movementRows.map(mapMovement);

    const withNames = movements.map((m) => ({
      ...m,
      productName: productMap.get(m.productId)?.name ?? null,
      productSku: productMap.get(m.productId)?.sku ?? null,
    }));

    // Movement trend: last 14 days (including empty days).
    const trend: Array<{ date: string; in: number; out: number }> = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      trend.push({ date: d.toISOString().slice(0, 10), in: 0, out: 0 });
    }
    const trendMap = new Map(trend.map((t) => [t.date, t]));
    for (const m of withNames) {
      const t = trendMap.get(m.movementDate);
      if (!t) continue;
      if (m.movementType === "in") t.in += m.quantity;
      if (m.movementType === "out") t.out += m.quantity;
    }

    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const categoryMap = new Map<string, { units: number; products: number; value: number }>();
    for (const p of products) {
      const key = p.categoryId ?? "uncategorized";
      const bucket = categoryMap.get(key) ?? { units: 0, products: 0, value: 0 };
      bucket.units += p.stockQuantity;
      bucket.products += 1;
      bucket.value += (p.purchasePrice ?? 0) * p.stockQuantity;
      categoryMap.set(key, bucket);
    }
    const categoryDistribution = [...categoryMap.entries()]
      .map(([id, v]) => ({
        category: id === "uncategorized" ? "Uncategorized" : categoryNames.get(id) ?? "Unknown",
        ...v,
      }))
      .sort((a, b) => b.units - a.units);

    const topProducts = [...products]
      .sort((a, b) => b.stockQuantity - a.stockQuantity)
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stockQuantity,
        minimum: p.minimumStock,
        unit: p.unit,
      }));

    return {
      stats: computeStats(products),
      recentMovements: withNames.slice(0, 8),
      trend,
      categoryDistribution,
      topProducts,
      currency: settings.currency,
      empty: products.length === 0,
    };
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function getReport(filters: ReportFilters = {}): Promise<ReportData> {
  try {
    const [{ products, categories }, movementRows, settings] = await Promise.all([
      fetchCore(),
      getAllRecords(TABLES.stockMovements, { maxPages: 10, sort: "-__created_at" }),
      getSettings(),
    ]);
    const filteredProducts =
      filters.categoryId !== undefined
        ? products.filter((p) => p.categoryId === filters.categoryId)
        : products;

    const productMap = new Map(products.map((p) => [p.id, p]));
    const filteredProductIds =
      filters.categoryId !== undefined ? new Set(filteredProducts.map((p) => p.id)) : null;

    const movements = movementRows
      .map(mapMovement)
      .filter((m) => (filteredProductIds ? filteredProductIds.has(m.productId) : true))
      .filter((m) => inRange(m, filters.from, filters.to));

    const withNames = movements.map((m) => ({
      ...m,
      productName: productMap.get(m.productId)?.name ?? null,
      productSku: productMap.get(m.productId)?.sku ?? null,
    }));

    let inQty = 0;
    let outQty = 0;
    let adjustments = 0;
    for (const m of movements) {
      if (m.movementType === "in") inQty += m.quantity;
      else if (m.movementType === "out") outQty += m.quantity;
      else adjustments += m.quantity;
    }

    const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
    const categoryMap = new Map<string, { units: number; products: number; value: number }>();
    for (const p of filteredProducts) {
      const key = p.categoryId ?? "uncategorized";
      const bucket = categoryMap.get(key) ?? { units: 0, products: 0, value: 0 };
      bucket.units += p.stockQuantity;
      bucket.products += 1;
      bucket.value += (p.purchasePrice ?? 0) * p.stockQuantity;
      categoryMap.set(key, bucket);
    }
    const byCategory = [...categoryMap.entries()]
      .map(([id, v]) => ({
        category: id === "uncategorized" ? "Uncategorized" : categoryNames.get(id) ?? "Unknown",
        ...v,
      }))
      .sort((a, b) => b.value - a.value);

    const lowStock = filteredProducts
      .filter((p) => productStatus(p) === "low_stock")
      .map((p) => ({ id: p.id, sku: p.sku, name: p.name, stock: p.stockQuantity, minimum: p.minimumStock, unit: p.unit }));
    const outOfStock = filteredProducts
      .filter((p) => productStatus(p) === "out_of_stock")
      .map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit }));

    const productCounts = new Map<string, number>();
    for (const p of products) {
      if (p.categoryId) productCounts.set(p.categoryId, (productCounts.get(p.categoryId) ?? 0) + 1);
    }

    return {
      filters,
      stats: computeStats(filteredProducts),
      movementTotals: {
        in: inQty,
        out: outQty,
        adjustments,
        net: inQty - outQty + adjustments,
        count: movements.length,
      },
      movements: withNames,
      byCategory,
      lowStockProducts: lowStock,
      outOfStockProducts: outOfStock,
      currency: settings.currency,
      categories: categories.map((c) => ({ ...c, productCount: productCounts.get(c.id) ?? 0 })),
    };
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

/* --------------------------------- CSV export -------------------------------- */

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

export async function productsCsv(): Promise<string> {
  const { products } = await fetchCore();
  const rows: Array<Array<string | number | null>> = [
    [
      "sku",
      "name",
      "category",
      "supplier",
      "purchase_price",
      "selling_price",
      "stock_quantity",
      "minimum_stock",
      "unit",
      "status",
      "created_at",
    ],
  ];
  for (const p of products) {
    rows.push([
      p.sku,
      p.name,
      p.categoryName,
      p.supplierName,
      p.purchasePrice,
      p.sellingPrice,
      p.stockQuantity,
      p.minimumStock,
      p.unit,
      productStatus(p),
      p.createdAt,
    ]);
  }
  return toCsv(rows);
}

export async function movementsCsv(filters: ReportFilters = {}): Promise<string> {
  const { products } = await fetchCore();
  const movementRows = await getAllRecords(TABLES.stockMovements, {
    maxPages: 10,
    sort: "-__created_at",
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  const rows: Array<Array<string | number | null>> = [
    ["date", "created_at", "product_sku", "product_name", "type", "quantity", "previous_stock", "resulting_stock", "reference", "notes"],
  ];
  for (const raw of movementRows) {
    const m = mapMovement(raw);
    if (!inRange(m, filters.from, filters.to)) continue;
    if (filters.categoryId !== undefined) {
      const p = productMap.get(m.productId);
      if (!p || p.categoryId !== filters.categoryId) continue;
    }
    rows.push([
      m.movementDate,
      m.createdAt,
      productMap.get(m.productId)?.sku ?? null,
      productMap.get(m.productId)?.name ?? null,
      m.movementType,
      m.quantity,
      m.previousStock,
      m.resultingStock,
      m.referenceNumber,
      m.notes,
    ]);
  }
  return toCsv(rows);
}

export async function summaryCsv(filters: ReportFilters = {}): Promise<string> {
  const report = await getReport(filters);
  const rows: Array<Array<string | number | null>> = [
    ["metric", "value"],
    ["total_products", report.stats.totalProducts],
    ["total_stock_units", report.stats.totalStockUnits],
    ["total_inventory_value", report.stats.totalInventoryValue],
    ["low_stock_products", report.stats.lowStockCount],
    ["out_of_stock_products", report.stats.outOfStockCount],
    ["stock_in_units", report.movementTotals.in],
    ["stock_out_units", report.movementTotals.out],
    ["adjustment_units", report.movementTotals.adjustments],
    ["movements_recorded", report.movementTotals.count],
    [],
    ["category", "products", "units", "value"],
  ];
  for (const c of report.byCategory) {
    rows.push([c.category, c.products, c.units, c.value]);
  }
  return toCsv(rows);
}
