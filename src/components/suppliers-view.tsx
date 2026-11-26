"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, MapPin, Pencil, Phone, Plus, Trash2, Truck, User } from "lucide-react";
import {
  Button,
  EmptyState,
  Field,
  FormRow,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import type { Supplier } from "@/lib/models";
import { apiDelete, apiPatch, apiPost, ApiClientError } from "@/lib/client/api";

export function SuppliersView({ suppliers }: { suppliers: Array<Supplier & { productCount: number }> }) {
  const router = useRouter();
  const { push } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier & { productCount: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const EMPTY = { name: "", contactPerson: "", email: "", phone: "", address: "", notes: "" };

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFieldErrors({});
    setFormOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      notes: s.notes ?? "",
    });
    setFieldErrors({});
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await apiPatch(`/api/suppliers/${editing.id}`, payload);
        push("success", "Supplier updated in Drivebase.");
      } else {
        await apiPost("/api/suppliers", payload);
        push("success", "Supplier saved to Drivebase.");
      }
      setFormOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(err.fieldErrors ?? {});
        push("error", err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/suppliers/${deleteTarget.id}`);
      push("success", `“${deleteTarget.name}” deleted.`);
      setDeleteTarget(null);
      router.refresh();
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
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Suppliers</h1>
          <p className="mt-0.5 text-xs text-mutedslate">
            {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"} in Drivebase
          </p>
        </div>
        <Button variant="sage" size="sm" onClick={openCreate}>
          <Plus size={14} /> Add supplier
        </Button>
      </div>

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        {suppliers.length === 0 ? (
          <EmptyState
            icon={<Truck size={28} strokeWidth={1.4} />}
            title="No suppliers yet"
            description="Add a supplier to track who provides each product."
            action={
              <Button variant="sage" size="sm" onClick={openCreate}>
                <Plus size={14} /> Add supplier
              </Button>
            }
          />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-warmivory/60 text-[11px] tracking-wide text-mutedslate uppercase">
                  <th className="py-2.5 pr-3 pl-5 font-medium">Supplier</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 text-right font-medium">Products</th>
                  <th className="py-2.5 pr-5 pl-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linemuted">
                {suppliers.map((s) => (
                  <tr key={s.id} className="group hover:bg-warmivory/50">
                    <td className="py-2.5 pr-3 pl-5">
                      <Link
                        href={`/suppliers/${s.id}`}
                        className="font-medium text-charcoal hover:underline"
                      >
                        {s.name}
                      </Link>
                      {s.contactPerson ? (
                        <p className="text-[11px] text-mutedslate">{s.contactPerson}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-graphite">
                      {s.contactPerson ?? <span className="text-mutedslate/60">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-graphite">
                      {s.email ? (
                        <a
                          href={`mailto:${s.email}`}
                          className="flex items-center gap-1 text-charcoal hover:underline"
                        >
                          <Mail size={12} /> {s.email}
                        </a>
                      ) : (
                        <span className="text-mutedslate/60">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-graphite">
                      {s.phone ?? <span className="text-mutedslate/60">—</span>}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      <Link
                        href={`/products?supplierId=${s.id}`}
                        className="text-charcoal hover:underline"
                      >
                        {s.productCount}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-5 pl-3 text-right">
                      <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)} title="Edit">
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-dangerbg"
                          onClick={() => setDeleteTarget(s)}
                          title="Delete"
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
        )}
      </section>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit “${editing.name}”` : "Add supplier"}
        description="Suppliers live in the Drivebase suppliers table."
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? "Save changes" : "Add supplier"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Supplier name" required error={fieldErrors.name}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. PT Sumber Makmur"
            />
          </Field>
          <FormRow>
            <Field label="Contact person" error={fieldErrors.contactPerson}>
              <Input
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                placeholder="e.g. Budi Santoso"
              />
            </Field>
            <Field label="Email" error={fieldErrors.email}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@company.com"
              />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Phone" error={fieldErrors.phone}>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+62 …"
              />
            </Field>
            <Field label="Address" error={fieldErrors.address}>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="City / street"
              />
            </Field>
          </FormRow>
          <Field label="Notes" error={fieldErrors.notes}>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Payment terms, lead time, …"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete supplier"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            {deleteTarget && deleteTarget.productCount === 0 ? (
              <Button variant="danger" onClick={confirmDelete} loading={deleting}>
                <Trash2 size={14} /> Delete
              </Button>
            ) : null}
          </>
        }
      >
        {deleteTarget ? (
          deleteTarget.productCount > 0 ? (
            <p className="text-sm leading-relaxed text-graphite">
              “{deleteTarget.name}” is still linked to {deleteTarget.productCount} product
              {deleteTarget.productCount === 1 ? "" : "s"}. Reassign or remove those products
              first — Stockwell refuses a delete that would leave products pointing at a
              missing supplier record.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-graphite">
              Delete “{deleteTarget.name}”? No products reference this supplier.
            </p>
          )
        ) : null}
      </Modal>
    </div>
  );
}

export function SupplierIconRow({ supplier }: { supplier: Supplier }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-graphite">
      {supplier.contactPerson ? (
        <span className="flex items-center gap-1.5">
          <User size={13} className="text-mutedslate" /> {supplier.contactPerson}
        </span>
      ) : null}
      {supplier.phone ? (
        <span className="flex items-center gap-1.5">
          <Phone size={13} className="text-mutedslate" /> {supplier.phone}
        </span>
      ) : null}
      {supplier.address ? (
        <span className="flex items-center gap-1.5">
          <MapPin size={13} className="text-mutedslate" /> {supplier.address}
        </span>
      ) : null}
    </div>
  );
}
