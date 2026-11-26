/**
 * Types for the verified Drivebase v1 API contract.
 * Shapes are taken from the Drivebase source (docs/API.md + route
 * handlers), not invented.
 */

export type ColumnType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "json"
  | "file";

export interface ColumnDef {
  name: string;
  type: ColumnType;
  required?: boolean;
  default?: string | number | boolean | null;
  description?: string;
  isPrimaryKey?: boolean;
}

export interface TableInfo {
  name: string;
  database: string;
  columns: ColumnDef[];
  createdAt: string;
  updatedAt?: string;
}

export interface DatabaseInfo {
  name: string;
  description?: string | null;
  tableCount: number;
  createdAt: string;
}

/** Every record payload: `{ id, ...columns, created_at, updated_at }`. */
export interface RecordPayload {
  id: string;
  created_at: string;
  updated_at: string;
  [column: string]: unknown;
}

export interface ListMeta {
  limit: number;
  offset: number;
  has_more: boolean;
  total_matched: number;
}

export interface ListResult<T> {
  records: T[];
  meta: ListMeta;
}

export interface RootInfo {
  name: string;
  version: string;
  baseUrl: string;
  docs: string;
  project: { id: string; name: string; slug?: string; [k: string]: unknown };
  googleDrive: { connected?: boolean; [k: string]: unknown };
  usage: {
    databases: number;
    tables: number;
    files: number;
    relationships: number;
    storageBytes: number;
    apiRequests: number;
    activeApiKeys: number;
  };
  rateLimit: { maxRequests: number; windowSeconds: number };
  key: { id: string; permissions: string[]; scope: string; projectId: string };
}

export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  size_bytes?: number;
  createdAt?: string;
  created_at?: string;
  [k: string]: unknown;
}

export interface RelationshipInfo {
  id: string;
  name: string;
  type: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
  source: { table: string; column: string };
  target: { table: string; column: string };
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "like"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "in";

export interface FilterCondition {
  column: string;
  op?: FilterOperator;
  value: string;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  filters?: FilterCondition[];
  sort?: string;
  fields?: string[];
  expand?: string[];
}
