"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Database,
  HardDrive,
  Link2,
  Loader2,
  RefreshCcw,
  Table2,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Badge, Button, useToast } from "@/components/ui";
import type { ConnectionReport } from "@/lib/services/connection.service";
import type { InitReport } from "@/lib/services/init.service";
import { formatDateTime, formatNumber } from "@/lib/format";
import { apiGet, apiPost, ApiClientError } from "@/lib/client/api";

const STATUS_META: Record<
  ConnectionReport["status"],
  { label: string; tone: "success" | "danger" | "warning" | "neutral"; detail: string }
> = {
  connected: { label: "Connected", tone: "success", detail: "The API round-trip succeeded." },
  disconnected: { label: "Disconnected", tone: "danger", detail: "The connection failed." },
  authentication_failed: {
    label: "Authentication failed",
    tone: "danger",
    detail: "The API key was rejected (401/403).",
  },
  project_not_found: {
    label: "Project not found",
    tone: "danger",
    detail: "The key's project does not match DRIVEBASE_PROJECT_ID.",
  },
  api_unavailable: {
    label: "API unavailable",
    tone: "danger",
    detail: "Drivebase could not be reached.",
  },
  configuration_missing: {
    label: "Configuration missing",
    tone: "warning",
    detail: "Environment variables are not set.",
  },
};

