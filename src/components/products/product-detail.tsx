"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  ImagePlus,
  Package,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Badge,
  Button,
  MovementTypeBadge,
  StatusBadge,
  useToast,
} from "@/components/ui";
import type { Product, StockMovement } from "@/lib/models";
import type { StockIntegrityReport } from "@/lib/services/stock-movements.service";
import { productStatus } from "@/lib/stock";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { apiDelete, apiPost, apiUpload, ApiClientError, assetUrl } from "@/lib/client/api";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function ProductDetailView({
  product: initial,
  movements,
  integrity: initialIntegrity,
  currency,
}: {
  product: Product;
  movements: StockMovement[];
  integrity: StockIntegrityReport;
  currency: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [product, setProduct] = useState(initial);
  const [integrity, setIntegrity] = useState(initialIntegrity);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadImage(file: File) {
    if (!ALLOWED.includes(file.type)) {
      push("error", "Only PNG, JPEG, WebP and GIF images are allowed.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      push("error", "Images must be 4 MB or smaller.");
      return;
    }
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const updated = await apiUpload<Product>(`/api/products/${product.id}/image`, file);
      setProduct(updated);
      push("success", "Image stored through Drivebase Storage (Google Drive).");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) push("error", err.message);
      else push("error", "Upload failed.");
    } finally {
      setUploading(false);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeImage() {
    try {
      const updated = await apiDelete<Product>(`/api/products/${product.id}/image`);
      setProduct(updated);
      push("success", "Image reference and file deleted from Drivebase Storage.");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) push("error", err.message);
    }
  }

  async function verifyStock() {
    setVerifying(true);
    try {
      const report = await apiPost<StockIntegrityReport>(`/api/products/${product.id}/verify`);
      setIntegrity(report);
      if (report.repaired) {
        push("info", `Stock repaired from the ledger: ${report.recordedStock} → ${report.ledgerStock}.`);
        router.refresh();
      } else {
        push("success", "Stock matches the movement ledger.");
      }
    } catch (err) {
      if (err instanceof ApiClientError) push("error", err.message);
    } finally {
      setVerifying(false);
    }
  }

  const status = productStatus(product);
  const imageUrl = preview ?? (product.imageFileId ? assetUrl(product.imageFileId) : null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/products" className="text-xs text-mutedslate hover:text-charcoal">
            ← Back to products
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-charcoal">{product.name}</h1>
          <p className="mt-0.5 font-mono text-xs text-mutedslate">{product.sku}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/movements?action=new&product=${product.id}`}>
            <Button variant="sage" size="sm">
              <ArrowLeftRight size={14} /> Record movement
            </Button>
          </Link>
          <Link href="/products">
            <Button variant="outline" size="sm">
              View in product list
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left column: image + facts */}
        <section className="space-y-5">
          <div className="rounded-lg border border-line bg-white p-5">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-graphite uppercase">
              Product image
            </h2>
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-md border border-line bg-warmivory">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-mutedslate/60">
                    <Package size={30} strokeWidth={1.3} />
                    <p className="text-[11px]">No image yet</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED.join(",")}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadImage(file);
                }}
              />
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {product.imageFileId ? (
                    <>
                      <Upload size={13} /> Replace
                    </>
                  ) : (
                    <>
                      <ImagePlus size={13} /> Upload image
                    </>
                  )}
                </Button>
                {product.imageFileId ? (
                  <Button variant="danger" size="sm" onClick={removeImage}>
                    <Trash2 size={13} /> Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-center text-[10px] leading-relaxed text-mutedslate">
                PNG / JPEG / WebP / GIF up to 4 MB, stored via Drivebase Storage
                (Google Drive). File id on record: {product.imageFileId ?? "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Middle: details */}
        <section className="rounded-lg border border-line bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-graphite uppercase">Details</h2>
            <StatusBadge status={status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Fact label="Stock on hand">
              <span className="tabular text-lg font-semibold text-charcoal">
                {formatNumber(product.stockQuantity)}
              </span>{" "}
              <span className="text-xs text-mutedslate">{product.unit ?? ""}</span>
            </Fact>
            <Fact label="Minimum stock">
              <span className="tabular text-charcoal">{formatNumber(product.minimumStock)}</span>
            </Fact>
            <Fact label="Category">
              {product.categoryName ? (
                <Badge tone="outline">{product.categoryName}</Badge>
              ) : (
                <span className="text-mutedslate/60">—</span>
              )}
            </Fact>
            <Fact label="Supplier">
              {product.supplierName ?? <span className="text-mutedslate/60">—</span>}
            </Fact>
            <Fact label="Purchase price">
              <span className="tabular">{formatCurrency(product.purchasePrice, currency)}</span>
            </Fact>
            <Fact label="Selling price">
              <span className="tabular">{formatCurrency(product.sellingPrice, currency)}</span>
            </Fact>
            <Fact label="Inventory value">
              <span className="tabular">
                {formatCurrency((product.purchasePrice ?? 0) * product.stockQuantity, currency)}
              </span>
            </Fact>
            <Fact label="Created">
              <span className="text-xs">{formatDateTime(product.createdAt)}</span>
            </Fact>
            <Fact label="Updated">
              <span className="text-xs">{formatDateTime(product.updatedAt)}</span>
            </Fact>
          </dl>
          {product.description ? (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1 text-[11px] font-medium tracking-wide text-mutedslate uppercase">
                Description
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-graphite">
                {product.description}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {/* Integrity */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white px-5 py-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-sagedeep" />
          <div>
            <p className="text-xs font-semibold text-charcoal">
              Ledger integrity — {integrity.movementCount} movement
              {integrity.movementCount === 1 ? "" : "s"} on record
            </p>
            <p className="mt-0.5 text-[11px] text-mutedslate">
              {integrity.ledgerStock === null
                ? "No movements yet — stock was set when the product was created."
                : `Ledger says ${formatNumber(integrity.ledgerStock)} · product says ${formatNumber(integrity.recordedStock)}${integrity.repaired ? " · repaired automatically just now" : ""}`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" loading={verifying} onClick={verifyStock}>
          <BadgeCheck size={13} /> Verify &amp; repair
        </Button>
      </section>

      {/* Movement history */}
      <section className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-charcoal">Movement history</h2>
          <Link
            href={`/movements?product=${product.id}`}
            className="text-xs text-mutedslate hover:text-charcoal"
          >
            Filter in ledger →
          </Link>
        </div>
        {movements.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-mutedslate">
            No stock movements recorded for this product yet.
          </p>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-warmivory/60 text-[11px] tracking-wide text-mutedslate uppercase">
                  <th className="py-2.5 pr-3 pl-5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-3 py-2.5 text-right font-medium">Prev → Result</th>
                  <th className="px-3 py-2.5 font-medium">Reference</th>
                  <th className="py-2.5 pr-5 pl-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linemuted">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-warmivory/50">
                    <td className="py-2.5 pr-3 pl-5 text-xs text-mutedslate">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <MovementTypeBadge type={m.movementType} />
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-charcoal">
                      {m.movementType === "out" ? "−" : "+"}
                      {formatNumber(m.quantity)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-graphite">
                      {formatNumber(m.previousStock)} → {formatNumber(m.resultingStock)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-graphite">
                      {m.referenceNumber ?? "—"}
                    </td>
                    <td className="max-w-[220px] truncate py-2.5 pr-5 pl-3 text-xs text-mutedslate">
                      {m.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-mutedslate uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-charcoal">{children}</dd>
    </div>
  );
}
