import { ShieldCheck } from "lucide-react";

export function Logo({
  subtitle = "Credit Eligibility Engine",
  compact = false,
  tone = "dark",
}: {
  subtitle?: string;
  compact?: boolean;
  /** "dark" for navy backgrounds, "light" for white ones. */
  tone?: "dark" | "light";
}) {
  const light = tone === "light";
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          light ? "bg-navy-900" : "bg-white/10 ring-1 ring-white/20"
        }`}
      >
        <ShieldCheck className="h-[18px] w-[18px] text-gold-400" />
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className={`text-[15px] font-semibold tracking-tight ${light ? "text-navy-900" : "text-white"}`}>PreApprove</div>
          <div className={`truncate text-xs ${light ? "text-slate-500" : "text-navy-200"}`}>{subtitle}</div>
        </div>
      )}
    </div>
  );
}