export function ConnectionView({ initial }: { initial: ConnectionReport }) {
  const router = useRouter();
  const { push } = useToast();
  const [report, setReport] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [initReport, setInitReport] = useState<InitReport | null>(null);

  async function test() {
    setTesting(true);
    try {
      const fresh = await apiGet<ConnectionReport>("/api/connection");
      setReport(fresh);
      push(
        fresh.status === "connected" ? "success" : "error",
        `Connection test: ${STATUS_META[fresh.status].label}.`,
      );
    } catch (err) {
      if (err instanceof ApiClientError) push("error", err.message);
    } finally {
      setTesting(false);
    }
  }

  async function initialize() {
    setInitializing(true);
    try {
      const result = await apiPost<InitReport>("/api/init");
      setInitReport(result);
      push("success", "Initialization finished — existing data was never touched.");
      router.refresh();
      const fresh = await apiGet<ConnectionReport>("/api/connection");
      setReport(fresh);
    } catch (err) {
      if (err instanceof ApiClientError) push("error", err.message);
    } finally {
      setInitializing(false);
    }
  }

  const meta = STATUS_META[report.status];
  const detail = report.detail;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">
            Drivebase connection
          </h1>
          <p className="mt-0.5 text-xs text-mutedslate">
            The status below always reflects a real API round-trip, never just configuration.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" loading={testing} onClick={test}>
            <RefreshCcw size={13} /> Test connection
          </Button>
          <Button variant="sage" size="sm" loading={initializing} onClick={initialize}>
            <Table2 size={13} /> Initialize tables
          </Button>
        </div>
      </div>

      {/* Status card */}
      <section
        className={`rounded-lg border bg-white p-5 ${
          report.status === "connected"
            ? "border-success/30"
            : report.status === "configuration_missing"
              ? "border-warning/30"
              : "border-danger/30"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {report.status === "connected" ? (
              <CheckCircle2 size={22} className="text-success" />
            ) : report.status === "configuration_missing" ? (
              <CircleAlert size={22} className="text-warning" />
            ) : (
              <XCircle size={22} className="text-danger" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-charcoal">{meta.label}</h2>
                <Badge tone={meta.tone}>{report.status}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-graphite">{report.message}</p>
            </div>
          </div>
          <div className="text-right text-[11px] text-mutedslate">
            <p>Checked {formatDateTime(report.checkedAt)}</p>
            {report.lastSuccessfulCheckAt ? (
              <p>Last successful: {formatDateTime(report.lastSuccessfulCheckAt)}</p>
            ) : null}
          </div>
        </div>
      </section>

      {detail ? (
        <>
          {/* Project & storage */}
          <div className="grid gap-6 sm:grid-cols-2">
            <section className="rounded-lg border border-line bg-white p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-graphite uppercase">
                <Link2 size={13} /> Connected project
              </h3>
              <dl className="space-y-2 text-sm">
                <Row label="Project">{detail.project?.name ?? "—"}</Row>
                <Row label="Project ID">
                  <span className="font-mono text-[11px]">{detail.project?.id.slice(0, 13)}…</span>
                </Row>
                <Row label="Database “Stockwell”">
                  {detail.databaseExists ? (
                    <Badge tone="success">exists</Badge>
                  ) : (
                    <Badge tone="warning">missing</Badge>
                  )}
                </Row>
                <Row label="Relationships">
                  {formatNumber(detail.usage.relationships)} registered
                </Row>
              </dl>
            </section>
            <section className="rounded-lg border border-line bg-white p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-graphite uppercase">
                <HardDrive size={13} /> Storage &amp; usage
              </h3>
              <dl className="space-y-2 text-sm">
                <Row label="Google Drive">
                  {detail.storageAvailable ? (
                    <Badge tone="success">connected</Badge>
                  ) : (
                    <Badge tone="danger">not connected</Badge>
                  )}
                </Row>
                <Row label="Tables in project">{formatNumber(detail.usage.tables)}</Row>
                <Row label="Files in storage">{formatNumber(detail.usage.files)}</Row>
                <Row label="API requests (project)">
                  <span className="tabular">{formatNumber(detail.usage.apiRequests)}</span>
                </Row>
              </dl>
            </section>
          </div>

          {/* Table availability */}
          <section className="rounded-lg border border-line bg-white">
            <h3 className="flex items-center gap-1.5 border-b border-line px-5 py-4 text-xs font-semibold tracking-wide text-graphite uppercase">
              <Database size={13} /> Table availability
            </h3>
            <ul className="divide-y divide-linemuted">
              {detail.tables.map((t) => (
                <li key={t.name} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-charcoal">{t.name}</p>
                    {t.issues.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {t.issues.map((issue) => (
                          <li key={issue} className="text-[11px] text-danger">
                            {issue}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-mutedslate">
                        Schema matches Stockwell&apos;s expectation.
                      </p>
                    )}
                  </div>
                  <StatusChip status={t.status} />
                </li>
              ))}
            </ul>
          </section>

          {/* Relationships */}
          <section className="rounded-lg border border-line bg-white">
            <h3 className="flex items-center gap-1.5 border-b border-line px-5 py-4 text-xs font-semibold tracking-wide text-graphite uppercase">
              <TrendingUp size={13} /> Relationships
            </h3>
            <ul className="divide-y divide-linemuted">
              {detail.relationships.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-4 px-5 py-3">
                  <p className="text-xs text-charcoal">{r.name}</p>
                  {r.registered ? (
                    <Badge tone="success">registered</Badge>
                  ) : (
                    <Badge tone="warning">not registered</Badge>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* Init report */}
      {initReport ? (
        <section className="rounded-lg border border-line bg-white p-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-graphite uppercase">
            {initializing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Table2 size={13} />
            )}{" "}
            Initialization report
          </h3>
          <div className="space-y-2 text-xs">
            <p className="text-graphite">
              Drivebase project <span className="font-medium text-charcoal">{initReport.project?.name}</span>{" "}
              · database “{initReport.database.name}”
              {initReport.database.created ? " (created)" : " (already existed)"}
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {initReport.tables.map((t) => (
                <li key={t.name} className="flex items-center justify-between rounded-md border border-line px-3 py-1.5">
                  <span className="font-mono text-[11px]">{t.name}</span>
                  <StatusChip status={t.status} />
                </li>
              ))}
            </ul>
            {initReport.tables.some((t) => t.issues.length > 0) ? (
              <div className="rounded-md border border-warning/30 bg-warningbg/50 p-3">
                <p className="mb-1 font-medium text-warning">Schema drift detected</p>
                <ul className="space-y-1">
                  {initReport.tables
                    .filter((t) => t.issues.length > 0)
                    .flatMap((t) => t.issues.map((i) => ({ t: t.name, i })))
                    .map(({ t, i }) => (
                      <li key={`${t}-${i}`} className="text-[11px] text-graphite">
                        <span className="font-mono">{t}</span>: {i}
                      </li>
                    ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-graphite">
                  Stockwell never overwrites existing tables. Fix the columns from the Drivebase
                  dashboard (Table editor) or delete the empty table there and re-run Initialize.
                </p>
              </div>
            ) : null}
            <p className="text-[11px] text-mutedslate">
              Settings seeded: {initReport.settingsSeeded.length > 0 ? initReport.settingsSeeded.join(", ") : "none (already present)"} ·
              relationships: {initReport.relationships.map((r) => `${r.name} (${r.status})`).join(", ")}
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-mutedslate">{label}</dt>
      <dd className="text-xs text-charcoal">{children}</dd>
    </div>
  );
}

function StatusChip({ status }: { status: "created" | "exists" | "drift" }) {
  if (status === "drift") return <Badge tone="danger">drift</Badge>;
  if (status === "created") return <Badge tone="success">created</Badge>;
  return <Badge tone="neutral">exists</Badge>;
}
