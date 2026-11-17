import Link from "next/link";
import { Download } from "lucide-react";
import { Card, inputClass, StatusBadge } from "@/components/ui";
import { applicantWhere } from "@/lib/applicant-filters";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseReasons } from "@/lib/eligibility";
import { formatDateTime, formatInr } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = Promise<{ program?: string; status?: string; q?: string; page?: string }>;

export default async function ApplicantsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = applicantWhere(sp);

  const [programs, total, checks, eligibleCount] = await Promise.all([
    db.program.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.eligibilityCheck.count({ where }),
    db.eligibilityCheck.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { program: { select: { name: true } } },
    }),
    db.eligibilityCheck.count({ where: { ...where, status: "APPROVED" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ program: sp.program, status: sp.status, q: sp.q, ...overrides })) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    return params.toString();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Applicants</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total} check(s) · <span className="text-emerald-700">{eligibleCount} eligible</span>
          </p>
        </div>
        <a
          href={`/admin/applicants/export?${qs({ page: undefined })}`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </div>

      <form className="grid gap-3 sm:grid-cols-[1fr_200px_180px_auto]">
        <input name="q" defaultValue={sp.q} placeholder="Search name, mobile or PAN" className={inputClass} />
        <select name="program" defaultValue={sp.program ?? ""} className={inputClass}>
          <option value="">All programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className={inputClass}>
          <option value="">All results</option>
          <option value="APPROVED">Eligible</option>
          <option value="DECLINED">Not eligible</option>
          <option value="ERROR">Error</option>
        </select>
        <button className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">Filter</button>
      </form>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Applicant</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                <th className="px-4 py-3 font-semibold">Program</th>
                <th className="px-4 py-3 text-right font-semibold">Score</th>
                <th className="px-4 py-3 text-right font-semibold">DTI</th>
                <th className="px-4 py-3 font-semibold">Result</th>
                <th className="px-4 py-3 text-right font-semibold">Limit</th>
                <th className="px-4 py-3 font-semibold">Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checks.map((c) => {
                const reasons = parseReasons(c.reasons);
                return (
                  <tr key={c.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      <div className="font-mono text-xs text-slate-500">
                        {c.panMasked} · age {c.age}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{c.mobile}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{c.program.name}</div>
                      <div className="text-xs text-slate-500">
                        {c.bureau} · {c.apiMode} · {c.source === "BULK" ? "Bulk" : "Link"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.score ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.dtiPct != null ? `${c.dtiPct}%` : "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                      {reasons.length > 0 && (
                        <div className="mt-1 max-w-56 whitespace-normal text-xs text-slate-500">{reasons.join("; ")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.approvedLimit ? formatInr(c.approvedLimit) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(c.createdAt)}</td>
                  </tr>
                );
              })}
              {checks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    No applicants match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`?${qs({ page: page - 1 })}`} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link href={`?${qs({ page: page + 1 })}`} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
