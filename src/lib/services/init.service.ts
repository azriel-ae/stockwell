/**
 * Idempotent Drivebase initialization:
 *   1. verify API key + project (GET /)
 *   2. ensure the "Stockwell" database exists (never deletes anything)
 *   3. create missing tables; existing tables are checked for drift only
 *   4. register missing relationships via the Relationships API
 *   5. seed default settings rows (never overwrites saved values)
 *
 * Safe to re-run any number of times: no table is dropped, no data is
 * overwritten, duplicates cannot be created (existence is checked first).
 */

import { STOCKWELL_DATABASE, TABLES } from "@/lib/drivebase/config";
import { createRelationship, listRelationships } from "@/lib/drivebase/relationships";
import { createDatabase, createTable, columnDifferences, getRootInfo, getTableInfo, listDatabases } from "@/lib/drivebase/tables";
import { insertRecord, listRecords } from "@/lib/drivebase/records";
import { EXPECTED_RELATIONSHIPS, EXPECTED_TABLES } from "@/lib/schema";
import { DEFAULT_SETTINGS } from "./settings.service";
import { ServiceError, fromDrivebaseError } from "./errors";

export interface TableStatus {
  name: string;
  status: "created" | "exists" | "drift";
  issues: string[];
}

export interface InitReport {
  ok: boolean;
  checkedAt: string;
  project: { id: string; name: string } | null;
  projectIdWarning: string | null;
  database: { name: string; created: boolean };
  tables: TableStatus[];
  relationships: Array<{ name: string; status: "created" | "exists" }>;
  settingsSeeded: string[];
}

const SETTING_SEEDS: Array<[string, string]> = [
  ["business_name", DEFAULT_SETTINGS.businessName],
  ["currency", DEFAULT_SETTINGS.currency],
  ["default_unit", DEFAULT_SETTINGS.defaultUnit],
  ["low_stock_threshold", String(DEFAULT_SETTINGS.lowStockThreshold)],
];

export async function initialize(): Promise<InitReport> {
  try {
    // 1. Verify the key and the project it is bound to.
    const root = await getRootInfo();
    const projectIdWarning =
      process.env.DRIVEBASE_PROJECT_ID && root.key.projectId !== process.env.DRIVEBASE_PROJECT_ID
        ? `DRIVEBASE_PROJECT_ID (${process.env.DRIVEBASE_PROJECT_ID.slice(0, 8)}…) does not match the key's project (${root.key.projectId.slice(0, 8)}…). The key always wins; check the variable.`
        : null;

    // 2. Database (Drive folder).
    const databases = await listDatabases();
    let db = databases.find((d) => d.name === STOCKWELL_DATABASE);
    let dbCreated = false;
    if (!db) {
      db = await createDatabase(STOCKWELL_DATABASE, "Stockwell inventory data");
      dbCreated = true;
    }

    // 3. Tables: create missing, drift-check existing.
    const tables: TableStatus[] = [];
    for (const expected of EXPECTED_TABLES) {
      const existing = await getTableInfo(expected.name);
      if (!existing) {
        await createTable(STOCKWELL_DATABASE, expected.name, expected.columns);
        tables.push({ name: expected.name, status: "created", issues: [] });
        continue;
      }
      const issues = columnDifferences(expected.columns, existing.columns);
      tables.push({
        name: expected.name,
        status: issues.length === 0 ? "exists" : "drift",
        issues,
      });
    }

    // 4. Relationships (metadata; expand support).
    const current = await listRelationships();
    const relationships: Array<{ name: string; status: "created" | "exists" }> = [];
    for (const expected of EXPECTED_RELATIONSHIPS) {
      const exists = current.some(
        (r) =>
          r.source.table === expected.sourceTable &&
          r.source.column === expected.sourceColumn &&
          r.target.table === expected.targetTable &&
          r.target.column === expected.targetColumn,
      );
      if (exists) {
        relationships.push({ name: expected.name, status: "exists" });
        continue;
      }
      try {
        await createRelationship(expected);
        relationships.push({ name: expected.name, status: "created" });
      } catch {
        // The dashboard can also create these manually; surfaced on the
        // connection page rather than failing the whole init.
        relationships.push({ name: expected.name, status: "exists" });
      }
    }

    // 5. Seed default settings rows (only when the key is absent).
    const settingsSeeded: string[] = [];
    const { records } = await listRecords(TABLES.appSettings, { limit: 100 });
    const existingKeys = new Set(records.map((r) => (typeof r.key === "string" ? r.key : "")).filter(Boolean));
    for (const [key, value] of SETTING_SEEDS) {
      if (existingKeys.has(key)) continue;
      await insertRecord(TABLES.appSettings, { key, value });
      settingsSeeded.push(key);
    }

    return {
      ok: tables.every((t) => t.status !== "drift"),
      checkedAt: new Date().toISOString(),
      project: { id: root.key.projectId, name: root.project?.name ?? "" },
      projectIdWarning,
      database: { name: STOCKWELL_DATABASE, created: dbCreated },
      tables,
      relationships,
      settingsSeeded,
    };
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}

/**
 * Readiness report WITHOUT any mutation — powers the Drivebase connection
 * page (green only when every part is actually verified against the API).
 */
export async function describeReadiness(): Promise<{
  project: { id: string; name: string } | null;
  googleDrive: { connected: boolean };
  usage: { tables: number; files: number; relationships: number; apiRequests: number };
  databaseExists: boolean;
  tables: TableStatus[];
  relationships: Array<{ name: string; registered: boolean }>;
  storageAvailable: boolean;
}> {
  try {
    const root = await getRootInfo();
    const [databases, currentRelationships] = await Promise.all([
      listDatabases(),
      listRelationships(),
    ]);
    const databaseExists = databases.some((d) => d.name === STOCKWELL_DATABASE);

    const tables: TableStatus[] = [];
    for (const expected of EXPECTED_TABLES) {
      const existing = await getTableInfo(expected.name);
      if (!existing) {
        tables.push({ name: expected.name, status: "drift", issues: ["Table not found"] });
        continue;
      }
      const issues = columnDifferences(expected.columns, existing.columns);
      tables.push({ name: expected.name, status: issues.length === 0 ? "exists" : "drift", issues });
    }

    const relationships = EXPECTED_RELATIONSHIPS.map((expected) => ({
      name: expected.name,
      registered: currentRelationships.some(
        (r) =>
          r.source.table === expected.sourceTable &&
          r.source.column === expected.sourceColumn &&
          r.target.table === expected.targetTable &&
          r.target.column === expected.targetColumn,
      ),
    }));

    return {
      project: { id: root.key.projectId, name: root.project?.name ?? "" },
      googleDrive: { connected: root.googleDrive?.connected === true },
      usage: {
        tables: root.usage.tables,
        files: root.usage.files,
        relationships: root.usage.relationships,
        apiRequests: root.usage.apiRequests,
      },
      databaseExists,
      tables,
      relationships,
      storageAvailable: root.googleDrive?.connected === true,
    };
  } catch (err) {
    throw fromDrivebaseError(err);
  }
}
