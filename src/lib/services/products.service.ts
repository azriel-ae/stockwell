/**
 * Product service — CRUD, search/filter/sort/pagination, SKU uniqueness and
 * image management via Drivebase Storage.
 *
 * Search and status filtering run in the Stockwell service (Drivebase has
 * no OR filters and stock status is derived, not stored). The whole
 * product list is fetched once per request (bounded to maxProducts) —
 * the adapter caches reads for 15 s to stay inside Drivebase's
 * 120 req/min rate limit.
 */

import { TABLES } from "@/lib/drivebase/config";
import {
  deleteRecord,
  getAllRecords,
  getRecord,
  insertRecord,
  listRecords,
  runBatch,
  updateRecord,
} from "@/lib/drivebase/records";
import { deleteFile, uploadFile } from "@/lib/drivebase/storage";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  sniffImageMime,
} from "@/lib/drivebase/storage";
import { mapProduct } from "@/lib/models";
import type { Product } from "@/lib/models";
import { productStatus } from "@/lib/stock";
import type { StockStatus } from "@/lib/models";
import { ServiceError, fromDrivebaseError } from "./errors";
import type { ProductCreateInput, ProductUpdateInput } from "@/lib/validation";

const MAX_PRODUCTS = 1000;

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  status?: StockStatus;
  sort?: "name" | "sku" | "stock" | "updated" | "created";
  page?: number;
  perPage?: number;
}

