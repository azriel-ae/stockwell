/** Server-side HTTP helpers for Stockwell route handlers. */

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/services/errors";
import { fromDrivebaseError } from "@/lib/services/errors";

export const MAX_JSON_BYTES = 256 * 1024;

/* ------------------------------ auth gate ------------------------------ */

function accessToken(): string | null {
  const token = process.env.STOCKWELL_ACCESS_TOKEN;
  return token && token.length > 0 ? token : null;
}

export function isAccessProtected(): boolean {
  return accessToken() !== null;
}

function sessionCookieValue(): string {
  const token = accessToken() as string;
  return createHash("sha256").update(`stockwell-session:${token}`).digest("hex");
}

export function validSessionCookie(cookie: string | undefined): boolean {
  const expected = sessionCookieValue();
  if (!cookie || cookie.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = "stockwell_session";

/** Value for the session cookie (derived from the access token). */
export function makeSessionCookie(): { name: string; value: string } | null {
  const token = accessToken();
  if (!token) return null;
  return { name: SESSION_COOKIE, value: sessionCookieValue() };
}

/* ------------------------------ CSRF guard ------------------------------ */

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Mutating requests must carry a custom header. Cross-site form posts and
 * simple cross-site fetches cannot set custom headers, which blocks
 * CSRF-style drive-by writes. The session cookie is SameSite=Lax as well.
 */
function csrfOk(request: Request): boolean {
  if (!MUTATING.has(request.method.toUpperCase())) return true;
  return request.headers.get("x-stockwell-request") === "fetch";
}

/* ------------------------------- responses ------------------------------- */

export function jsonOk(data: unknown, init?: { status?: number }) {
  return NextResponse.json({ success: true, data }, { status: init?.status ?? 200 });
}

export function jsonError(err: unknown) {
  const serviceError =
    err instanceof ServiceError ? err : fromDrivebaseError(err);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: serviceError.code,
        message: serviceError.message,
        ...(serviceError.fieldErrors ? { fieldErrors: serviceError.fieldErrors } : {}),
      },
    },
    { status: serviceError.status },
  );
}

/** Wraps a route handler with auth, CSRF and error mapping. */
export function withApi<P extends Record<string, string> = Record<string, string>>(
  handler: (request: Request, ctx: { params: Promise<P> }) => Promise<Response>,
  opts: { allowWhenLocked?: boolean } = {},
): (request: Request, ctx: { params: Promise<P> }) => Promise<Response> {
  return async (request, ctx) => {
    try {
      if (isAccessProtected() && !opts.allowWhenLocked) {
        const cookies = request.headers.get("cookie") ?? "";
        const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([a-f0-9]+)`));
        if (!match || !validSessionCookie(match[1])) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "locked",
                message: "This Stockwell instance is locked. Unlock it first.",
              },
            },
            { status: 401 },
          );
        }
      }
      if (!csrfOk(request)) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "csrf_rejected", message: "Missing Stockwell request header." },
          },
          { status: 403 },
        );
      }
      return await handler(request, ctx);
    } catch (err) {
      return jsonError(err);
    }
  };
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > MAX_JSON_BYTES) {
    throw new ServiceError(413, "payload_too_large", "Request body is too large.");
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ServiceError(400, "bad_request", "Request body must be a JSON object.");
  }
}

export class ValidationError extends ServiceError {}

export function zodFieldErrors(err: { issues: Array<{ path: PropertyKey[]; message: string }> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
