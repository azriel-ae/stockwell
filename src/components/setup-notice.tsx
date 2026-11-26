import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";

/** Shown whenever a page cannot read its Drivebase data. */
export function SetupNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-warning/25 bg-warningbg/60 px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-graphite">{detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/connection">
              <Button size="sm" variant="outline">
                Open Drivebase connection <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
