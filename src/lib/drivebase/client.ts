/**
 * Drivebase HTTP client — the only place the API key is ever attached.
 *
 * - Envelope parsing ({ success, data } / { success, error }).
 * - Network failures and non-JSON responses become DrivebaseError.
 * - Short in-process TTL cache for GETs (the Drivebase rate limit is
 *   120 requests/minute per key, so dashboards must not re-fetch on
 *   every render).
 * - Optional Idempotency-Key passthrough for JSON writes (24h replay
 *   window, verified in the Drivebase source).
 */

import { drivebaseConfig } from "./config";
import { DrivebaseConfigError, DrivebaseError, NETWORK_ERROR } from "./errors";

const REQUEST_TIMEOUT_MS = 20_000;

export interface DrivebaseRequestInit {
  method?: string;
  /** JSON body (object) or raw body (multipart uploads). */
  body?: unknown;
  /** Idempotency-Key header for POST/PATCH/DELETE JSON requests. */
  idempotencyKey?: string;
  /** Bypass the read cache (connection checks, post-write re-reads). */
  noCache?: boolean;
}

interface CacheEntry {
  at: number;
  data: unknown;
  meta?: Record<string, unknown>;
}

// Survives Next.js dev HMR by attaching to globalThis.
const g = globalThis as unknown as { __swDbCache?: Map<string, CacheEntry> };
const readCache: Map<string, CacheEntry> = (g.__swDbCache ??= new Map());

const READ_CACHE_TTL_MS = 15_000;

export function invalidateDrivebaseReadCache(): void {
  readCache.clear();
}

function envelopeOk(json: unknown): boolean {
  return (
    typeof json === "object" && json !== null && (json as { success?: unknown }).success === true
  );
}

function extractError(json: unknown): { code: string; message: string; details?: unknown[] } {
  const err = (json as { error?: Record<string, unknown> })?.error;
  if (err && typeof err === "object") {
    return {
      code: typeof err.code === "string" ? err.code : "internal_error",
      message: typeof err.message === "string" ? err.message : "Drivebase request failed",
      details: Array.isArray(err.details) ? (err.details as unknown[]) : undefined,
    };
  }
  return { code: "internal_error", message: "Drivebase returned an unexpected error body" };
}

/** Low-level request. Returns parsed envelope `data` or throws. */
export async function drivebaseRequest<T = unknown>(
  path: string,
  init: DrivebaseRequestInit = {},
): Promise<T> {
  const { data } = await drivebaseRequestEnvelope<T>(path, init);
  return data;
}

/**
 * Full-envelope request: `{ data, meta }`. List endpoints put pagination
 * (`limit`, `offset`, `has_more`, `total_matched`) in `meta`.
 */
export async function drivebaseRequestEnvelope<T = unknown>(
  path: string,
  init: DrivebaseRequestInit = {},
): Promise<{ data: T; meta: Record<string, unknown> }> {
  const config = drivebaseConfig();
  if (!config.baseUrl || !config.apiKey) throw new DrivebaseConfigError();

  const method = (init.method ?? "GET").toUpperCase();
  const isRead = method === "GET";
  const cacheKey = `${config.apiKey.slice(-8)}:${method}:${path}:${init.body ? JSON.stringify(init.body) : ""}`;

  if (isRead && !init.noCache) {
    const hit = readCache.get(cacheKey);
    if (hit && Date.now() - hit.at < READ_CACHE_TTL_MS) {
      return { data: hit.data as T, meta: (hit.meta ?? {}) as Record<string, unknown> };
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
  };
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    if (init.body instanceof FormData || init.body instanceof Blob || init.body instanceof ArrayBuffer) {
      body = init.body as BodyInit;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }
  }
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    // Never include request headers (the key) in error output.
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
    throw new DrivebaseError(NETWORK_ERROR, `Drivebase is ${reason}`, 0);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new DrivebaseError(
      NETWORK_ERROR,
      `Drivebase returned a non-JSON response (HTTP ${res.status})`,
      res.status,
    );
  }

  if (!res.ok || !envelopeOk(json)) {
    const { code, message, details } = extractError(json);
    throw new DrivebaseError(code, message, res.status, details);
  }

  const envelope = json as { data?: unknown; meta?: Record<string, unknown> };
  const data = envelope.data as T;
  const meta = envelope.meta ?? {};
  if (isRead && !init.noCache) {
    readCache.set(cacheKey, { at: Date.now(), data, meta });
  }
  return { data, meta };
}

/** Raw binary download (GET /files/:id?alt=media). Returns null on 404. */
export async function drivebaseDownload(path: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const config = drivebaseConfig();
  if (!config.baseUrl || !config.apiKey) throw new DrivebaseConfigError();
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new DrivebaseError(NETWORK_ERROR, "Drivebase is unreachable", 0);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new DrivebaseError("google_api_error", `File download failed (HTTP ${res.status})`, res.status);
  }
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}
