import Link from "next/link";
import { Activity, IndianRupee, Timer, TrendingUp } from "lucide-react";
import { ApprovalStream } from "@/components/ApprovalStream";
import { StatCard } from "@/components/StatCard";
import { Card, CardHeader, Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatInrCompact } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await requireAdmin();

  const [totals, approved, programs, byProgram, recent] = await Promise.all([
    db.eligibilityCheck.aggregate({ _count: true, _avg: { latencyMs: true } }),
    db.eligibilityCheck.aggregate({ where: { status: "APPROVED" }, _count: true, _sum: { approvedLimit: true } }),
    db.program.findMany({ orderBy: { createdAt: "asc" } }),
    db.eligibilityCheck.groupBy({ by: ["programId", "status"], _count: true }),
    db.eligibilityCheck.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { program: { select: { name: true } } } }),
  ]);

  const total = totals._count;
  const conversion = total ? Math.round((approved._count / total) * 100) : 0;
  const countFor = (programId: string, status?: string) =>
    byProgram
      .filter((r) => r.programId === programId && (!status || r.status === status))
      .reduce((sum, r) => sum + r._count, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Eligibility activity across all programs.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total checks" value={String(total)} hint="Across all links and bulk uploads" icon={Activity} />
        <StatCard label="Conversion rate" value={`${conversion}%`} hint={`${approved._count} eligible applicants`} icon={TrendingUp} />
        <StatCard
          label="Limit pre-approved"
          value={formatInrCompact(approved._sum.approvedLimit ?? 0)}
          hint="Cumulative approved limit"
          icon={IndianRupee}
        />
        <StatCard
          label="Bureau latency"
          value={`${Math.round(totals._avg.latencyMs ?? 0)}ms`}
          hint="Average response time"
          icon={Timer}
        />
      </div>

      <Card>
        <CardHeader
          title="Programs"
          subtitle="Each program runs its own rule engine and shareable link"
          action={
            <Link href="/admin/programs" className="text-sm font-medium text-navy-700 hover:text-navy-900">
              Manage →
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Program</th>
                <th className="px-6 py-3 font-semibold">Bureau</th>
                <th className="px-6 py-3 text-right font-semibold">Checks</th>
                <th className="px-6 py-3 text-right font-semibold">Eligible</th>
                <th className="px-6 py-3 text-right font-semibold">Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programs.map((p) => {
                const checks = countFor(p.id);
                const eligible = countFor(p.id, "APPROVED");
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-6 py-4">
                      <Link href={`/admin/programs/${p.id}`} className="font-medium text-navy-900 hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-slate-500">{p.category}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Pill>
                        {p.bureau} · {p.apiMode}
                      </Pill>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums">{checks}</td>
                    <td className="px-6 py-4 text-right tabular-nums">{eligible}</td>
                    <td className="px-6 py-4 text-right tabular-nums">
                      {checks ? Math.round((eligible / checks) * 100) : 0}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Live approval stream" subtitle="Most recent 10 checks" />
        <ApprovalStream checks={recent} />
      </Card>
    </div>
  );
}
