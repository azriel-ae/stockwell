/**
 * Drivebase connection service — the status shown is only ever based on a
 * REAL round-trip to the Drivebase API (never on the mere presence of
 * environment variables). The API key is never exposed or logged.
 */

import { drivebaseConfigured } from "@/lib/drivebase/config";
import { DrivebaseConfigError, DrivebaseError } from "@/lib/drivebase/errors";
import { getRootInfo } from "@/lib/drivebase/tables";
import { ServiceError } from "./errors";
import { describeReadiness, type InitReport } from "./init.service";
import { getSettings, recordConnectionCheck } from "./settings.service";

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "authentication_failed"
  | "project_not_found"
  | "api_unavailable"
  | "configuration_missing";

export interface ConnectionReport {
  status: ConnectionStatus;
  message: string;
  checkedAt: string;
  /** Filled when the round-trip succeeded. */
  detail: Awaited<ReturnType<typeof describeReadiness>> | null;
  lastSuccessfulCheckAt: string | null;
}

export async function testConnection(): Promise<ConnectionReport> {
  const checkedAt = new Date().toISOString();

  if (!drivebaseConfigured()) {
    return {
      status: "configuration_missing",
      message:
        "Drivebase is not configured. Set DRIVEBASE_API_BASE_URL and DRIVEBASE_API_KEY in the environment.",
      checkedAt,
      detail: null,
      lastSuccessfulCheckAt: null,
    };
  }

  try {
    const root = await getRootInfo();
    // Optional cross-check against DRIVEBASE_PROJECT_ID.
    if (process.env.DRIVEBASE_PROJECT_ID && root.key.projectId !== process.env.DRIVEBASE_PROJECT_ID) {
      return {
        status: "project_not_found",
        message:
          "The API key works, but DRIVEBASE_PROJECT_ID does not match the project this key belongs to. Fix the variable or remove it.",
        checkedAt,
        detail: null,
        lastSuccessfulCheckAt: null,
      };
    }
  } catch (err) {
    if (err instanceof DrivebaseConfigError) {
      return {
        status: "configuration_missing",
        message: "Drivebase is not configured.",
        checkedAt,
        detail: null,
        lastSuccessfulCheckAt: null,
      };
    }
    if (err instanceof DrivebaseError) {
      if (err.code === "unauthorized") {
        return {
          status: "authentication_failed",
          message: "Drivebase rejected the API key (401). Check DRIVEBASE_API_KEY.",
          checkedAt,
          detail: null,
          lastSuccessfulCheckAt: null,
        };
      }
      if (err.code === "forbidden") {
        return {
          status: "authentication_failed",
          message: "The API key does not have permission for this project (403).",
          checkedAt,
          detail: null,
          lastSuccessfulCheckAt: null,
        };
      }
      if (err.isNetworkError) {
        return {
          status: "api_unavailable",
          message: "Drivebase is unreachable. Check DRIVEBASE_API_BASE_URL and the deployment status.",
          checkedAt,
          detail: null,
          lastSuccessfulCheckAt: null,
        };
      }
    }
    return {
      status: "disconnected",
      message: err instanceof Error ? err.message : "Connection failed.",
      checkedAt,
      detail: null,
      lastSuccessfulCheckAt: null,
    };
  }

  // The round-trip worked — now check the full workspace readiness.
  try {
    const detail = await describeReadiness();
    const tablesMissing = detail.tables.some((t) => t.issues.includes("Table not found"));
    await recordConnectionCheck(checkedAt);
    const settings = await getSettings();
    return {
      status: "connected",
      message: tablesMissing
        ? "Connected to Drivebase, but some Stockwell tables are missing — run Initialize tables."
        : "Connected and verified against the Drivebase API.",
      checkedAt,
      detail,
      lastSuccessfulCheckAt: settings.lastConnectionCheckAt ?? checkedAt,
    };
  } catch (err) {
    // Root worked but the workspace read failed.
    const message =
      err instanceof ServiceError ? err.message : "Connected, but the workspace could not be read.";
    return {
      status: "disconnected",
      message,
      checkedAt,
      detail: null,
      lastSuccessfulCheckAt: null,
    };
  }
}

/** Static helper for pages that need the last check time without a call. */
export async function lastCheckTime(): Promise<string | null> {
  try {
    const settings = await getSettings();
    return settings.lastConnectionCheckAt;
  } catch {
    return null;
  }
}

export type { InitReport };
