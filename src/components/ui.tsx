import { BUREAU_STATUS_LABELS, type BureauStatus } from "@/lib/bureaus/types";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`} {...props} />;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Intro line under the top bar: a short description on the left, page actions on the right. */
export function PageIntro({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{children}</p>
      {actions}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-navy-900 text-white hover:bg-navy-800 disabled:bg-navy-300",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400",
    ghost: "text-navy-700 hover:bg-navy-50",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export const primaryLinkClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-navy-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-navy-800";
export const secondaryLinkClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    APPROVED: "bg-emerald-50 text-emerald-700",
    DECLINED: "bg-rose-50 text-rose-700",
    ERROR: "bg-amber-50 text-amber-800",
  };
  const labels: Record<string, string> = { APPROVED: "Eligible", DECLINED: "Not eligible", ERROR: "Error" };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-slate-100 text-slate-700"}`}>
      {labels[status] ?? status}
    </span>
  );
}

export function ActiveBadge({ active, on = "Active", off = "Disabled" }: { active: boolean; on?: string; off?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {active ? on : off}
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-700">{children}</span>
  );
}

/** Filter chips like "All / Eligible / Not eligible". */
export function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-navy-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </a>
  );
}

const BUREAU_STATUS_STYLES: Record<BureauStatus, string> = {
  NOT_INTEGRATED: "bg-amber-50 text-amber-800 ring-amber-600/20",
  NEEDS_CREDENTIALS: "bg-amber-50 text-amber-800 ring-amber-600/20",
  READY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

/** Integration state of a credit bureau: "Not integrated", "Credentials missing" or "Live". */
export function BureauStatusBadge({ status }: { status: BureauStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BUREAU_STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${status === "READY" ? "bg-emerald-500" : "bg-amber-500"}`} />
      {BUREAU_STATUS_LABELS[status]}
    </span>
  );
}
