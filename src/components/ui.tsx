import type { ComponentProps, ReactNode } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
      <div>
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
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
    secondary: "border border-slate-300 bg-white text-navy-900 hover:bg-slate-50 disabled:text-slate-400",
    ghost: "text-navy-700 hover:bg-navy-50",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

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
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
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
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    DECLINED: "bg-rose-50 text-rose-700 ring-rose-600/20",
    ERROR: "bg-amber-50 text-amber-800 ring-amber-600/20",
  };
  const labels: Record<string, string> = { APPROVED: "Eligible", DECLINED: "Not eligible", ERROR: "Error" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles[status] ?? "bg-slate-50 text-slate-700 ring-slate-300"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-700 ring-1 ring-inset ring-navy-100">
      {children}
    </span>
  );
}
