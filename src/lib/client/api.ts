"use client";

/**
 * Browser-side API client for Stockwell's own backend. The Drivebase API key
 * never reaches the browser — every call goes through /api/* route handlers.
 * Mutations carry a custom header (CSRF guard) and, where relevant, a
 * client-generated idempotency key so retries are safe.
 */

export interface ApiEnvelopeError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(status: number, code: string, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

const HEADERS_JSON = {
  "Content-Type": "application/json",
  "x-stockwell-request": "fetch",
};

async function unwrap<T>(res: Response): Promise<T> {
  let body: { success?: boolean; data?: T; error?: ApiEnvelopeError } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) {
    const err = body?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? "request_failed",
      err?.message ?? `Request failed (HTTP ${res.status})`,
      err?.fieldErrors,
    );
  }
  return body.data as T;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { "x-stockwell-request": "fetch" } });
  return unwrap<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: HEADERS_JSON,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return unwrap<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "PATCH", headers: HEADERS_JSON, body: JSON.stringify(body) });
  return unwrap<T>(res);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "PUT", headers: HEADERS_JSON, body: JSON.stringify(body) });
  return unwrap<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE", headers: HEADERS_JSON });
  return unwrap<T>(res);
}

/** Multipart upload (product images). */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.set("file", file);
  const res = await fetch(path, {
    method: "POST",
    headers: { "x-stockwell-request": "fetch" },
    body: form,
  });
  return unwrap<T>(res);
}

export function assetUrl(fileId: string): string {
  return `/api/assets/${encodeURIComponent(fileId)}`;
}
