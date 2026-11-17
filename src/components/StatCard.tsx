import type { LucideIcon } from "lucide-react";
import { Card } from "./ui";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-navy-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{hint}</div>
    </Card>
  );
}
