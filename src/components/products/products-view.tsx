"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Package,
  PackagePlus,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FormRow,
  Input,
  Modal,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  useFreshId,
  useToast,
} from "@/components/ui";
import type { Product } from "@/lib/models";
import type { ProductPage } from "@/lib/services/products.service";
import { productStatus, STATUS_LABELS } from "@/lib/stock";
import { formatCurrency, formatNumber } from "@/lib/format";
import { apiDelete, apiGet, apiPatch, apiPost, ApiClientError, assetUrl } from "@/lib/client/api";

interface Option {
  id: string;
  name: string;
}

interface ProductForm {
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  supplierId: string;
  purchasePrice: string;
  sellingPrice: string;
  stockQuantity: string;
  minimumStock: string;
  unit: string;
}

const EMPTY_FORM: ProductForm = {
  sku: "",
  name: "",
  description: "",
  categoryId: "",
  supplierId: "",
  purchasePrice: "",
  sellingPrice: "",
  stockQuantity: "0",
  minimumStock: "0",
  unit: "",
};

function toForm(p: Product): ProductForm {
  return {
    sku: p.sku,
    name: p.name,
    description: p.description ?? "",
    categoryId: p.categoryId ?? "",
    supplierId: p.supplierId ?? "",
    purchasePrice: p.purchasePrice === null ? "" : String(p.purchasePrice),
    sellingPrice: p.sellingPrice === null ? "" : String(p.sellingPrice),
    stockQuantity: String(p.stockQuantity),
    minimumStock: String(p.minimumStock),
    unit: p.unit ?? "",
  };
}

