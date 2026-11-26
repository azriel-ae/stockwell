/**
 * Relationships (verified contract):
 *   GET    /relationships        project relationship metadata
 *   POST   /relationships        { name, sourceTable, sourceColumn,
 *                                 targetTable, targetColumn, type, description? }
 *
 * Drivebase stores relationships as metadata (Google Sheets has no native
 * foreign keys). They enable `?expand=` on record reads.
 */

import { drivebaseRequestEnvelope, invalidateDrivebaseReadCache } from "./client";
import type { RelationshipInfo } from "./types";

export interface CreateRelationshipInput {
  name: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  type: RelationshipInfo["type"];
  description?: string;
}

export async function listRelationships(): Promise<RelationshipInfo[]> {
  return drivebaseRequestEnvelope<RelationshipInfo[]>("/relationships").then((r) => r.data);
}

export async function createRelationship(input: CreateRelationshipInput): Promise<RelationshipInfo> {
  invalidateDrivebaseReadCache();
  return drivebaseRequestEnvelope<RelationshipInfo>("/relationships", {
    method: "POST",
    body: input,
    noCache: true,
  }).then((r) => r.data);
}
