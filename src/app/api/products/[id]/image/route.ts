import { withApi, jsonOk } from "@/lib/http";
import { ServiceError } from "@/lib/services/errors";
import { clearProductImage, setProductImage } from "@/lib/services/products.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_BODY_BYTES = 4 * 1024 * 1024 + 64 * 1024; // 4 MB image + multipart overhead

/**
 * POST /api/products/:id/image — multipart upload (field: file). The image
 * goes to Drivebase Storage (Google Drive behind it); the returned file id
 * is stored on the product record's `image` column.
 */
export const POST = withApi(async (request, ctx: Params) => {
  const { id } = await ctx.params;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new ServiceError(415, "unsupported_media", "Expected a multipart/form-data upload.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new ServiceError(413, "image_too_large", "The upload exceeds the 4 MB limit.");
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ServiceError(422, "missing_file", "The file field is required.");
  }
  const product = await setProductImage(id, {
    name: file.name || "product-image",
    mimeType: file.type || "application/octet-stream",
    bytes: await file.arrayBuffer(),
  });
  return jsonOk(product, { status: 201 });
});

/** DELETE /api/products/:id/image — removes the reference and the file. */
export const DELETE = withApi(async (_request, ctx: Params) => {
  const { id } = await ctx.params;
  const product = await clearProductImage(id);
  return jsonOk(product);
});
