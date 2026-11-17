import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { requireSuperadmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { CreateOrganizationForm } from "./forms";

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Organizations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Each organization (e.g. an NBFC) has its own admins, programs, applicants and bureau settings.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader title={`${orgs.length} organization(s)`} />
          {orgs.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">No organizations yet. Create the first one.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link href={`/superadmin/organizations/${org.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-navy-900">{org.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                            org.active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-300"
                          }`}
                        >
                          {org.active ? "Active" : "Disabled"}
                        </span>
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
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="New organization" subtitle="Creates the organization and its first admin login" />
          <div className="p-6">
            <CreateOrganizationForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
