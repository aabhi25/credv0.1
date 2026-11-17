import { ShieldCheck } from "lucide-react";

export function Logo({ subtitle = "Credit Eligibility Engine" }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
        <ShieldCheck className="h-5 w-5 text-gold-400" />
      </div>
      <div className="leading-tight">
        <div className="text-lg font-semibold tracking-tight text-white">PreApprove</div>
        <div className="text-xs text-navy-200">{subtitle}</div>
      </div>
    </div>
  );
}
