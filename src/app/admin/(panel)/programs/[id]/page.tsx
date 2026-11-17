import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalStream } from "@/components/ApprovalStream";
import { CopyLink } from "@/components/CopyLink";
import { Card, CardHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { BUREAUS, liveCredentials } from "@/lib/bureaus";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { ProgramForm } from "../ProgramForm";
import { BulkUpload } from "./BulkUpload";
import { DeleteProgram } from "./DeleteProgram";

export const dynamic = "force-dynamic";

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [program, baseUrl] = await Promise.all([
    db.program.findUnique({
      where: { id },
      include: {
        checks: { orderBy: { createdAt: "desc" }, take: 15 },
        _count: { select: { checks: true } },
      },
    }),
    getBaseUrl(),
  ]);
  if (!program) notFound();
  const liveReady = Object.fromEntries(BUREAUS.map((b) => [b, Boolean(liveCredentials(b))]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/programs" className="text-sm text-slate-500 hover:text-navy-900">
            ← Programs
          </Link>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-gold-500">{program.category}</p>
          <h1 className="text-2xl font-semibold text-navy-900">{program.name}</h1>
        </div>
        <Link
          href={`/admin/applicants?program=${program.id}`}
          className="text-sm font-medium text-navy-700 hover:text-navy-900"
        >
          View all {program._count.checks} applicants →
        </Link>
      </div>

      <Card className="p-5">
        <p className="mb-2 text-sm font-medium text-slate-700">Shareable eligibility link</p>
        <CopyLink url={`${baseUrl}/check/${program.slug}`} />
        {!program.active && <p className="mt-2 text-xs text-amber-700">This link is paused. Applicants will see it as inactive.</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Rule engine" subtitle="Criteria applied to every check on this program" />
          <div className="p-6">
            <ProgramForm program={program} liveReady={liveReady} />
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Bulk eligibility upload" subtitle="Check a list of applicants against this program" />
            <div className="p-6">
              <BulkUpload programId={program.id} />
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Recent checks" subtitle="Latest 15 for this program" />
        <ApprovalStream checks={program.checks} showProgram={false} />
      </Card>

      <div className="flex justify-end">
        <DeleteProgram id={program.id} name={program.name} checks={program._count.checks} />
      </div>
    </div>
  );
}
