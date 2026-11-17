import Link from "next/link";
import { Activity, AlertTriangle, IndianRupee, Timer, TrendingUp } from "lucide-react";
import { ApprovalStream } from "@/components/ApprovalStream";
import { StatCard } from "@/components/StatCard";
import { BureauStatusBadge, Card, CardHeader, PageIntro, Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { allBureauStatuses, type BureauCode } from "@/lib/bureaus";
import { db } from "@/lib/db";
import { formatInrCompact } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { organizationId } = await requireAdmin();
  const scope = { program: { organizationId } };

  const [totals, approved, programs, byProgram, recent] = await Promise.all([
    db.eligibilityCheck.aggregate({ where: scope, _count: true, _avg: { latencyMs: true } }),
    db.eligibilityCheck.aggregate({ where: { ...scope, status: "APPROVED" }, _count: true, _sum: { approvedLimit: true } }),
    db.program.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    db.eligibilityCheck.groupBy({ by: ["programId", "status"], where: scope, _count: true }),
    db.eligibilityCheck.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 10, include: { program: { select: { name: true } } } }),
  ]);

  const statuses = allBureauStatuses();
  const blocked = programs.filter((p) => p.active && statuses[p.bureau as BureauCode] !== "READY");
  const total = totals._count;
  const conversion = total ? Math.round((approved._count / total) * 100) : 0;
  const countFor = (programId: string, status?: string) =>
    byProgram
      .filter((r) => r.programId === programId && (!status || r.status === status))
      .reduce((sum, r) => sum + r._count, 0);

  return (
    <div className="space-y-6">
      <PageIntro>Eligibility activity across all programs.</PageIntro>

      {blocked.length > 0 && (
        <div className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-medium">
              {blocked.length} of {programs.length} program(s) can&apos;t run eligibility checks
            </span>{" "}
            because their credit bureau isn&apos;t live yet. Their links show applicants &ldquo;Not available yet&rdquo;.{" "}
            <Link href="/admin/bureaus" className="font-medium underline underline-offset-2">
              See bureau status
            </Link>
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <thead className="border-b border-slate-100 text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-medium">Program</th>
                <th className="px-5 py-2.5 font-medium">Bureau</th>
                <th className="px-5 py-2.5 text-right font-medium">Checks</th>
                <th className="px-5 py-2.5 text-right font-medium">Eligible</th>
                <th className="px-5 py-2.5 text-right font-medium">Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {programs.map((p) => {
                const checks = countFor(p.id);
                const eligible = countFor(p.id, "APPROVED");
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <Link href={`/admin/programs/${p.id}`} className="font-medium text-navy-900 hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-slate-500">{p.category}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill>{p.bureau}</Pill>
                        <BureauStatusBadge status={statuses[p.bureau as BureauCode]} />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{checks}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{eligible}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
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
