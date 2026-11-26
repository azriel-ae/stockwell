"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Lock } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { apiPost, ApiClientError } from "@/lib/client/api";

/** Full-screen unlock form shown when STOCKWELL_ACCESS_TOKEN is set. */
export function UnlockScreen() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiPost("/api/unlock", { token });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unlock failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-warmivory px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-charcoal text-white">
            <Boxes size={17} strokeWidth={2.2} />
          </div>
          <p className="text-lg font-semibold tracking-tight text-charcoal">Stockwell</p>
        </div>
        <form
          onSubmit={submit}
          className="rounded-lg border border-line bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 text-graphite">
            <Lock size={15} />
            <h1 className="text-sm font-semibold">This instance is locked</h1>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-mutedslate">
            Enter the access token configured for this Stockwell deployment
            (STOCKWELL_ACCESS_TOKEN) to continue.
          </p>
          <Field label="Access token" required error={error ?? undefined}>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Access token"
              autoFocus
            />
          </Field>
          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={loading} disabled={token.length === 0}>
              Unlock
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-[11px] text-mutedslate">
          Know your stock. Stay in control.
        </p>
      </div>
    </div>
  );
}
