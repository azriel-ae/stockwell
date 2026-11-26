#!/usr/bin/env node
/**
 * Mock Drivebase API server for local end-to-end testing of Stockwell.
 *
 * Implements the exact REST contract Stockwell's adapter expects
 * (envelope, auth, tables, records with filter/sort/expand, files with
 * multipart upload, relationships) with in-memory storage instead of
 * Google Sheets/Drive. Useful for `npm run dev` without a real key:
 *
 *   node scripts/mock-drivebase.mjs        # listens on :3222
 *   DRIVEBASE_API_BASE_URL=http://localhost:3222/api/v1 \
 *   DRIVEBASE_API_KEY=db_live_mockkey npm run dev
 */
import http from "node:http";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 3222);
const VALID_KEY = "db_live_mockkey";

const state = {
  databases: [], // { id, name, description, createdAt }
  tables: {}, // name -> { name, database, columns, createdAt, updatedAt, records: Map }
  files: new Map(), // id -> { id, name, mimeType, bytes, createdAt }
  relationships: [],
};

const nowIso = () => new Date().toISOString();
const envelope = (res, status, data, meta) => {
  const body = { success: true, data, ...(meta ? { meta } : {}) };
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const fail = (res, status, code, message) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: { code, message } }));
};

const RESERVED = new Set(["id", "created_at", "updated_at"]);

function validateRecord(columns, body, partial) {
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    const col = columns.find((c) => c.name === k);
    if (!col || RESERVED.has(k)) return { error: `Unknown column ${k}` };
    if (v === null || v === "") {
      if (col.required && !partial) return { error: `${k} is required` };
      out[k] = null;
      continue;
    }
    if (col.type === "number") {
      const n = typeof v === "string" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isFinite(n)) return { error: `${k} expected number` };
      out[k] = n;
    } else if (col.type === "file") {
      if (typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(v)) {
        return { error: `${k} expected a file id` };
      }
      out[k] = v;
    } else {
      out[k] = String(v);
    }
  }
  if (!partial) {
    for (const col of columns) {
      if (!(col.name in out)) {
        if (col.required && col.default === undefined) return { error: `${col.name} is required` };
        if (col.default !== undefined) out[col.name] = col.default;
      }
    }
  }
  return { value: out };
}

function matchFilter(value, cond) {
  const actual = value === null || value === undefined ? null : String(value);
  const v = cond.value;
  switch (cond.op) {
    case "eq": return actual === v;
    case "ne": return actual !== v;
    case "contains": case "like":
      return (actual ?? "").toLowerCase().includes(v.toLowerCase());
    case "starts_with": return (actual ?? "").toLowerCase().startsWith(v.toLowerCase());
    case "ends_with": return (actual ?? "").toLowerCase().endsWith(v.toLowerCase());
    case "lt": return compare(actual, v) < 0;
    case "lte": return compare(actual, v) <= 0;
    case "gt": return compare(actual, v) > 0;
    case "gte": return compare(actual, v) >= 0;
    case "in": return v.split(",").includes(actual ?? "");
    default: return true;
  }
}
const compare = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });

function parseFilters(searchParams) {
  const conds = [];
  for (const [rawKey, rawValue] of searchParams.entries()) {
    const m = rawKey.match(/^filter\[([^\]]+)\](?:\.([a-z_]+))?$/);
    if (!m) continue;
    conds.push({ column: m[1], op: m[2] ?? "eq", value: rawValue });
  }
  return conds;
}

function payload(rec) {
  return { id: rec.id, ...rec.values, created_at: rec.createdAt, updated_at: rec.updatedAt };
}

function applyExpand(tableName, records, expand) {
  if (!expand?.length) return records;
  return records.map((rec) => {
    const out = { ...rec };
    for (const col of expand) {
      const ref = out[col];
      if (typeof ref !== "string" || !ref) continue;
      // find target table from relationships
      const rel = state.relationships.find(
        (r) => r.sourceTable === tableName && r.sourceColumn === col,
      );
      if (!rel) continue;
      const target = state.tables[rel.targetTable];
      if (!target) continue;
      const found = target.records.get(ref);
      if (found) out[col] = payload(found);
    }
    return out;
  });
}

