"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormRow, Input, Select, Textarea, useToast } from "@/components/ui";
import type { AppSettings } from "@/lib/services/settings.service";
import { CURRENCIES } from "@/lib/stock";
import { apiPut, ApiClientError } from "@/lib/client/api";

export function SettingsView({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState({
    businessName: initial.businessName,
    businessDescription: initial.businessDescription,
    currency: initial.currency,
    defaultUnit: initial.defaultUnit,
    lowStockThreshold: String(initial.lowStockThreshold),
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      await apiPut("/api/settings", {
        businessName: form.businessName.trim(),
        businessDescription: form.businessDescription.trim(),
        currency: form.currency,
        defaultUnit: form.defaultUnit.trim(),
        lowStockThreshold: Number(form.lowStockThreshold || 0),
      });
      push("success", "Settings saved to the Drivebase app_settings table.");
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

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-charcoal">Settings</h1>
        <p className="mt-0.5 text-xs text-mutedslate">
          Stored as key/value rows in the Drivebase app_settings table — defaults apply until
          you save.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border border-line bg-white p-5">
        <Field label="Business name" required error={fieldErrors.businessName}>
          <Input
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            placeholder="e.g. Toko Berkah Jaya"
          />
        </Field>
        <Field label="Business description" error={fieldErrors.businessDescription}>
          <Textarea
            value={form.businessDescription}
            onChange={(e) => setForm({ ...form, businessDescription: e.target.value })}
            placeholder="What this inventory tracks"
          />
        </Field>
        <FormRow>
          <Field
            label="Currency"
            hint="IDR formats amounts as Rupiah (Rp1.234.567)"
            error={fieldErrors.currency}
          >
            <Select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value as typeof form.currency })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default stock unit" error={fieldErrors.defaultUnit}>
            <Input
              value={form.defaultUnit}
              onChange={(e) => setForm({ ...form, defaultUnit: e.target.value })}
              placeholder="pcs"
            />
          </Field>
        </FormRow>
        <Field
          label="Low stock threshold default"
          hint="Used as the default minimum stock for new products"
          error={fieldErrors.lowStockThreshold}
        >
          <Input
            type="number"
            min="0"
            step="1"
            className="sm:w-48"
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
          />
        </Field>
        <div className="flex justify-end border-t border-line pt-4">
          <Button onClick={save} loading={saving}>
            Save settings
          </Button>
        </div>
      </section>
    </div>
  );
}