export function ProductsView({
  initialPage,
  categories,
  suppliers,
  currency,
  defaultUnit,
  lowStockThreshold,
  openNew,
  initialCategoryId = "",
  initialSupplierId = "",
}: {
  initialPage: ProductPage;
  categories: Option[];
  suppliers: Option[];
  currency: string;
  defaultUnit: string;
  lowStockThreshold: number;
  openNew: boolean;
  initialCategoryId?: string;
  initialSupplierId?: string;
}) {
  const router = useRouter();
  const { push } = useToast();

  const [page, setPage] = useState<ProductPage>(initialPage);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("name");

  const [formOpen, setFormOpen] = useState(openNew);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>({ ...EMPTY_FORM, minimumStock: String(lowStockThreshold), unit: defaultUnit });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const idempotencyKey = useFreshId("product");
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    if (categoryId) params.set("categoryId", categoryId);
    if (supplierId) params.set("supplierId", supplierId);
    if (status) params.set("status", status);
    if (sort) params.set("sort", sort);
    return params;
  }, [debounced, categoryId, supplierId, status, sort]);

  const fetchPage = useCallback(
    async (pageNo: number) => {
      const myId = ++requestId.current;
      setLoading(true);
      try {
        const params = new URLSearchParams(query);
        params.set("page", String(pageNo));
        params.set("perPage", "25");
        const data = await apiGet<ProductPage>(`/api/products?${params.toString()}`);
        if (myId === requestId.current) setPage(data);
      } catch (err) {
        if (err instanceof ApiClientError) push("error", err.message);
      } finally {
        if (myId === requestId.current) setLoading(false);
      }
    },
    [query, push],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, minimumStock: String(lowStockThreshold), unit: defaultUnit });
    setFieldErrors({});
    setFormOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm(toForm(p));
    setFieldErrors({});
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const payload: Record<string, unknown> = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        purchasePrice: form.purchasePrice === "" ? null : Number(form.purchasePrice),
        sellingPrice: form.sellingPrice === "" ? null : Number(form.sellingPrice),
        unit: form.unit.trim() || null,
      };
      if (editing) {
        await apiPatch(`/api/products/${editing.id}`, payload);
        push("success", "Product updated in Drivebase.");
      } else {
        await apiPost("/api/products", {
          ...payload,
          stockQuantity: Number(form.stockQuantity || 0),
          minimumStock: Number(form.minimumStock || 0),
          idempotencyKey,
        });
        push("success", "Product saved to Drivebase.");
      }
      setFormOpen(false);
      router.refresh();
      await fetchPage(page.page);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(err.fieldErrors ?? {});
        push("error", err.message);
      } else {
        push("error", "Could not save the product.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/products/${deleteTarget.id}`);
      push("success", `“${deleteTarget.name}” deleted (with its history and image).`);
      setDeleteTarget(null);
      router.refresh();
      await fetchPage(page.page);
    } catch (err) {
      if (err instanceof ApiClientError) push("error", err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Products</h1>
          <p className="mt-0.5 text-xs text-mutedslate">
            {formatNumber(page.total)} product{page.total === 1 ? "" : "s"} in the Drivebase catalog
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/movements?action=new">
            <Button variant="outline" size="sm">
              <ArrowLeftRight size={14} /> Movement
            </Button>
          </Link>
          <Button variant="sage" size="sm" onClick={openCreate}>
            <PackagePlus size={14} /> Add product
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-mutedslate" />
          <Input
            className="pl-8"
            placeholder="Search name, SKU, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All stock statuses</option>
          {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Sort: name</option>
          <option value="sku">Sort: SKU</option>
          <option value="stock">Sort: stock (low first)</option>
          <option value="updated">Sort: recently updated</option>
          <option value="created">Sort: newest</option>
        </Select>
      </div>

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        {loading && page.products.length === 0 ? (
          <Spinner label="Loading products from Drivebase…" />
        ) : page.total === 0 ? (
          <EmptyState
            icon={<Package size={28} strokeWidth={1.4} />}
            title={query.toString() ? "No matching products" : "No products yet"}
            description={
              query.toString()
                ? "Try a different search term or clear the filters."
                : "Add your first product — it is stored as a record in the Drivebase products table."
            }
            action={
              query.toString() ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setCategoryId("");
                    setStatus("");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button variant="sage" size="sm" onClick={openCreate}>
                  <PackagePlus size={14} /> Add product
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-warmivory/60 text-[11px] tracking-wide text-mutedslate uppercase">
                    <th className="py-2.5 pr-3 pl-5 font-medium">Product</th>
                    <th className="px-3 py-2.5 font-medium">SKU</th>
                    <th className="px-3 py-2.5 font-medium">Category</th>
                    <th className="px-3 py-2.5 font-medium">Supplier</th>
                    <th className="px-3 py-2.5 text-right font-medium">Stock</th>
                    <th className="px-3 py-2.5 text-right font-medium">Purchase</th>
                    <th className="px-3 py-2.5 text-right font-medium">Selling</th>
                    <th className="py-2.5 pr-5 pl-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linemuted">
                  {page.products.map((p) => (
                    <tr key={p.id} className="group hover:bg-warmivory/50">
                      <td className="py-2.5 pr-3 pl-5">
                        <div className="flex items-center gap-3">
                          <Thumb product={p} />
                          <div className="min-w-0">
                            <Link
                              href={`/products/${p.id}`}
                              className="block max-w-[220px] truncate font-medium text-charcoal hover:underline"
                            >
                              {p.name}
                            </Link>
                            {p.description ? (
                              <p className="max-w-[220px] truncate text-[11px] text-mutedslate">
                                {p.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-graphite">{p.sku}</td>
                      <td className="px-3 py-2.5 text-graphite">
                        {p.categoryName ? (
                          <Badge tone="outline">{p.categoryName}</Badge>
                        ) : (
                          <span className="text-mutedslate/60">—</span>
                        )}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2.5 text-graphite">
                        {p.supplierName ?? <span className="text-mutedslate/60">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="tabular text-charcoal">
                            {formatNumber(p.stockQuantity)} {p.unit ?? ""}
                          </span>
                          <StatusBadge status={productStatus(p)} />
                        </div>
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-graphite">
                        {formatCurrency(p.purchasePrice, currency)}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-charcoal">
                        {formatCurrency(p.sellingPrice, currency)}
                      </td>
                      <td className="py-2.5 pr-5 pl-3 text-right">
                        <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                          <Link href={`/products/${p.id}`}>
                            <Button variant="ghost" size="sm" title="View detail">
                              View
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete"
                            className="text-danger hover:bg-dangerbg"
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loading ? (
              <div className="border-t border-line py-2 text-center text-[11px] text-mutedslate">
                Updating…
              </div>
            ) : null}
            <Pagination
              page={page.page}
              totalPages={page.totalPages}
              total={page.total}
              onChange={(p) => void fetchPage(p)}
            />
          </>
        )}
      </section>

      {/* Create / edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit “${editing.name}”` : "Add product"}
        description={
          editing
            ? "Changes are written to the Drivebase products table."
            : "The product is stored as a Drivebase record. Add an image afterwards from the product page."
        }
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? "Save changes" : "Create product"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormRow>
            <Field label="SKU" required error={fieldErrors.sku}>
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="e.g. SW-001"
              />
            </Field>
            <Field label="Name" required error={fieldErrors.name}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. A4 Copy Paper 80gsm"
              />
            </Field>
          </FormRow>
          <Field label="Description" error={fieldErrors.description}>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional details"
            />
          </Field>
          <FormRow>
            <Field label="Category" error={fieldErrors.categoryId}>
              <Select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier" error={fieldErrors.supplierId}>
              <Select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormRow>
          <FormRow>
            <Field label={`Purchase price (${currency})`} error={fieldErrors.purchasePrice}>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label={`Selling price (${currency})`} error={fieldErrors.sellingPrice}>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                placeholder="0"
              />
            </Field>
          </FormRow>
          {!editing ? (
            <FormRow>
              <Field
                label="Opening stock"
                hint="Recorded as an opening Stock-in movement"
                error={fieldErrors.stockQuantity}
              >
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stockQuantity}
                  onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                />
              </Field>
              <Field label="Minimum stock" hint="Low-stock alert level" error={fieldErrors.minimumStock}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.minimumStock}
                  onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                />
              </Field>
            </FormRow>
          ) : (
            <FormRow>
              <Field label="Minimum stock" hint="Low-stock alert level" error={fieldErrors.minimumStock}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.minimumStock}
                  onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                />
              </Field>
              <Field label="Stock on hand" hint="Use a stock movement to change stock safely">
                <Input value={formatNumber(editing.stockQuantity)} disabled />
              </Field>
            </FormRow>
          )}
          <Field label="Unit" hint={`Default: ${defaultUnit}`} error={fieldErrors.unit}>
            <Input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="pcs / box / kg"
            />
          </Field>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete product"
        description="This also deletes the product's movement history and stored image."
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>
              <Trash2 size={14} /> Delete permanently
            </Button>
          </>
        }
      >
        {deleteTarget ? (
          <p className="text-sm leading-relaxed text-graphite">
            Delete <span className="font-medium text-charcoal">{deleteTarget.name}</span> (
            {deleteTarget.sku})? This removes the Drivebase record, its stock movement ledger
            entries and its image file. This cannot be undone.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

function Thumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  if (!product.imageFileId || failed) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-warmivory text-mutedslate/50">
        <Package size={14} strokeWidth={1.6} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl(product.imageFileId)}
      alt=""
      className="h-9 w-9 shrink-0 rounded border border-line bg-white object-cover"
      onError={() => setFailed(true)}
    />
  );
}
