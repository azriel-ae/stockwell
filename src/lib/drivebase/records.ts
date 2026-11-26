/**
 * Record operations (verified contract):
 *   GET    /data/:table            list (limit 1-100, filter[col][.op], sort, fields, expand)
 *   POST   /data/:table            insert (validated against schema; 201)
 *   GET    /data/:table/:id        fetch one
 *   PATCH  /data/:table/:id        partial update
 *   DELETE /data/:table/:id        delete
 *   POST   /batch                  up to 25 sequential ops (NOT a transaction)
 *
 * Google Sheets returns cell values as formatted strings, so numeric /
 * boolean columns come back as strings: every record passes through
 * `normalizeRecord` with the local schema to restore types.
 */

import { drivebaseRequest, drivebaseRequestEnvelope, invalidateDrivebaseReadCache } from "./client";
import type { ColumnDef, ListOptions, ListResult, RecordPayload } from "./types";

export function buildQuery(opts: ListOptions): string {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(Math.max(1, Math.min(100, opts.limit))));
  if (opts.offset !== undefined) params.set("offset", String(Math.max(0, opts.offset)));
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.fields?.length) params.set("fields", opts.fields.join(","));
  if (opts.expand?.length) params.set("expand", opts.expand.join(","));
  for (const f of opts.filters ?? []) {
    const key = f.op && f.op !== "eq" ? `filter[${f.column}].${f.op}` : `filter[${f.column}]`;
    params.set(key, f.value);
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

/* ------------------------- value normalization ------------------------- */

export function coerceNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}

export function coerceText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function coerceBoolean(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return null;
}

/** Restores column types on a record coming back from Google Sheets. */
export function normalizeRecord(columns: ColumnDef[], rec: RecordPayload): RecordPayload {
  const out: RecordPayload = { ...rec };
  for (const col of columns) {
    if (!(col.name in out)) continue;
    const v = out[col.name];
    switch (col.type) {
      case "number":
        out[col.name] = coerceNumber(v);
        break;
      case "boolean":
        out[col.name] = coerceBoolean(v);
        break;
      case "text":
      case "email":
      case "date":
      case "datetime":
        out[col.name] = coerceText(v);
        break;
      default:
        break; // json / file passthrough
    }
  }
  return out;
}

/* ----------------------------- record CRUD ----------------------------- */

export async function listRecords(
  table: string,
  opts: ListOptions = {},
): Promise<ListResult<RecordPayload>> {
  const { data, meta } = await drivebaseRequestEnvelope<RecordPayload[]>(
    `/data/${encodeURIComponent(table)}${buildQuery(opts)}`,
  );
  const records = Array.isArray(data) ? data : [];
  const m = meta as Partial<ListResult<RecordPayload>["meta"]>;
  return {
    records,
    meta: {
      limit: typeof m.limit === "number" ? m.limit : opts.limit ?? 20,
      offset: typeof m.offset === "number" ? m.offset : opts.offset ?? 0,
      has_more: m.has_more === true,
      total_matched: typeof m.total_matched === "number" ? m.total_matched : records.length,
    },
  };
}

export async function getRecord(
  table: string,
  id: string,
  opts: { expand?: string[]; noCache?: boolean } = {},
): Promise<RecordPayload | null> {
  try {
    const q = opts.expand?.length ? `?expand=${opts.expand.join(",")}` : "";
    return await drivebaseRequest<RecordPayload>(
      `/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}${q}`,
      { noCache: opts.noCache },
    );
  } catch (err) {
    if ((err as { code?: string }).code === "not_found") return null;
    throw err;
  }
}

export async function insertRecord(
  table: string,
  values: Record<string, unknown>,
  opts: { idempotencyKey?: string; expand?: string[] } = {},
): Promise<RecordPayload> {
  invalidateDrivebaseReadCache();
  const q = opts.expand?.length ? `?expand=${opts.expand.join(",")}` : "";
  return drivebaseRequest<RecordPayload>(`/data/${encodeURIComponent(table)}${q}`, {
    method: "POST",
    body: values,
    idempotencyKey: opts.idempotencyKey,
    noCache: true,
  });
}

export async function updateRecord(
  table: string,
  id: string,
  values: Record<string, unknown>,
  opts: { idempotencyKey?: string; expand?: string[] } = {},
): Promise<RecordPayload> {
  invalidateDrivebaseReadCache();
  const q = opts.expand?.length ? `?expand=${opts.expand.join(",")}` : "";
  return drivebaseRequest<RecordPayload>(
    `/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}${q}`,
    { method: "PATCH", body: values, idempotencyKey: opts.idempotencyKey, noCache: true },
  );
}

export async function deleteRecord(
  table: string,
  id: string,
  opts: { idempotencyKey?: string } = {},
): Promise<void> {
  invalidateDrivebaseReadCache();
  await drivebaseRequest(
    `/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    { method: "DELETE", idempotencyKey: opts.idempotencyKey, noCache: true },
  );
}

/**
 * Pages through a whole table (max `maxPages` pages of 100). Reads cost one
 * Google Sheets API call per page, so use for bounded report/dashboard
 * aggregates, not per-keystroke lookups.
 */
export async function getAllRecords(
  table: string,
  opts: ListOptions & { maxPages?: number; noCache?: boolean } = {},
): Promise<RecordPayload[]> {
  const maxPages = opts.maxPages ?? 10;
  const all: RecordPayload[] = [];
  for (let page = 0; page < maxPages; page++) {
    const { records } = await listRecords(table, {
      ...opts,
      limit: 100,
      offset: page * 100,
    });
    all.push(...records);
    if (records.length < 100) break;
  }
  return all;
}

/* ---------------------------- batch endpoint ---------------------------- */

export type BatchOp =
  | { op: "insert"; table: string; record: Record<string, unknown> }
  | { op: "update"; table: string; id: string; record: Record<string, unknown> }
  | { op: "delete"; table: string; id: string };

export interface BatchItemResult {
  op: string;
  table: string;
  status: "succeeded" | "failed";
  record?: RecordPayload;
  error?: { code: string; message: string };
}

/** Sequential, NOT transactional (Drivebase documented behavior). */
export async function runBatch(operations: BatchOp[]): Promise<BatchItemResult[]> {
  invalidateDrivebaseReadCache();
  return drivebaseRequest<BatchItemResult[]>("/batch", {
    method: "POST",
    body: { operations },
    noCache: true,
  });
}
