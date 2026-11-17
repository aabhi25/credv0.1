export const APP_NAME = "CredCap AI";

/** CredCap AI mark: a gold "C" for credit opening onto an AI spark. Keep in sync with src/app/icon.svg. */
export function LogoMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M21.9 10.2A9 9 0 1 0 21.9 21.8" stroke="#D4B26A" strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M25.6 11.6l1 2.9 2.9 1-2.9 1-1 2.9-1-2.9-2.9-1 2.9-1z"
        fill="#F3E3BC"
        stroke="#F3E3BC"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
        <LogoMark className={sm ? "h-5 w-5" : "h-[22px] w-[22px]"} />
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className={`${sm ? "text-sm" : "text-[15px]"} font-semibold tracking-tight ${light ? "text-navy-900" : "text-white"}`}>
            CredCap <span className={light ? "text-gold-500" : "text-gold-400"}>AI</span>
          </div>
          <div className={`truncate ${sm ? "text-[11px]" : "text-xs"} ${light ? "text-slate-500" : "text-navy-300"}`}>{subtitle}</div>
        </div>
      )}
    </div>
  );
}