async function readBodyJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function auth(req, res) {
  const header = req.headers.authorization ?? "";
  if (header !== `Bearer ${VALID_KEY}`) {
    fail(res, 401, "unauthorized", "Invalid API key");
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const method = req.method;

  if (p === "/" || p === "/api/v1" || p === "/api/v1/") {
    if (!auth(req, res)) return;
    return envelope(res, 200, {
      name: "Drivebase API", version: "1", baseUrl: "/api/v1", docs: "/dashboard/docs",
      project: { id: "mock-project", name: "Mock Project" },
      googleDrive: { connected: true },
      usage: {
        databases: state.databases.length, tables: Object.keys(state.tables).length,
        files: state.files.size, relationships: state.relationships.length,
        storageBytes: 0, apiRequests: 0, activeApiKeys: 1,
      },
      rateLimit: { maxRequests: 120, windowSeconds: 60 },
      key: { id: "mock-key", permissions: ["read", "write"], scope: "project", projectId: "mock-project" },
    });
  }

  if (p === "/api/v1/databases") {
    if (!auth(req, res)) return;
    if (method === "GET") {
      return envelope(res, 200, state.databases.map((d) => ({
        name: d.name, description: d.description,
        tableCount: Object.values(state.tables).filter((t) => t.database === d.name).length,
        createdAt: d.createdAt,
      })), { count: state.databases.length });
    }
    if (method === "POST") {
      const body = await readBodyJson(req);
      if (!body.name) return fail(res, 422, "validation_error", "name is required");
      if (state.databases.some((d) => d.name === body.name)) {
        return fail(res, 409, "conflict", "Database exists");
      }
      const db = { id: randomUUID(), name: body.name, description: body.description ?? null, createdAt: nowIso() };
      state.databases.push(db);
      return envelope(res, 201, db);
    }
  }

  let m = p.match(/^\/api\/v1\/tables\/([^/]+)$/);
  if (m) {
    if (!auth(req, res)) return;
    const name = decodeURIComponent(m[1]);
    const table = state.tables[name];
    if (method === "GET") {
      if (!table) return fail(res, 404, "not_found", `Table “${name}” was not found`);
      return envelope(res, 200, {
        name: table.name, database: table.database, columns: table.columns,
        createdAt: table.createdAt, updatedAt: table.updatedAt,
      });
    }
    if (method === "DELETE") {
      if (!table) return fail(res, 404, "not_found", "Table not found");
      delete state.tables[name];
      state.relationships = state.relationships.filter(
        (r) => r.sourceTable !== name && r.targetTable !== name,
      );
      return envelope(res, 200, { deleted: true, name });
    }
  }

  if (p === "/api/v1/tables" && method === "POST") {
    if (!auth(req, res)) return;
    const body = await readBodyJson(req);
    if (!body.database || !body.name || !Array.isArray(body.columns)) {
      return fail(res, 422, "validation_error", "database, name and columns are required");
    }
    if (state.tables[body.name]) return fail(res, 409, "conflict", "Table exists");
    state.tables[body.name] = {
      name: body.name, database: body.database, columns: body.columns,
      createdAt: nowIso(), updatedAt: nowIso(), records: new Map(),
    };
    return envelope(res, 201, {
      name: body.name, database: body.database, columns: body.columns, createdAt: nowIso(),
    });
  }

  if (p === "/api/v1/relationships") {
    if (!auth(req, res)) return;
    if (method === "GET") {
      return envelope(res, 200, state.relationships.map((r) => ({
        id: r.id, name: r.name, type: r.type,
        source: { table: r.sourceTable, column: r.sourceColumn },
        target: { table: r.targetTable, column: r.targetColumn },
        description: r.description ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
      })));
    }
    if (method === "POST") {
      const body = await readBodyJson(req);
      const exists = state.relationships.some(
        (r) => r.sourceTable === body.sourceTable && r.sourceColumn === body.sourceColumn &&
          r.targetTable === body.targetTable && r.targetColumn === body.targetColumn,
      );
      if (exists) return fail(res, 409, "conflict", "Relationship exists");
      const rel = {
        id: randomUUID(), name: body.name, type: body.type,
        sourceTable: body.sourceTable, sourceColumn: body.sourceColumn,
        targetTable: body.targetTable, targetColumn: body.targetColumn,
        description: body.description ?? null, createdAt: nowIso(), updatedAt: nowIso(),
      };
      state.relationships.push(rel);
      return envelope(res, 201, {
        id: rel.id, name: rel.name, type: rel.type,
        source: { table: rel.sourceTable, column: rel.sourceColumn },
        target: { table: rel.targetTable, column: rel.targetColumn },
        createdAt: rel.createdAt, updatedAt: rel.updatedAt,
      });
    }
  }

  m = p.match(/^\/api\/v1\/files$/);
  if (m && method === "GET") {
    if (!auth(req, res)) return;
    const db = url.searchParams.get("database");
    if (!db) return fail(res, 422, "validation_error", "database query parameter is required");
    return envelope(res, 200, [...state.files.values()].map((f) => ({
      id: f.id, name: f.name, mimeType: f.mimeType, sizeBytes: f.bytes.byteLength, createdAt: f.createdAt,
    })));
  }

  if (p === "/api/v1/files" && method === "POST") {
    if (!auth(req, res)) return;
    // Multipart via the web Request API (undici).
    const webReq = new Request(url, {
      method: "POST",
      headers: req.headers,
      body: Readable.toWeb(req),
      duplex: "half",
    });
    let form;
    try {
      form = await webReq.formData();
    } catch {
      return fail(res, 415, "unsupported_media_type", "Expected multipart/form-data");
    }
    const file = form.get("file");
    const database = String(form.get("database") ?? "");
    if (!(file instanceof File) || !database) {
      return fail(res, 422, "validation_error", "Both database and file fields are required");
    }
    const id = randomUUID();
    const bytes = new Uint8Array(await file.arrayBuffer());
    state.files.set(id, { id, name: file.name, mimeType: file.type, bytes: bytes.buffer, createdAt: nowIso() });
    return envelope(res, 201, {
      id, name: file.name, mimeType: file.type, sizeBytes: bytes.byteLength, createdAt: nowIso(),
    });
  }

  m = p.match(/^\/api\/v1\/files\/([^/]+)$/);
  if (m) {
    if (!auth(req, res)) return;
    const id = decodeURIComponent(m[1]);
    const file = state.files.get(id);
    if (!file) return fail(res, 404, "not_found", "File not found");
    if (method === "GET" && url.searchParams.get("alt") === "media") {
      res.writeHead(200, { "Content-Type": file.mimeType });
      return res.end(new Uint8Array(file.bytes));
    }
    if (method === "GET") {
      return envelope(res, 200, {
        id: file.id, name: file.name, mimeType: file.mimeType,
        sizeBytes: file.bytes.byteLength, createdAt: file.createdAt,
      });
    }
    if (method === "DELETE") {
      state.files.delete(id);
      return envelope(res, 200, { deleted: true, id });
    }
  }

  // Records: /data/:table and /data/:table/:id
  m = p.match(/^\/api\/v1\/data\/([^/]+)(?:\/([^/]+))?$/);
  if (m) {
    if (!auth(req, res)) return;
    const name = decodeURIComponent(m[1]);
    const recId = m[2] ? decodeURIComponent(m[2]) : null;
    const table = state.tables[name];
    if (!table) return fail(res, 404, "not_found", `Table “${name}” was not found`);

    if (method === "GET" && !recId) {
      let records = [...table.records.values()].map(payload);
      const filters = parseFilters(url.searchParams);
      for (const cond of filters) {
        records = records.filter((r) => matchFilter(r[cond.column], cond));
      }
      const sortRaw = url.searchParams.get("sort") ?? "";
      if (sortRaw) {
        const desc = sortRaw.startsWith("-");
        const col = desc ? sortRaw.slice(1) : sortRaw;
        const key = (r) => (col === "__created_at" ? r.created_at : col === "__updated_at" ? r.updated_at : r[col]);
        records.sort((a, b) => (desc ? -1 : 1) * compare(key(a), key(b)));
      }
      const expand = (url.searchParams.get("expand") ?? "").split(",").filter(Boolean);
      records = applyExpand(name, records, expand);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100);
      const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
      const page = records.slice(offset, offset + limit);
      return envelope(res, 200, page, {
        limit, offset, has_more: offset + page.length < records.length, total_matched: records.length,
      });
    }

    if (method === "GET" && recId) {
      const rec = table.records.get(recId);
      if (!rec) return fail(res, 404, "not_found", "Record not found");
      const expand = (url.searchParams.get("expand") ?? "").split(",").filter(Boolean);
      const [expanded] = applyExpand(name, [payload(rec)], expand);
      return envelope(res, 200, expanded);
    }

    if (method === "POST" && !recId) {
      const body = await readBodyJson(req);
      const { value, error } = validateRecord(table.columns, body, false);
      if (error) return fail(res, 422, "validation_error", error);
      const id = randomUUID();
      const rec = { id, values: value, createdAt: nowIso(), updatedAt: nowIso() };
      table.records.set(id, rec);
      const expand = (url.searchParams.get("expand") ?? "").split(",").filter(Boolean);
      const [expanded] = applyExpand(name, [payload(rec)], expand);
      return envelope(res, 201, expanded);
    }

    if (method === "PATCH" && recId) {
      const rec = table.records.get(recId);
      if (!rec) return fail(res, 404, "not_found", "Record not found");
      const body = await readBodyJson(req);
      const { value, error } = validateRecord(table.columns, body, true);
      if (error) return fail(res, 422, "validation_error", error);
      Object.assign(rec.values, value);
      rec.updatedAt = nowIso();
      const expand = (url.searchParams.get("expand") ?? "").split(",").filter(Boolean);
      const [expanded] = applyExpand(name, [payload(rec)], expand);
      return envelope(res, 200, expanded);
    }

    if (method === "DELETE" && recId) {
      if (!table.records.delete(recId)) return fail(res, 404, "not_found", "Record not found");
      return envelope(res, 200, { deleted: true, id: recId });
    }
  }

  if (p === "/api/v1/batch" && method === "POST") {
    if (!auth(req, res)) return;
    const body = await readBodyJson(req);
    const results = [];
    for (const op of body.operations ?? []) {
      try {
        const table = state.tables[op.table];
        if (!table) throw new Error("Table not found");
        if (op.op === "insert") {
          const { value, error } = validateRecord(table.columns, op.record, false);
          if (error) throw new Error(error);
          const id = randomUUID();
          table.records.set(id, { id, values: value, createdAt: nowIso(), updatedAt: nowIso() });
          results.push({ op: "insert", table: op.table, status: "succeeded" });
        } else if (op.op === "delete") {
          table.records.delete(op.id);
          results.push({ op: "delete", table: op.table, status: "succeeded" });
        }
      } catch (err) {
        results.push({ op: op.op, table: op.table, status: "failed", error: { code: "validation_error", message: String(err) } });
      }
    }
    const failed = results.filter((r) => r.status === "failed").length;
    return envelope(res, failed > 0 ? 207 : 200, results, { succeeded: results.length - failed, failed });
  }

  fail(res, 404, "not_found", `No mock route for ${method} ${p}`);
});

server.listen(PORT, () => {
  console.log(`Mock Drivebase listening on http://localhost:${PORT}/api/v1 (key: ${VALID_KEY})`);
});
