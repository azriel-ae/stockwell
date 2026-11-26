/**
 * File storage (verified contract):
 *   GET    /files?database=<name>   list files of a database
 *   POST   /files                   multipart upload (fields: file, database; max 25 MB)
 *   GET    /files/:id               metadata; ?alt=media downloads the bytes
 *   DELETE /files/:id               delete file (Drive + metadata)
 *
 * Column type `file` on a record stores the Drivebase file id and is
 * validated by Drivebase against the storage namespace of the table's
 * own database.
 */

import { drivebaseDownload, drivebaseRequestEnvelope, invalidateDrivebaseReadCache } from "./client";
import { STOCKWELL_DATABASE } from "./config";
import type { FileMetadata } from "./types";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // stay under the Vercel body limit
export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export async function listFiles(database: string = STOCKWELL_DATABASE): Promise<FileMetadata[]> {
  return drivebaseRequestEnvelope<FileMetadata[]>(
    `/files?database=${encodeURIComponent(database)}`,
  ).then((r) => r.data);
}

export async function uploadFile(
  file: { name: string; mimeType: string; bytes: ArrayBuffer },
  database: string = STOCKWELL_DATABASE,
): Promise<FileMetadata> {
  const form = new FormData();
  form.set("database", database);
  const blob = new Blob([file.bytes], { type: file.mimeType });
  form.set("file", blob, file.name);
  invalidateDrivebaseReadCache();
  return drivebaseRequestEnvelope<FileMetadata>("/files", {
    method: "POST",
    body: form,
    noCache: true,
  }).then((r) => r.data);
}

export async function getFileMetadata(id: string): Promise<FileMetadata | null> {
  try {
    return await drivebaseRequestEnvelope<FileMetadata>(
      `/files/${encodeURIComponent(id)}`,
    ).then((r) => r.data);
  } catch (err) {
    if ((err as { code?: string }).code === "not_found") return null;
    throw err;
  }
}

export async function deleteFile(id: string): Promise<void> {
  invalidateDrivebaseReadCache();
  await drivebaseRequestEnvelope(`/files/${encodeURIComponent(id)}`, {
    method: "DELETE",
    noCache: true,
  });
}

/** Binary download (GET /files/:id?alt=media). Null when the file is gone. */
export async function downloadFile(id: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  return drivebaseDownload(`/files/${encodeURIComponent(id)}?alt=media`);
}

/**
 * Sniffs the magic bytes of an image buffer so a renamed .txt cannot pass
 * as an image (MIME whitelist + size limit are checked before the upload).
 */
export function sniffImageMime(bytes: ArrayBuffer): string | null {
  const b = new Uint8Array(bytes.slice(0, 12));
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // GIF: GIF8
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  // WEBP: RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[2 + 5] === undefined) return null;
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  return null;
}
