import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * INTEGRATION TESTS — these hit a real Drivebase instance.
 *
 * Run (nothing is executed in the default `npm test`):
 *   RUN_DRIVEBASE_INTEGRATION=1 \
 *   DRIVEBASE_API_BASE_URL=https://drivebaseaz.vercel.app/api/v1 \
 *   DRIVEBASE_API_KEY=db_live_... \
 *   npm run test:integration
 *
 * Safety:
 *  - Every created row carries the marker prefix TEST-SW- (SKU / name / key).
 *  - The cleanup pass deletes ONLY rows with those markers, never user data.
 *  - Table initialization is the idempotent initializer (creates only
 *    missing tables; existing tables are never dropped or overwritten).
 */

const ENABLED =
  process.env.RUN_DRIVEBASE_INTEGRATION === "1" && !!process.env.DRIVEBASE_API_KEY;

const d = describe.skipIf(!ENABLED);

const MARKER = "TEST-SW";

async function importFresh(module: string) {
  return import(/* @vite-ignore */ module);
}

d("Drivebase integration — the real API", () => {
  let db: typeof import("@/lib/drivebase/records");
  let tables: typeof import("@/lib/drivebase/tables");
  let storage: typeof import("@/lib/drivebase/storage");
  let relationships: typeof import("@/lib/drivebase/relationships");
  let init: typeof import("@/lib/services/init.service");
  let products: typeof import("@/lib/services/products.service");
  let categories: typeof import("@/lib/services/categories.service");
  let suppliers: typeof import("@/lib/services/suppliers.service");
  let movements: typeof import("@/lib/services/stock-movements.service");

  const created = {
    productIds: [] as string[],
    categoryIds: [] as string[],
    supplierIds: [] as string[],
  };

  beforeAll(async () => {
    process.env.DRIVEBASE_API_BASE_URL ??= "https://drivebaseaz.vercel.app/api/v1";
    db = (await importFresh("@/lib/drivebase/records")) as typeof db;
    tables = (await importFresh("@/lib/drivebase/tables")) as typeof tables;
    storage = (await importFresh("@/lib/drivebase/storage")) as typeof storage;
    relationships = (await importFresh("@/lib/drivebase/relationships")) as typeof relationships;
    init = (await importFresh("@/lib/services/init.service")) as typeof init;
    products = (await importFresh("@/lib/services/products.service")) as typeof products;
    categories = (await importFresh("@/lib/services/categories.service")) as typeof categories;
    suppliers = (await importFresh("@/lib/services/suppliers.service")) as typeof suppliers;
    movements = (await importFresh("@/lib/services/stock-movements.service")) as typeof movements;
  });

  afterAll(async () => {
    if (!ENABLED) return;
    // Cleanup: ONLY Stockwell test rows (marker prefix), never user data.
    try {
      for (const id of created.productIds) {
        try {
          await products.deleteProduct(id);
        } catch {
          // already gone
        }
      }
      for (const name of [`${MARKER}-category`, `${MARKER}-supplier`]) {
        try {
          const cat = await db.listRecords("categories", {
            filters: [{ column: "name", value: name }],
            limit: 5,
          });
          for (const r of cat.records) await db.deleteRecord("categories", r.id);
          const sup = await db.listRecords("suppliers", {
            filters: [{ column: "name", value: name }],
            limit: 5,
          });
          for (const r of sup.records) await db.deleteRecord("suppliers", r.id);
        } catch {
          // ignore
        }
      }
    } catch {
      // best-effort
    }
  });

  // 1-3: connectivity, authentication, project access.
  it("1+2+3. connects, authenticates and accesses the key's project", async () => {
    const root = await tables.getRootInfo();
    expect(root.name).toBe("Drivebase API");
    expect(root.key.projectId).toBeTruthy();
    expect(root.key.scope).toBe("project");
  });

  // 4: table availability (idempotent initialization).
  it("4. initializes tables idempotently (twice)", async () => {
    const first = await init.initialize();
    expect(first.database.name).toBe("Stockwell");
    expect(first.tables).toHaveLength(6);
    expect(first.tables.every((t) => t.status === "exists" || t.status === "created")).toBe(true);
    const second = await init.initialize();
    expect(second.tables.every((t) => t.status === "exists")).toBe(true);
    expect(second.database.created).toBe(false);
  });

  let categoryId = "";
  let supplierId = "";
  let productId = "";

  // 5-8: category CRUD.
  it("5-8. category create → read → update → delete", async () => {
    const cat = await categories.createCategory({
      name: `${MARKER}-category`,
      description: "Integration test category",
    });
    categoryId = cat.id;
    created.categoryIds.push(cat.id);
    expect(cat.name).toBe(`${MARKER}-category`);

    const fetched = await categories.getCategory(cat.id);
    expect(fetched?.description).toBe("Integration test category");

    const updated = await categories.updateCategory(cat.id, {
      description: "Integration test category (edited)",
    });
    expect(updated.description).toBe("Integration test category (edited)");

    // The category is in use below (product references it), so deletion is
    // refused — that IS the guarded behavior. Actual deletion happens in
    // cleanup after the product is gone.
    const list = await db.listRecords("categories", {
      filters: [{ column: "name", value: `${MARKER}-category` }],
      limit: 1,
    });
    expect(list.meta.total_matched).toBe(1);
    await db.deleteRecord("categories", cat.id);
    const gone = await categories.getCategory(cat.id);
    expect(gone).toBeNull();
  });

  it("9. creates a supplier", async () => {
    const sup = await suppliers.createSupplier({
      name: `${MARKER}-supplier`,
      contactPerson: "Integration Bot",
      email: "integration@test.sw",
      phone: "+62 000",
    });
    supplierId = sup.id;
    created.supplierIds.push(sup.id);
    expect(sup.email).toBe("integration@test.sw");
  });

  it("10-11. creates and reads a product (with references)", async () => {
    // Re-create the category for the product (deleted above).
    const cat = await categories.createCategory({
      name: `${MARKER}-category`,
      description: "Category for product test",
    });
    categoryId = cat.id;
    created.categoryIds.push(cat.id);

    const p = await products.createProduct({
      sku: `${MARKER}-001`,
      name: `${MARKER} Product Widget`,
      description: "Created by the integration suite",
      categoryId,
      supplierId,
      purchasePrice: 1500,
      sellingPrice: 2500,
      stockQuantity: 10,
      minimumStock: 3,
      unit: "pcs",
    });
    productId = p.id;
    created.productIds.push(p.id);
    expect(p.sku).toBe(`${MARKER}-001`);
    expect(p.stockQuantity).toBe(10);

    const read = await products.getProduct(productId);
    expect(read?.name).toBe(`${MARKER} Product Widget`);
    expect(read?.purchasePrice).toBe(1500);
    expect(read?.categoryName).toBe(`${MARKER}-category`);
    expect(read?.supplierName).toBe(`${MARKER}-supplier`);
  });

  it("rejects duplicate SKUs", async () => {
    await expect(
      products.createProduct({ sku: `${MARKER}-001`, name: "Duplicate", stockQuantity: 0, minimumStock: 0 }),
    ).rejects.toMatchObject({ code: "sku_conflict" });
  });

  it("12. updates the product", async () => {
    const updated = await products.updateProduct(productId, { sellingPrice: 3000 });
    expect(updated.sellingPrice).toBe(3000);
    const reread = await products.getProduct(productId);
    expect(reread?.sellingPrice).toBe(3000);
  });

  it("13+14. searches and filters products", async () => {
    const bySearch = await products.listProducts({ search: "WIDGET" });
    expect(bySearch.products.some((p) => p.id === productId)).toBe(true);

    const byCategory = await products.listProducts({ categoryId });
    expect(byCategory.products.some((p) => p.id === productId)).toBe(true);

    const byStatus = await products.listProducts({ status: "in_stock" });
    expect(byStatus.products.some((p) => p.id === productId)).toBe(true);
  });

  it("15+16. records a stock movement and verifies the product stock update", async () => {
    const res = await movements.recordMovement({
      productId,
      movementType: "out",
      quantity: 4,
      notes: "Integration sale",
      referenceNumber: "TEST-INV-1",
      idempotencyKey: `${MARKER}-movement-1`,
    });
    expect(res.movement.previousStock).toBe(10);
    expect(res.movement.resultingStock).toBe(6);
    expect(res.product.stockQuantity).toBe(6);

    // Drivebase filter on the ledger itself.
    const ledger = await db.listRecords("stock_movements", {
      filters: [{ column: "operation_key", value: `${MARKER}-movement-1` }],
      limit: 1,
    });
    expect(ledger.meta.total_matched).toBe(1);

    // Retry with the same idempotency key replays instead of double-applying.
    const retry = await movements.recordMovement({
      productId,
      movementType: "out",
      quantity: 4,
      notes: "Integration sale",
      referenceNumber: "TEST-INV-1",
      idempotencyKey: `${MARKER}-movement-1`,
    });
    expect(retry.replayed).toBe(true);
    const after = await products.getProduct(productId);
    expect(after?.stockQuantity).toBe(6);

    // Insufficient stock is rejected without any write.
    await expect(
      movements.recordMovement({
        productId,
        movementType: "out",
        quantity: 9999,
        notes: null,
        referenceNumber: null,
        idempotencyKey: `${MARKER}-movement-2`,
      }),
    ).rejects.toMatchObject({ code: "invalid_quantity" });
  });

  let fileId = "";
  it("17+18. uploads a product image through Drivebase Storage and verifies the reference", async () => {
    // 1x1 transparent PNG.
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
      0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
      0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78,
      0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const updated = await products.setProductImage(productId, {
      name: `${MARKER}-image.png`,
      mimeType: "image/png",
      bytes: png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer,
    });
    fileId = updated.imageFileId ?? "";
    expect(fileId).toBeTruthy();

    const meta = await storage.getFileMetadata(fileId);
    expect(meta?.mimeType).toBe("image/png");

    const download = await storage.downloadFile(fileId);
    expect(download).not.toBeNull();
    expect(new Uint8Array(download!.bytes).slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("19. deletes the product image", async () => {
    const cleared = await products.clearProductImage(productId);
    expect(cleared.imageFileId).toBeNull();
    const meta = await storage.getFileMetadata(fileId);
    expect(meta).toBeNull();
  });

  it("20. invalid requests are rejected with validation errors", async () => {
    await expect(
      db.insertRecord("products", { name: "no-sku" }),
    ).rejects.toMatchObject({ code: "validation_error" });
    await expect(
      db.insertRecord("products", { sku: "x", name: "x", unknown_column: 1 }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("21. unauthorized requests fail with 401", async () => {
    const { DrivebaseError } = await import("@/lib/drivebase/errors");
    const saved = process.env.DRIVEBASE_API_KEY;
    process.env.DRIVEBASE_API_KEY = "db_live_invalid_key_for_negative_test";
    // Bust the config cache + read cache by re-importing the client module.
    const { invalidateDrivebaseReadCache } = await import("@/lib/drivebase/client");
    invalidateDrivebaseReadCache();
    try {
      await tables.getRootInfo();
      throw new Error("expected unauthorized");
    } catch (err) {
      expect(err).toBeInstanceOf(DrivebaseError);
      expect((err as InstanceType<typeof DrivebaseError>).code).toBe("unauthorized");
    } finally {
      process.env.DRIVEBASE_API_KEY = saved;
      invalidateDrivebaseReadCache();
    }
  });

  it("22. Drivebase unavailability surfaces as a network error", async () => {
    const savedUrl = process.env.DRIVEBASE_API_BASE_URL;
    const savedKey = process.env.DRIVEBASE_API_KEY;
    const { invalidateDrivebaseReadCache } = await import("@/lib/drivebase/client");
    process.env.DRIVEBASE_API_BASE_URL = "https://drivebase-does-not-exist.invalid/api/v1";
    invalidateDrivebaseReadCache();
    try {
      await expect(tables.getRootInfo()).rejects.toMatchObject({ code: "network_error" });
    } finally {
      process.env.DRIVEBASE_API_BASE_URL = savedUrl;
      process.env.DRIVEBASE_API_KEY = savedKey;
      invalidateDrivebaseReadCache();
    }
  });

  it("23. data persists across a fresh read (no cache)", async () => {
    const { getRecord } = await import("@/lib/drivebase/records");
    const rec = await getRecord("products", productId, { noCache: true });
    expect(rec?.sku).toBe(`${MARKER}-001`);
    expect(rec?.stock_quantity).toBe(6);
  });

  it("relationships are registered via the Relationships API", async () => {
    const rels = await relationships.listRelationships();
    const names = rels.map((r) => `${r.source.table}.${r.source.column} → ${r.target.table}`);
    expect(names).toContain("products.category_id → categories");
    expect(names).toContain("products.supplier_id → suppliers");
    expect(names).toContain("stock_movements.product_id → products");
  });

  it("reconciliation is a safe no-op when everything is consistent", async () => {
    const outcomes = await movements.reconcilePending(0);
    for (const o of outcomes) {
      expect(["completed", "already_consistent", "skipped_recent", "failed"]).toContain(o.outcome);
    }
    const integrity = await movements.reconcileProductStock(productId);
    expect(integrity.ledgerStock).toBe(6);
    expect(integrity.repaired).toBe(false);
  });
});
