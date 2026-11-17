import Link from "next/link";
import { Building2, LogIn } from "lucide-react";
import { ActiveBadge, Card, CardHeader, PageIntro } from "@/components/ui";
import { requireSuperadmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { viewOrganization } from "../view-as";
import { NewOrganizationButton } from "./forms";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  await requireSuperadmin();
  const [orgs, checks, eligible] = await Promise.all([
    db.organization.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { users: true, programs: true } } },
    }),
    db.eligibilityCheck.groupBy({ by: ["programId"], _count: true }),
    db.eligibilityCheck.groupBy({ by: ["programId"], where: { status: "APPROVED" }, _count: true }),
  ]);
  const programOrg = new Map(
    (await db.program.findMany({ select: { id: true, organizationId: true } })).map((p) => [p.id, p.organizationId]),
  );
  const sumFor = (rows: { programId: string; _count: number }[], orgId: string) =>
    rows.filter((r) => programOrg.get(r.programId) === orgId).reduce((s, r) => s + r._count, 0);

  return (
    <div className="space-y-6">
      <PageIntro actions={<NewOrganizationButton />}>
        Each organization (e.g. an NBFC) has its own admins, programs, applicants and bureau settings.
      </PageIntro>

      <Card className="overflow-hidden">
          <CardHeader title={`${orgs.length} organization(s)`} />
          {orgs.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              No organizations yet. Use <span className="font-medium text-slate-700">New organization</span> to add the first one.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {orgs.map((org) => (
                <li key={org.id} className="flex items-center gap-2 pr-4 hover:bg-slate-50">
                  <Link href={`/superadmin/organizations/${org.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-5 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-navy-900">{org.name}</span>
                        <ActiveBadge active={org.active} on="Active" off="Disabled" />
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {org._count.users} admin(s) · {org._count.programs} program(s) · since {formatDateTime(org.createdAt)}
                      </div>
                    </div>
                    <div className="hidden text-right text-sm sm:block">
                      <div className="font-semibold tabular-nums text-slate-900">{sumFor(checks, org.id)} checks</div>
                      <div className="text-xs tabular-nums text-emerald-700">{sumFor(eligible, org.id)} eligible</div>
                    </div>
                  </Link>
                  <form action={viewOrganization.bind(null, org.id)}>
                    <button
                      title={`Open ${org.name}'s admin panel`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-navy-800 hover:border-navy-300 hover:bg-navy-50"
                    >
                      <LogIn className="h-3.5 w-3.5" /> Open
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}