export interface ProductPage {
  products: Product[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

function toDrivebaseValues(input: Partial<ProductCreateInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("sku" in input) out.sku = input.sku;
  if ("name" in input) out.name = input.name;
  if ("description" in input) out.description = input.description ?? null;
  if ("categoryId" in input) out.category_id = input.categoryId || null;
  if ("supplierId" in input) out.supplier_id = input.supplierId || null;
  if ("purchasePrice" in input) out.purchase_price = input.purchasePrice ?? null;
  if ("sellingPrice" in input) out.selling_price = input.sellingPrice ?? null;
  if ("stockQuantity" in input) out.stock_quantity = input.stockQuantity ?? 0;
  if ("minimumStock" in input) out.minimum_stock = input.minimumStock ?? 0;
  if ("unit" in input) out.unit = input.unit || null;
  if ("imageFileId" in input) out.image = input.imageFileId || null;
  return out;
}

async function assertSkuAvailable(sku: string, ignoreProductId?: string): Promise<void> {
  const { records } = await listRecords(TABLES.products, {
    filters: [{ column: "sku", value: sku }],
    limit: 5,
  });
  const clash = records.find((r) => r.id !== ignoreProductId);
  if (clash) {
    throw new ServiceError(
      409,
      "sku_conflict",
      `SKU “${sku}” is already used by another product.`,
      { sku: "This SKU already exists" },
    );
  }
}

/** Validates that referenced category/supplier rows exist. */
async function assertReferencesExist(input: Partial<ProductCreateInput>): Promise<void> {
  if (input.categoryId) {
    const cat = await getRecord(TABLES.categories, input.categoryId);
    if (!cat) {
      throw new ServiceError(422, "invalid_reference", "The selected category does not exist.", {
        categoryId: "Category not found",
      });
    }
  }
  if (input.supplierId) {
    const sup = await getRecord(TABLES.suppliers, input.supplierId);
    if (!sup) {
      throw new ServiceError(422, "invalid_reference", "The selected supplier does not exist.", {
        supplierId: "Supplier not found",
      });
    }
  }
}

export async function listProducts(query: ProductQuery = {}): Promise<ProductPage> {
  try {
    // expand proves the Drivebase relationship metadata works and gives
    // category/supplier names in one read.
    const records = await getAllRecords(TABLES.products, {
      maxPages: Math.ceil(MAX_PRODUCTS / 100),
      expand: ["category_id", "supplier_id"],
      sort: "name",
    });
    let products = records.map(mapProduct);

    if (query.search) {
      const q = query.search.trim().toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q),
      );
    }
    if (query.categoryId) products = products.filter((p) => p.categoryId === query.categoryId);
    if (query.supplierId) products = products.filter((p) => p.supplierId === query.supplierId);
    if (query.status) {
      products = products.filter((p) => productStatus(p) === query.status);
    }

    switch (query.sort) {
      case "sku":
        products.sort((a, b) => a.sku.localeCompare(b.sku));
        break;
      case "stock":
        products.sort((a, b) => a.stockQuantity - b.stockQuantity);
        break;
      case "updated":
        products.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        break;
      case "created":
        products.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "name":
      default:
        products.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    const perPage = Math.min(Math.max(query.perPage ?? 25, 1), 100);
    const total = products.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);
    return {
      products: products.slice((page - 1) * perPage, page * perPage),
      total,
      page,
      perPage,
      totalPages,
    };
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function getProduct(id: string): Promise<Product | null> {
  try {
    const rec = await getRecord(TABLES.products, id, { expand: ["category_id", "supplier_id"] });
    return rec ? mapProduct(rec) : null;
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

export async function createProduct(
  input: ProductCreateInput,
  idempotencyKey?: string,
): Promise<Product> {
  try {
    await assertSkuAvailable(input.sku);
    await assertReferencesExist(input);
    const rec = await insertRecord(TABLES.products, toDrivebaseValues(input), {
      idempotencyKey: idempotencyKey ? `product-create:${idempotencyKey}` : undefined,
    });
    return mapProduct(rec);
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw fromDrivebaseError(err);
  }
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput,
  idempotencyKey?: string,
): Promise<Product> {
  try {
    if (input.sku !== undefined) await assertSkuAvailable(input.sku, id);
    if (input.categoryId !== undefined || input.supplierId !== undefined) {
      await assertReferencesExist({
        categoryId: input.categoryId !== undefined ? input.categoryId ?? undefined : undefined,
        supplierId: input.supplierId !== undefined ? input.supplierId ?? undefined : undefined,
      });
    }
    const rec = await updateRecord(TABLES.products, id, toDrivebaseValues(input), {
      idempotencyKey: idempotencyKey ? `product-update:${idempotencyKey}` : undefined,
      expand: ["category_id", "supplier_id"],
    });
    return mapProduct(rec);
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw fromDrivebaseError(err);
  }
}

/**
 * Deletes a product, its movement history and its image file. Movement
 * rows are removed first (app-level cascade; Sheets has no native FK).
 */
export async function deleteProduct(id: string): Promise<void> {
  try {
    const product = await getProduct(id);
    if (!product) {
      throw new ServiceError(404, "not_found", "Product not found.");
    }
    // Remove movement history first (app-level cascade; Sheets has no
    // native FK). Loop until the filtered list is empty; failures abort.
    for (;;) {
      const { records } = await listRecords(TABLES.stockMovements, {
        filters: [{ column: "product_id", value: id }],
        limit: 100,
      });
      if (records.length === 0) break;
      const chunk = records.slice(0, 25);
      const results = await runBatch(
        chunk.map((r) => ({ op: "delete" as const, table: TABLES.stockMovements, id: r.id })),
      );
      const failed = results.filter((r) => r.status === "failed");
      if (failed.length > 0) {
        throw new ServiceError(
          502,
          "cascade_failed",
          "Could not delete the product's movement history. Nothing was removed — please retry.",
        );
      }
    }
    await deleteRecord(TABLES.products, id);
    if (product.imageFileId) {
      try {
        await deleteFile(product.imageFileId);
      } catch {
        // Best-effort: the product is already gone; a dangling file is
        // cleaned from the Drivebase storage page.
      }
    }
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw fromDrivebaseError(err);
  }
}

/* ------------------------- product image storage ------------------------- */

export interface ImageUpload {
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

/** Uploads, validates and attaches a product image; replaces any old one. */
export async function setProductImage(
  productId: string,
  upload: ImageUpload,
): Promise<Product> {
  try {
    const product = await getProduct(productId);
    if (!product) throw new ServiceError(404, "not_found", "Product not found.");

    if (!ALLOWED_IMAGE_MIME.includes(upload.mimeType as (typeof ALLOWED_IMAGE_MIME)[number])) {
      throw new ServiceError(
        415,
        "unsupported_image",
        "Only PNG, JPEG, WebP and GIF images are allowed.",
      );
    }
    if (upload.bytes.byteLength <= 0) {
      throw new ServiceError(422, "empty_image", "The uploaded file is empty.");
    }
    if (upload.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new ServiceError(
        413,
        "image_too_large",
        `Images must be ${MAX_IMAGE_BYTES / (1024 * 1024)} MB or smaller.`,
      );
    }
    const sniffed = sniffImageMime(upload.bytes);
    if (!sniffed) {
      throw new ServiceError(
        415,
        "unsupported_image",
        "The file does not look like a valid image.",
      );
    }

    const file = await uploadFile({
      name: sanitizeFileName(upload.name),
      mimeType: upload.mimeType,
      bytes: upload.bytes,
    });
    const updated = await updateRecord(
      TABLES.products,
      productId,
      { image: file.id },
      { expand: ["category_id", "supplier_id"] },
    );
    // Replace: remove the previous file (best-effort).
    if (product.imageFileId && product.imageFileId !== file.id) {
      try {
        await deleteFile(product.imageFileId);
      } catch {
        // Best-effort cleanup.
      }
    }
    return mapProduct(updated);
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw fromDrivebaseError(err);
  }
}

export async function clearProductImage(productId: string): Promise<Product> {
  try {
    const product = await getProduct(productId);
    if (!product) throw new ServiceError(404, "not_found", "Product not found.");
    const updated = await updateRecord(
      TABLES.products,
      productId,
      { image: null },
      { expand: ["category_id", "supplier_id"] },
    );
    if (product.imageFileId) {
      try {
        await deleteFile(product.imageFileId);
      } catch {
        // Best-effort cleanup.
      }
    }
    return mapProduct(updated);
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw fromDrivebaseError(err);
  }
}

function sanitizeFileName(name: string): string {
  const base = (name || "product-image").replace(/[/\\]/g, "-").slice(0, 120);
  return base;
}
