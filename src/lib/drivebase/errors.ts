/**
 * Normalized Drivebase errors.
 *
 * Drivebase responds with `{ success: false, error: { code, message,
 * details } }` and documented HTTP codes. The adapter rethrows every
 * failure as a `DrivebaseError` so services can translate codes into
 * user-facing messages without parsing raw HTTP.
 */

export const DRIVEBASE_ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "idempotency_key_conflict",
  "google_not_connected",
  "payload_too_large",
  "unsupported_media_type",
  "validation_error",
  "rate_limited",
  "google_api_error",
  "internal_error",
  "setup_required",
] as const;

export type DrivebaseErrorCode = (typeof DRIVEBASE_ERROR_CODES)[number];

/** Network-level failure (DNS, timeout, 5xx HTML page, …). */
export const NETWORK_ERROR = "network_error" as const;

export class DrivebaseError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown[];

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown[],
  ) {
    super(message);
    this.name = "DrivebaseError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Network-level failure (Drivebase unreachable). */
  get isNetworkError(): boolean {
    return this.code === NETWORK_ERROR;
  }
}

/** Thrown when Stockwell has no DRIVEBASE_* environment configuration. */
export class DrivebaseConfigError extends Error {
  constructor() {
    super("Drivebase is not configured: set DRIVEBASE_API_BASE_URL and DRIVEBASE_API_KEY");
    this.name = "DrivebaseConfigError";
  }
}
