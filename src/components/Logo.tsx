import { ShieldCheck } from "lucide-react";

export function Logo({
  subtitle = "Credit Eligibility Engine",
  compact = false,
  tone = "dark",
  size = "md",
}: {
  subtitle?: string;
  compact?: boolean;
  /** "dark" for navy backgrounds, "light" for white ones. */
  tone?: "dark" | "light";
  size?: "sm" | "md";
}) {
  const light = tone === "light";
  const sm = size === "sm";
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={`flex shrink-0 items-center justify-center ${sm ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-lg"} ${
          light ? "bg-navy-900" : "bg-gradient-to-br from-white/15 to-white/5 ring-1 ring-white/15"
        }`}
      >
        <ShieldCheck className={`${sm ? "h-4 w-4" : "h-[18px] w-[18px]"} text-gold-400`} />
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className={`${sm ? "text-sm" : "text-[15px]"} font-semibold tracking-tight ${light ? "text-navy-900" : "text-white"}`}>
            PreApprove
          </div>
          <div className={`truncate ${sm ? "text-[11px]" : "text-xs"} ${light ? "text-slate-500" : "text-navy-300"}`}>{subtitle}</div>
        </div>
      )}
    </div>
  );
}
