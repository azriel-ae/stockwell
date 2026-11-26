"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import type { Category } from "@/lib/models";
import { apiDelete, apiPatch, apiPost, ApiClientError } from "@/lib/client/api";

export function CategoriesView({ categories }: { categories: Array<Category & { productCount: number }> }) {
  const router = useRouter();
  const { push } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category & { productCount: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setFieldErrors({});
    setFormOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setDescription(c.description ?? "");
    setFieldErrors({});
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = { name: name.trim(), description: description.trim() || null };
      if (editing) {
        await apiPatch(`/api/categories/${editing.id}`, payload);
        push("success", "Category updated in Drivebase.");
      } else {
        await apiPost("/api/categories", payload);
        push("success", "Category created in Drivebase.");
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
      await apiDelete(`/api/categories/${deleteTarget.id}`);
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
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Categories</h1>
          <p className="mt-0.5 text-xs text-mutedslate">
            {categories.length} categor{categories.length === 1 ? "y" : "ies"} in Drivebase
          </p>
        </div>
        <Button variant="sage" size="sm" onClick={openCreate}>
          <Plus size={14} /> New category
        </Button>
      </div>

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        {categories.length === 0 ? (
          <EmptyState
            icon={<Tags size={28} strokeWidth={1.4} />}
            title="No categories yet"
            description="Create a category to group products — e.g. Office supplies, Electronics, Packaging."
            action={
              <Button variant="sage" size="sm" onClick={openCreate}>
                <Plus size={14} /> New category
              </Button>
            }
          />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-warmivory/60 text-[11px] tracking-wide text-mutedslate uppercase">
                  <th className="py-2.5 pr-3 pl-5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Description</th>
                  <th className="px-3 py-2.5 text-right font-medium">Products</th>
                  <th className="py-2.5 pr-5 pl-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linemuted">
                {categories.map((c) => (
                  <tr key={c.id} className="group hover:bg-warmivory/50">
                    <td className="py-2.5 pr-3 pl-5 font-medium text-charcoal">{c.name}</td>
                    <td className="max-w-[320px] truncate px-3 py-2.5 text-graphite">
                      {c.description ?? <span className="text-mutedslate/60">—</span>}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      <Link
                        href={`/products?categoryId=${c.id}`}
                        className="text-charcoal hover:underline"
                      >
                        {c.productCount}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-5 pl-3 text-right">
                      <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title="Edit">
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-dangerbg"
                          onClick={() => setDeleteTarget(c)}
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
        title={editing ? `Edit “${editing.name}”` : "New category"}
        description="Categories live in the Drivebase categories table."
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? "Save changes" : "Create category"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required error={fieldErrors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office supplies" />
          </Field>
          <Field label="Description" error={fieldErrors.description}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete category"
        description={
          deleteTarget && deleteTarget.productCount > 0
            ? "This category is still in use."
            : undefined
        }
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
              “{deleteTarget.name}” is still used by {deleteTarget.productCount} product
              {deleteTarget.productCount === 1 ? "" : "s"}. Reassign or remove those products
              first — Stockwell refuses to delete a category that would leave products
              pointing at a missing record.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-graphite">
              Delete “{deleteTarget.name}”? No products reference it, so it is safe to remove.
            </p>
          )
        ) : null}
      </Modal>
    </div>
  );
}
