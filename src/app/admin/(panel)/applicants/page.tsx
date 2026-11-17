import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Card, Chip, inputClass, secondaryLinkClass, StatusBadge } from "@/components/ui";
import { applicantWhere } from "@/lib/applicant-filters";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseReasons } from "@/lib/eligibility";
import { formatDateTime, formatInr } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = Promise<{ program?: string; status?: string; q?: string; page?: string }>;

export default async function ApplicantsPage({ searchParams }: { searchParams: SearchParams }) {
  const { organizationId } = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = applicantWhere(organizationId, sp);

  const [programs, total, checks, eligibleCount] = await Promise.all([
    db.program.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
        <form className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={sp.q} placeholder="Search name, mobile or PAN" className={`${inputClass} pl-9`} />
          </div>
          <select name="program" defaultValue={sp.program ?? ""} className={`${inputClass} sm:w-52`}>
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className={secondaryLinkClass}>Apply</button>
        </form>
        <a href={`/admin/applicants/export?${qs({ page: undefined })}`} className={secondaryLinkClass}>
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            ["", "All"],
            ["APPROVED", "Eligible"],
            ["DECLINED", "Not eligible"],
            ["ERROR", "Error"],
          ].map(([value, label]) => (
            <Chip key={label} href={`?${qs({ status: value, page: undefined })}`} active={(sp.status ?? "") === value}>
              {label}
            </Chip>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          {total} check(s) · <span className="text-emerald-700">{eligibleCount} eligible</span>
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="border-b border-slate-100 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Applicant</th>
                <th className="px-4 py-2.5 font-medium">Mobile</th>
                <th className="px-4 py-2.5 font-medium">Program</th>
                <th className="px-4 py-2.5 text-right font-medium">Score</th>
                <th className="px-4 py-2.5 text-right font-medium">DTI</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
                <th className="px-4 py-2.5 text-right font-medium">Limit</th>
                <th className="px-4 py-2.5 font-medium">Checked</th>
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
