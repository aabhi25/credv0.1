import { ShieldCheck } from "lucide-react";

export function Logo({ subtitle = "Credit Eligibility Engine", compact = false }: { subtitle?: string; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
        <ShieldCheck className="h-5 w-5 text-gold-400" />
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className="text-lg font-semibold tracking-tight text-white">PreApprove</div>
          <div className="truncate text-xs text-navy-200">{subtitle}</div>
        </div>
      )}
    </div>
  );
}
