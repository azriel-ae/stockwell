/**
 * Database & table management (verified contract):
 *   GET   /                    project overview (key, project, usage, rateLimit)
 *   GET   /databases           list databases with table counts
 *   POST  /databases           { name, description } (creates the Drive folder)
 *   GET   /tables/:table       table schema + database (404 when missing)
 *   POST  /tables              { database, name, columns } (201)
 */

import { drivebaseRequestEnvelope } from "./client";
import type { ColumnDef, DatabaseInfo, RootInfo, TableInfo } from "./types";

export async function getRootInfo(): Promise<RootInfo> {
  return drivebaseRequestEnvelope<RootInfo>("/", { noCache: true }).then((r) => r.data);
}

export async function listDatabases(): Promise<DatabaseInfo[]> {
  return drivebaseRequestEnvelope<DatabaseInfo[]>("/databases").then((r) => r.data);
}

export async function createDatabase(name: string, description?: string): Promise<DatabaseInfo & { id: string }> {
  return drivebaseRequestEnvelope<DatabaseInfo & { id: string }>("/databases", {
    method: "POST",
    body: { name, description },
    noCache: true,
  }).then((r) => r.data);
}

/** Table schema, or null when the table does not exist (404). */
export async function getTableInfo(table: string): Promise<TableInfo | null> {
  try {
    return await drivebaseRequestEnvelope<TableInfo>(
      `/tables/${encodeURIComponent(table)}`,
    ).then((r) => r.data);
  } catch (err) {
    if ((err as { code?: string }).code === "not_found") return null;
    throw err;
  }
}

export async function createTable(
  database: string,
  name: string,
  columns: ColumnDef[],
): Promise<TableInfo> {
  return drivebaseRequestEnvelope<TableInfo>("/tables", {
    method: "POST",
    body: { database, name, columns },
    noCache: true,
  }).then((r) => r.data);
}

/**
 * Compares the columns of an existing table with the expected definition.
 * Returns the differences (never mutates — repair is an explicit action).
 */
export function columnDifferences(expected: ColumnDef[], actual: ColumnDef[]): string[] {
  const diffs: string[] = [];
  const actualMap = new Map(actual.map((c) => [c.name, c]));
  for (const col of expected) {
    const found = actualMap.get(col.name);
    if (!found) {
      diffs.push(`Missing column “${col.name}” (${col.type})`);
    } else if (found.type !== col.type) {
      diffs.push(`Column “${col.name}” has type ${found.type}, expected ${col.type}`);
    }
  }
  const expectedNames = new Set(expected.map((c) => c.name));
  for (const col of actual) {
    if (!expectedNames.has(col.name)) {
      diffs.push(`Extra column “${col.name}” (${col.type}) — not part of the Stockwell schema`);
    }
  }
  return diffs;
}
