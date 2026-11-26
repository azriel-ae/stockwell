/**
 * Service-level errors: one error type for every domain service, plus a
 * translator from Drivebase error codes to human-readable messages.
 */

import { DrivebaseConfigError, DrivebaseError } from "@/lib/drivebase/errors";

export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

const DRIVEBASE_MESSAGES: Record<string, string> = {
  unauthorized: "Drivebase rejected the API key. Check DRIVEBASE_API_KEY.",
  forbidden: "The Drivebase API key does not have permission for this operation.",
  not_found: "The requested Drivebase resource does not exist.",
  rate_limited: "Drivebase rate limit reached (120 requests/minute). Wait a moment and retry.",
  payload_too_large: "The upload is too large for Drivebase.",
  unsupported_media_type: "Drivebase rejected the file type.",
  google_not_connected: "The Drivebase project has no connected Google account.",
  google_api_error: "Drivebase could not reach Google Drive/Sheets.",
  setup_required: "The Drivebase project is not fully set up.",
  network_error: "Could not reach the Drivebase API.",
};

export function fromDrivebaseError(err: unknown): ServiceError {
  if (err instanceof ServiceError) return err;
  if (err instanceof DrivebaseConfigError) {
    return new ServiceError(
      503,
      "drivebase_not_configured",
      "Stockwell is not configured. Set DRIVEBASE_API_BASE_URL and DRIVEBASE_API_KEY in the environment.",
    );
  }
  if (err instanceof DrivebaseError) {
    if (err.code === "validation_error") {
      const details = Array.isArray(err.details) ? err.details : [];
      const fieldErrors: Record<string, string> = {};
      for (const d of details) {
        if (d && typeof d === "object" && "column" in d && "message" in d) {
          fieldErrors[String((d as { column: unknown }).column)] = String(
            (d as { message: unknown }).message,
          );
        }
      }
      const first = fieldErrors ? Object.values(fieldErrors)[0] : undefined;
      return new ServiceError(
        422,
        "validation_error",
        first ? `Invalid data: ${first}` : "Drivebase rejected the data.",
        fieldErrors,
      );
    }
    if (err.code === "idempotency_key_conflict") {
      return new ServiceError(
        409,
        "idempotency_conflict",
        "This action was already retried with different data. Refresh and try again.",
      );
    }
    const message = DRIVEBASE_MESSAGES[err.code] ?? err.message;
    const status = err.isNetworkError ? 502 : err.status >= 500 ? 502 : err.status;
    return new ServiceError(status, err.code, message);
  }
  return new ServiceError(500, "internal_error", "An unexpected error occurred.");
}
