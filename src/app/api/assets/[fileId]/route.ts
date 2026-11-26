import { withApi } from "@/lib/http";
import { downloadFile } from "@/lib/drivebase/storage";
import { fromDrivebaseError } from "@/lib/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ fileId: string }> };

const g = globalThis as unknown as { __swAssetCache?: Map<string, { at: number; bytes: ArrayBuffer; contentType: string }> };
const assetCache: Map<string, { at: number; bytes: ArrayBuffer; contentType: string }> =
  (g.__swAssetCache ??= new Map());

/**
 * GET /api/assets/:fileId — proxies product images from Drivebase Storage
 * so the browser never needs the Drivebase API key. Served with long-lived
 * browser caching (file ids are immutable content references).
 */
export const GET = withApi(async (_request, ctx: Params) => {
  const { fileId } = await ctx.params;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(fileId)) {
    return new Response("Invalid file id", { status: 400 });
  }
  const cached = assetCache.get(fileId);
  if (cached && Date.now() - cached.at < 5 * 60_000) {
    return new Response(cached.bytes, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  try {
    const file = await downloadFile(fileId);
    if (!file) return new Response("Not found", { status: 404 });
    assetCache.set(fileId, { at: Date.now(), bytes: file.bytes, contentType: file.contentType });
    return new Response(file.bytes, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const serviceError = fromDrivebaseError(err);
    return new Response(serviceError.message, { status: serviceError.status });
  }
});
