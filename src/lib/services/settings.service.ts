/**
 * Application settings stored in the Drivebase `app_settings` table as
 * key/value rows (text values; numeric fields normalized on read).
 * Reads merge with defaults so the app works before the user saves
 * anything — values are NOT claimed to be persisted until they round-trip
 * through Drivebase.
 */

import { TABLES } from "@/lib/drivebase/config";
import { getAllRecords, insertRecord, updateRecord } from "@/lib/drivebase/records";
import type { CurrencyCode } from "@/lib/stock";
import { fromDrivebaseError } from "./errors";

export interface AppSettings {
  businessName: string;
  businessDescription: string;
  currency: CurrencyCode;
  defaultUnit: string;
  lowStockThreshold: number;
  /** ISO timestamp of the last successful Drivebase connection check. */
  lastConnectionCheckAt: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  businessName: "Stockwell",
  businessDescription: "",
  currency: "IDR",
  defaultUnit: "pcs",
  lowStockThreshold: 5,
  lastConnectionCheckAt: null,
};

const KEY_MAP: Record<keyof AppSettings, string> = {
  businessName: "business_name",
  businessDescription: "business_description",
  currency: "currency",
  defaultUnit: "default_unit",
  lowStockThreshold: "low_stock_threshold",
  lastConnectionCheckAt: "last_connection_check_at",
};

async function readSettingRows(): Promise<Map<string, { id: string; value: string | null }>> {
  const rows = await getAllRecords(TABLES.appSettings, { maxPages: 2 });
  const out = new Map<string, { id: string; value: string | null }>();
  for (const rec of rows) {
    const key = typeof rec.key === "string" ? rec.key : null;
    if (!key) continue;
    out.set(key, {
      id: rec.id,
      value: typeof rec.value === "string" ? rec.value : rec.value === null ? null : String(rec.value),
    });
  }
  return out;
}

function normalizeString(field: keyof AppSettings, raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  return raw;
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const rows = await readSettingRows();
    const merged: AppSettings = { ...DEFAULT_SETTINGS };
    const businessName = normalizeString("businessName", rows.get(KEY_MAP.businessName)?.value);
    if (businessName) merged.businessName = businessName;
    const businessDescription = normalizeString(
      "businessDescription",
      rows.get(KEY_MAP.businessDescription)?.value,
    );
    if (businessDescription !== null) merged.businessDescription = businessDescription;
    const currency = normalizeString("currency", rows.get(KEY_MAP.currency)?.value);
    if (currency && ["IDR", "USD", "EUR", "SGD"].includes(currency)) {
      merged.currency = currency as CurrencyCode;
    }
    const defaultUnit = normalizeString("defaultUnit", rows.get(KEY_MAP.defaultUnit)?.value);
    if (defaultUnit) merged.defaultUnit = defaultUnit;
    const rawThreshold = normalizeString("lowStockThreshold", rows.get(KEY_MAP.lowStockThreshold)?.value);
    if (rawThreshold !== null) {
      const n = Number(rawThreshold);
      if (Number.isFinite(n) && n >= 0) merged.lowStockThreshold = Math.floor(n);
    }
    const lastCheck = normalizeString(
      "lastConnectionCheckAt",
      rows.get(KEY_MAP.lastConnectionCheckAt)?.value,
    );
    if (lastCheck) merged.lastConnectionCheckAt = lastCheck;
    return merged;
  } catch (err) {
    // Before initialization the table does not exist yet — defaults are fine.
    if ((err as { code?: string }).code === "not_found") return { ...DEFAULT_SETTINGS };
    throw fromDrivebaseError(err);
  }
}

/** Upserts exactly the provided fields (never touches other rows). */
export async function updateSettings(
  patch: Partial<Omit<AppSettings, "lastConnectionCheckAt">>,
): Promise<AppSettings> {
  try {
    const rows = await readSettingRows();
    for (const [field, value] of Object.entries(patch)) {
      const drivebaseKey = KEY_MAP[field as keyof AppSettings];
      if (!drivebaseKey) continue;
      const serialized = typeof value === "number" ? String(value) : String(value ?? "");
      const existing = rows.get(drivebaseKey);
      if (existing) {
        await updateRecord(TABLES.appSettings, existing.id, { key: drivebaseKey, value: serialized });
      } else {
        await insertRecord(TABLES.appSettings, { key: drivebaseKey, value: serialized });
      }
    }
    return getSettings();
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

/** Internal bookkeeping (connection checks). Best-effort, never throws. */
export async function recordConnectionCheck(at: string): Promise<void> {
  try {
    const rows = await readSettingRows();
    const existing = rows.get(KEY_MAP.lastConnectionCheckAt);
    if (existing) {
      await updateRecord(TABLES.appSettings, existing.id, { value: at });
    } else {
      await insertRecord(TABLES.appSettings, { key: KEY_MAP.lastConnectionCheckAt, value: at });
    }
  } catch {
    // Table may not exist yet (pre-init). Silently skipped.
  }
}
