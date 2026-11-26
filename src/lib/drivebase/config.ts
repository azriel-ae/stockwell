/**
 * Drivebase adapter configuration.
 *
 * All values are SERVER-ONLY. They are read here (never in any client
 * component) and the API key is only ever attached to outbound requests
 * from Stockwell's server to Drivebase.
 */

export interface DrivebaseConfig {
  baseUrl: string;
  apiKey: string;
  /** Optional cross-check against the key's bound project (GET /). */
  projectId?: string;
}

/** Read fresh on every call (cheap) so tests can re-configure per case. */
export function drivebaseConfig(): DrivebaseConfig {
  const baseUrl = (process.env.DRIVEBASE_API_BASE_URL ?? "").replace(/\/+$/, "");
  const apiKey = process.env.DRIVEBASE_API_KEY ?? "";
  const projectId = process.env.DRIVEBASE_PROJECT_ID ?? "";
  return { baseUrl, apiKey, projectId: projectId || undefined };
}

export function drivebaseConfigured(): boolean {
  const c = drivebaseConfig();
  return c.baseUrl.length > 0 && c.apiKey.length > 0;
}

/** The single Drivebase database that holds all Stockwell tables. */
export const STOCKWELL_DATABASE = "Stockwell";

/** Stockwell table names (must match Drivebase exactly). */
export const TABLES = {
  products: "products",
  categories: "categories",
  suppliers: "suppliers",
  stockMovements: "stock_movements",
  appSettings: "app_settings",
  operations: "operations",
} as const;
