import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { ApprovalStream } from "@/components/ApprovalStream";
import { CopyLink } from "@/components/CopyLink";
import { Card, CardHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { enabledBureaus, orgBureauStatuses } from "@/lib/org-bureaus";
import { programAvailability } from "@/lib/eligibility";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { ProgramForm } from "../ProgramForm";
import { BulkUpload } from "./BulkUpload";
import { DeleteProgram } from "./DeleteProgram";

export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { organizationId } = await requireAdmin();
  const { id } = await params;
  const [program, baseUrl] = await Promise.all([
    db.program.findFirst({
      where: { id, organizationId },
      include: {
        checks: { orderBy: { createdAt: "desc" }, take: 15 },
        _count: { select: { checks: true } },
      },
    }),
    getBaseUrl(),
  ]);
  if (!program) notFound();
  const [availability, allowed, statuses, existing] = await Promise.all([
    programAvailability(program),
    enabledBureaus(organizationId),
    orgBureauStatuses(organizationId),
    db.program.findMany({ where: { organizationId }, select: { category: true }, distinct: ["category"] }),
  ]);
  const blockedReason = availability.ok ? null : availability.reason;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/programs" className="text-sm text-slate-500 hover:text-navy-900">
            ← Programs
          </Link>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-gold-500">{program.category}</p>
          <h1 className="text-xl font-semibold text-slate-900">{program.name}</h1>
        </div>
        <Link
          href={`/admin/applicants?program=${program.id}`}
          className="text-sm font-medium text-navy-700 hover:text-navy-900"
        >
          View all {program._count.checks} applicants →
        </Link>
      </div>

      {blockedReason && (
        <div className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-medium">Checks can&apos;t run on this program: {blockedReason}.</span> Applicants opening the link see
            &ldquo;Not available yet&rdquo;, and bulk checks are disabled.
          </p>
        </div>
      )}

      <Card className="p-5">
        <p className="mb-2 text-sm font-medium text-slate-700">Shareable eligibility link</p>
        <CopyLink url={`${baseUrl}/check/${program.slug}`} />
        {!program.active && <p className="mt-2 text-xs text-amber-700">This link is paused. Applicants will see it as inactive.</p>}
      </Card>

      <ProgramForm
        program={program}
        bureauStatus={statuses}
        allowed={allowed}
        baseUrl={baseUrl}
        categories={existing.map((p) => p.category)}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader title="Recent checks" subtitle="Latest 15 for this program" />
          <ApprovalStream checks={program.checks} showProgram={false} />
        </Card>
        <Card>
          <CardHeader title="Bulk check" subtitle="Upload a CSV of applicants" />
          <div className="p-4">
            <BulkUpload programId={program.id} blockedReason={blockedReason} askIncome={program.maxDtiPct !== null} />
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <DeleteProgram id={program.id} name={program.name} checks={program._count.checks} />
      </div>
    </div>
  );
}
