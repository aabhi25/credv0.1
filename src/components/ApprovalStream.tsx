import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import type { EligibilityCheck } from "@prisma/client";
import { parseReasons } from "@/lib/eligibility";
import { formatDateTime, formatInr } from "@/lib/format";
import { StatusBadge } from "./ui";

type Row = EligibilityCheck & { program?: { name: string } };

export function ApprovalStream({ checks, showProgram = true }: { checks: Row[]; showProgram?: boolean }) {
  if (!checks.length) {
    return <p className="px-5 py-10 text-center text-sm text-slate-500">No eligibility checks yet.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {checks.map((c) => {
        const reasons = parseReasons(c.reasons);
        const Icon = c.status === "APPROVED" ? CheckCircle2 : c.status === "DECLINED" ? XCircle : CircleAlert;
        const iconColor =
          c.status === "APPROVED" ? "text-emerald-600" : c.status === "DECLINED" ? "text-rose-500" : "text-amber-500";
        return (
          <li key={c.id} className="flex items-start gap-4 px-5 py-3">
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-slate-900">{c.name}</span>
                <span className="font-mono text-xs text-slate-500">{c.panMasked}</span>
                {showProgram && c.program && <span className="text-xs text-slate-400">· {c.program.name}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {c.score != null && <span>Score <b className="font-semibold text-slate-700">{c.score}</b></span>}
                {c.dtiPct != null && <span>DTI <b className="font-semibold text-slate-700">{c.dtiPct}%</b></span>}
                {c.defaults != null && <span>Defaults <b className="font-semibold text-slate-700">{c.defaults}</b></span>}
                {reasons.length > 0 && <span className="text-rose-600">{reasons.join("; ")}</span>}
                {c.status === "APPROVED" && <span className="text-emerald-700">Limit {formatInr(c.approvedLimit)}</span>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <StatusBadge status={c.status} />
              <div className="mt-1 text-[11px] text-slate-400">
                {c.bureau} · {c.apiMode} · {formatDateTime(c.createdAt)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
