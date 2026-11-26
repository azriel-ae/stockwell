"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListTree, RefreshCcw, Search, ShieldQuestion, TrendingDown, TrendingUp } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FormRow,
  Input,
  Modal,
  MovementTypeBadge,
  Pagination,
  Select,
  Spinner,
  Textarea,
  useFreshId,
  useToast,
} from "@/components/ui";
import type { MovementWithProduct, ReconcileOutcome } from "@/lib/services/stock-movements.service";
import { formatDateTime, formatNumber } from "@/lib/format";
import { apiGet, apiPost, ApiClientError } from "@/lib/client/api";

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  stock: number;
  unit: string | null;
}

interface MovementPageResult {
  movements: MovementWithProduct[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export function MovementsView({
  initialResult,
  products,
  openNew,
  initialProductFilter,
}: {
  initialResult: MovementPageResult;
  products: ProductOption[];
  openNew: boolean;
  initialProductFilter: string;
}) {
  const router = useRouter();
  const { push } = useToast();

  const [result, setResult] = useState<MovementPageResult>(initialResult);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("");
  const [productId, setProductId] = useState(initialProductFilter);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [formOpen, setFormOpen] = useState(openNew);
  const [form, setForm] = useState({
    productId: initialProductFilter || "",
    movementType: "in" as "in" | "out" | "adjustment",
    quantity: "",
    notes: "",
    referenceNumber: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useFreshId("movement");

  const [reconciling, setReconciling] = useState(false);
  const [reconcileOutcomes, setReconcileOutcomes] = useState<ReconcileOutcome[] | null>(null);

  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const filteredMovements = useMemo(() => {
    if (!debounced) return result.movements;
    const q = debounced.toLowerCase();
    return result.movements.filter(
      (m) =>
        (m.productName ?? "").toLowerCase().includes(q) ||
        (m.productSku ?? "").toLowerCase().includes(q) ||
        (m.referenceNumber ?? "").toLowerCase().includes(q),
    );
  }, [result.movements, debounced]);

  const fetchPage = useCallback(
    async (pageNo: number) => {
      const myId = ++requestId.current;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (productId) params.set("productId", productId);
        params.set("page", String(pageNo));
        params.set("perPage", "25");
        const data = await apiGet<MovementPageResult>(`/api/movements?${params.toString()}`);
        if (myId === requestId.current) setResult(data);
      } catch (err) {
        if (err instanceof ApiClientError) push("error", err.message);
      } finally {
        if (myId === requestId.current) setLoading(false);
      }
    },
    [type, productId, push],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  const selectedProduct = products.find((p) => p.id === form.productId) ?? null;

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        productId: form.productId,
        movementType: form.movementType,
        quantity: Number(form.quantity),
        notes: form.notes.trim() || null,
        referenceNumber: form.referenceNumber.trim() || null,
        idempotencyKey,
      };
      const res = await apiPost<{ replayed: boolean; movement: { resultingStock: number } }>(
        "/api/movements",
        payload,
      );
      push(
        "success",
        res.replayed
          ? "This movement was already recorded — replayed the stored result."
          : `Movement recorded. New stock: ${formatNumber(res.movement.resultingStock)}.`,
      );
      setFormOpen(false);
      setForm({ productId: "", movementType: "in", quantity: "", notes: "", referenceNumber: "" });
      router.refresh();
      await fetchPage(1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(err.fieldErrors ?? {});
        push("error", err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function reconcile() {
    setReconciling(true);
    try {
      const res = await apiPost<{ outcomes: ReconcileOutcome[] }>("/api/movements/reconcile");
      setReconcileOutcomes(res.outcomes);
      const completed = res.outcomes.filter((o) => o.outcome === "completed").length;
      const failed = res.outcomes.filter((o) => o.outcome === "failed").length;
      if (res.outcomes.length === 0) push("info", "No pending operations to reconcile.");
      else
        push(
          completed > 0 ? "success" : "info",
          `Reconciled ${completed} operation(s)${failed > 0 ? `, ${failed} failed safely` : ""}.`,
        );
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) push("error", err.message);
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Stock movements</h1>
          <p className="mt-0.5 text-xs text-mutedslate">
            {formatNumber(result.total)} movement{result.total === 1 ? "" : "s"} in the Drivebase
            ledger
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" loading={reconciling} onClick={reconcile}>
            <ShieldQuestion size={14} /> Reconcile pending
          </Button>
          <Button variant="sage" size="sm" onClick={() => setFormOpen(true)}>
            <TrendingUp size={14} /> Record movement
          </Button>
        </div>
      </div>

      {reconcileOutcomes && reconcileOutcomes.length > 0 ? (
        <section className="rounded-lg border border-line bg-white px-5 py-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-graphite uppercase">
            <RefreshCcw size={13} /> Reconciliation report
          </h2>
          <ul className="space-y-1.5">
            {reconcileOutcomes.map((o) => (
              <li key={o.operationKey} className="flex items-start gap-2 text-xs">
                <Badge
                  tone={
                    o.outcome === "completed"
                      ? "success"
                      : o.outcome === "failed"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {o.outcome.replace("_", " ")}
                </Badge>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-mutedslate">{o.operationKey}</p>
                  <p className="text-graphite">{o.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-3">
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-mutedslate" />
          <Input
            className="pl-8"
            placeholder="Search product, SKU, reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All movement types</option>
          <option value="in">Stock in</option>
          <option value="out">Stock out</option>
          <option value="adjustment">Adjustment</option>
        </Select>
        <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </Select>
      </div>

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        {loading && result.movements.length === 0 ? (
          <Spinner label="Loading the movement ledger from Drivebase…" />
        ) : result.total === 0 ? (
          <EmptyState
            icon={<ListTree size={28} strokeWidth={1.4} />}
            title="No stock movements yet"
            description="Record stock in when goods arrive and stock out when they leave — every change is stored in the Drivebase stock_movements table with a full audit trail."
            action={
              <Button variant="sage" size="sm" onClick={() => setFormOpen(true)}>
                <TrendingUp size={14} /> Record movement
              </Button>
            }
          />
        ) : (
          <>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-warmivory/60 text-[11px] tracking-wide text-mutedslate uppercase">
                    <th className="py-2.5 pr-3 pl-5 font-medium">When</th>
                    <th className="px-3 py-2.5 font-medium">Product</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Prev → Result</th>
                    <th className="px-3 py-2.5 font-medium">Reference</th>
                    <th className="py-2.5 pr-5 pl-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linemuted">
                  {filteredMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-warmivory/50">
                      <td className="py-2.5 pr-3 pl-5 text-xs text-mutedslate">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        {m.productId ? (
                          <a
                            href={`/products/${m.productId}`}
                            className="font-medium text-charcoal hover:underline"
                          >
                            {m.productName ?? "Unknown"}
                          </a>
                        ) : (
                          "Deleted product"
                        )}
                        {m.productSku ? (
                          <p className="font-mono text-[10px] text-mutedslate">{m.productSku}</p>
                        ) : null}
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
                      <td className="max-w-[240px] truncate py-2.5 pr-5 pl-3 text-xs text-mutedslate">
                        {m.notes ?? "—"}
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
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              onChange={(p) => void fetchPage(p)}
            />
          </>
        )}
      </section>

      {/* Record movement modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Record stock movement"
        description="Stock changes and the ledger row are written together with retry-safe idempotency keys."
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!form.productId || form.quantity === ""}>
              {form.movementType === "in" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              Record movement
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Product" required error={fieldErrors.productId}>
            <Select
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — {formatNumber(p.stock)} {p.unit ?? ""} in stock
                </option>
              ))}
            </Select>
          </Field>
          <FormRow>
            <Field label="Movement type" required>
              <Select
                value={form.movementType}
                onChange={(e) =>
                  setForm({ ...form, movementType: e.target.value as "in" | "out" | "adjustment" })
                }
              >
                <option value="in">Stock in (add)</option>
                <option value="out">Stock out (remove)</option>
                <option value="adjustment">Adjustment (set delta)</option>
              </Select>
            </Field>
            <Field
              label="Quantity"
              required
              hint={
                form.movementType === "adjustment"
                  ? "Signed, e.g. -3 reduces stock by 3"
                  : selectedProduct
                    ? `Current stock: ${formatNumber(selectedProduct.stock)} ${selectedProduct.unit ?? ""}`
                    : undefined
              }
              error={fieldErrors.quantity}
            >
              <Input
                type="number"
                step="1"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="0"
              />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Reference number" error={fieldErrors.referenceNumber}>
              <Input
                value={form.referenceNumber}
                onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                placeholder="PO-2026-001 / INV-88"
              />
            </Field>
            <div />
          </FormRow>
          <Field
            label="Notes"
            required={form.movementType === "adjustment"}
            hint={
              form.movementType === "adjustment"
                ? "Adjustments require a reason"
                : "Optional context for the audit trail"
            }
            error={fieldErrors.notes}
          >
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={
                form.movementType === "adjustment"
                  ? "e.g. Damaged items found during stock count"
                  : "e.g. Delivery received from supplier"
              }
            />
          </Field>
          {selectedProduct && form.quantity !== "" && Number.isFinite(Number(form.quantity)) ? (
            <p className="rounded-md bg-warmivory px-3 py-2 text-xs text-graphite">
              New stock will be{" "}
              <span className="font-semibold text-charcoal">
                {formatNumber(
                  form.movementType === "out"
                    ? selectedProduct.stock - Number(form.quantity)
                    : selectedProduct.stock + Number(form.quantity),
                )}{" "}
                {selectedProduct.unit ?? ""}
              </span>
              {form.movementType === "out" && selectedProduct.stock - Number(form.quantity) < 0 ? (
                <span className="ml-1 text-danger">(insufficient stock — will be rejected)</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
