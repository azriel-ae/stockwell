import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit test of the movement consistency protocol with a mocked Drivebase
 * HTTP layer: verifies the write order (write-ahead operation row → ledger
 * row → product stock → applied marker), the idempotency keys attached to
 * each write, replay behavior and insufficient-stock rejection.
 */

process.env.DRIVEBASE_API_BASE_URL = "https://db.example/api/v1";
process.env.DRIVEBASE_API_KEY = "db_live_test_key";

type Call = { method: string; path: string; idem?: string; body?: unknown };

const calls: Call[] = [];

let state: {
  productStock: number;
  operations: Array<Record<string, unknown>>;
  movements: Array<Record<string, unknown>>;
};

function reset(initialStock: number) {
  calls.length = 0;
  state = { productStock: initialStock, operations: [], movements: [] };
}

const ok = (data: unknown, meta?: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, ...(meta ? { meta } : {}) }),
});

function route(method: string, path: string, idem?: string, body?: unknown): Response {
  const url = new URL(path, "https://db.example");
  const p = url.pathname;
  const q = url.searchParams;

  if (method === "GET" && p.endsWith("/data/operations")) {
    const key = q.get("filter[operation_key]");
    const found = state.operations.filter((o) => o.operation_key === key);
    return ok(found, { limit: 1, offset: 0, has_more: false, total_matched: found.length }) as Response;
  }
  if (method === "GET" && /\/data\/products\/[^/]+$/.test(p)) {
    const id = p.split("/").pop() as string;
    return ok({
      id,
      sku: "SW-1",
      name: "Test product",
      stock_quantity: String(state.productStock),
      minimum_stock: "2",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }) as Response;
  }
  if (method === "GET" && /\/data\/stock_movements\/[^/]+$/.test(p)) {
    const id = p.split("/").pop() as string;
    const rec = state.movements.find((m) => m.id === id);
    if (!rec) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: { code: "not_found", message: "Record not found" } }),
      } as unknown as Response;
    }
    return ok(rec) as Response;
  }
  if (method === "POST" && p.endsWith("/data/operations")) {
    const rec = { id: `op-${state.operations.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(body as Record<string, unknown>) };
    state.operations.push(rec);
    return ok(rec) as Response;
  }
  if (method === "POST" && p.endsWith("/data/stock_movements")) {
    const rec = { id: `mov-${state.movements.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(body as Record<string, unknown>) };
    state.movements.push(rec);
    return ok(rec) as Response;
  }
  if (method === "PATCH" && /\/data\/products\/[^/]+$/.test(p)) {
    const stock = (body as Record<string, unknown>).stock_quantity;
    state.productStock = Number(stock);
    const id = p.split("/").pop() as string;
    return ok({ id, stock_quantity: String(stock), updated_at: new Date().toISOString() }) as Response;
  }
  if (method === "PATCH" && /\/data\/operations\/[^/]+$/.test(p)) {
    const id = p.split("/").pop() as string;
    const rec = state.operations.find((o) => o.id === id) as Record<string, unknown>;
    Object.assign(rec, body, { updated_at: new Date().toISOString() });
    return ok(rec) as Response;
  }
  return ok({ unexpected: `${method} ${path}` }) as Response;
}

const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const path = url.replace("https://db.example", "");
  const method = (init?.method ?? "GET").toUpperCase();
  const idem = (init?.headers as Record<string, string>)?.["Idempotency-Key"];
  let body: unknown;
  if (init?.body) body = JSON.parse(String(init.body));
  calls.push({ method, path, idem, body });
  return route(method, path, idem, body);
});

vi.stubGlobal("fetch", fetchMock);

// Import AFTER env + fetch stub are in place.
const { recordMovement } = await import("@/lib/services/stock-movements.service");
const { ServiceError } = await import("@/lib/services/errors");
const { invalidateDrivebaseReadCache } = await import("@/lib/drivebase/client");

const KEY = "movement-test-key-0001";

describe("movement consistency protocol", () => {
  beforeEach(() => {
    reset(10);
    invalidateDrivebaseReadCache();
  });

  it("writes in order: operation row → ledger row → product stock → applied marker", async () => {
    const result = await recordMovement({
      productId: "prod-1",
      movementType: "in",
      quantity: 5,
      notes: null,
      referenceNumber: "PO-1",
      idempotencyKey: KEY,
    });

    expect(result.replayed).toBe(false);
    expect(result.movement.resultingStock).toBe(15);
    expect(result.product.stockQuantity).toBe(15);
    expect(state.productStock).toBe(15);

    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes.map((w) => w.method)).toEqual(["POST", "POST", "PATCH", "PATCH"]);

    // Write-ahead operation row is created BEFORE the ledger row.
    const opInsert = writes[0];
    expect(opInsert.path).toContain("/data/operations");
    expect((opInsert.body as Record<string, unknown>).status).toBe("pending");
    expect(opInsert.idem).toBe(`op:${KEY}`);

    const movInsert = writes[1];
    expect(movInsert.path).toContain("/data/stock_movements");
    expect(movInsert.idem).toBe(`mov:${KEY}`);
    expect((movInsert.body as Record<string, unknown>).previous_stock).toBe(10);
    expect((movInsert.body as Record<string, unknown>).resulting_stock).toBe(15);

    const productPatch = writes[2];
    expect(productPatch.path).toContain("/data/products/prod-1");
    expect(productPatch.idem).toBe(`prod:${KEY}`);

    const applied = writes[3];
    expect(applied.path).toContain("/data/operations/op-");
    expect(applied.idem).toBe(`opdone:${KEY}`);
    expect((applied.body as Record<string, unknown>).status).toBe("applied");
  });

  it("replays the stored result when the same idempotency key is retried", async () => {
    await recordMovement({
      productId: "prod-1",
      movementType: "in",
      quantity: 5,
      notes: null,
      referenceNumber: null,
      idempotencyKey: KEY,
    });
    const writesAfterFirst = calls.filter((c) => c.method !== "GET").length;

    const second = await recordMovement({
      productId: "prod-1",
      movementType: "in",
      quantity: 5,
      notes: null,
      referenceNumber: null,
      idempotencyKey: KEY,
    });

    expect(second.replayed).toBe(true);
    // No new writes on replay.
    expect(calls.filter((c) => c.method !== "GET").length).toBe(writesAfterFirst);
    expect(state.movements).toHaveLength(1);
  });

  it("rejects stock out that would go negative without writing anything", async () => {
    await expect(
      recordMovement({
        productId: "prod-1",
        movementType: "out",
        quantity: 99,
        notes: null,
        referenceNumber: null,
        idempotencyKey: KEY,
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(state.movements).toHaveLength(0);
    expect(state.productStock).toBe(10);
  });
});
