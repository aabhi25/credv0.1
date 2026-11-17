import Link from "next/link";
import { Plus } from "lucide-react";
import { CopyLink } from "@/components/CopyLink";
import { Card, Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { BUREAU_LABELS, type BureauCode } from "@/lib/bureaus";
import { db } from "@/lib/db";
import { formatInr } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  await requireAdmin();
  const [programs, baseUrl] = await Promise.all([
    db.program.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { checks: true } } } }),
    getBaseUrl(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Programs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each program is its own rule engine with its own bureau and shareable link.
          </p>
        </div>
        <Link
          href="/admin/programs/new"
          className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
        >
          <Plus className="h-4 w-4" /> New program
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {programs.map((p) => (
          <Card key={p.id} className="flex flex-col p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-500">{p.category}</p>
                <Link href={`/admin/programs/${p.id}`} className="mt-1 block text-lg font-semibold text-navy-900 hover:underline">
                  {p.name}
                </Link>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                  p.active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-300"
                }`}
              >
                {p.active ? "Active" : "Paused"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{BUREAU_LABELS[p.bureau as BureauCode] ?? p.bureau}</Pill>
              <Pill>{p.apiMode}</Pill>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Min score</dt>
                <dd className="font-semibold text-slate-900">{p.minScore}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Max DTI</dt>
                <dd className="font-semibold text-slate-900">{p.maxDtiPct}%</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Max defaults</dt>
                <dd className="font-semibold text-slate-900">{p.maxDefaults}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Age</dt>
                <dd className="font-semibold text-slate-900">
                  {p.minAge}–{p.maxAge}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Limit</dt>
                <dd className="font-semibold text-slate-900">{formatInr(p.approvedLimit)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Checks</dt>
                <dd className="font-semibold text-slate-900">{p._count.checks}</dd>
              </div>
            </dl>
            <div className="mt-6 border-t border-slate-100 pt-4">
              <CopyLink url={`${baseUrl}/check/${p.slug}`} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
