"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";

/** Date-range + category filter form; submits as URL params (server-rendered report). */
export function ReportFiltersForm({
  categories,
  from,
  to,
  categoryId,
}: {
  categories: Array<{ id: string; name: string }>;
  from: string;
  to: string;
  categoryId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [f, setF] = useState({ from, to, categoryId });

  function apply() {
    const next = new URLSearchParams();
    if (f.from) next.set("from", f.from);
    if (f.to) next.set("to", f.to);
    if (f.categoryId) next.set("categoryId", f.categoryId);
    const qs = next.toString();
    router.push(qs ? `/reports?${qs}` : "/reports");
  }

  function reset() {
    setF({ from: "", to: "", categoryId: "" });
    router.push("/reports");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-4"
    >
      <Field label="From">
        <Input
          type="date"
          value={f.from}
          max={f.to || undefined}
          onChange={(e) => setF({ ...f, from: e.target.value })}
        />
      </Field>
      <Field label="To">
        <Input
          type="date"
          value={f.to}
          min={f.from || undefined}
          onChange={(e) => setF({ ...f, to: e.target.value })}
        />
      </Field>
      <Field label="Category">
        <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" className="w-full sm:w-auto">
          Apply
        </Button>
        {params.toString() ? (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Reset
          </Button>
        ) : null}
      </div>
    </form>
  );
}
