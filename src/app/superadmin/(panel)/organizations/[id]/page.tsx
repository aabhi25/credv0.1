import Link from "next/link";
import { notFound } from "next/navigation";
import { ActiveBadge, BureauStatusBadge, Card, CardHeader, Pill } from "@/components/ui";
import { requireSuperadmin } from "@/lib/auth";
import { getBureauStatus, type BureauCode } from "@/lib/bureaus";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { CreateUserForm, OrganizationStatusButton, RenameOrganizationForm, UserRow } from "../../forms";

export const dynamic = "force-dynamic";

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadmin();
  const { id } = await params;
  const [org, baseUrl] = await Promise.all([
    db.organization.findUnique({
      where: { id },
      include: {
        users: { orderBy: { createdAt: "asc" } },
        programs: { orderBy: { createdAt: "asc" }, include: { _count: { select: { checks: true } } } },
      },
    }),
    getBaseUrl(),
  ]);
  if (!org) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/superadmin" className="text-sm text-slate-500 hover:text-navy-900">
            ← Organizations
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{org.name}</h1>
            <ActiveBadge active={org.active} on="Active" off="Disabled" />
          </div>
        </div>
        <OrganizationStatusButton orgId={org.id} active={org.active} name={org.name} />
      </div>

      {!org.active && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          This organization is disabled. Its admins can&apos;t sign in and its eligibility links show as inactive.
        </div>
      )}

      <Card className="p-5">
        <RenameOrganizationForm orgId={org.id} name={org.name} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader title="Admin accounts" subtitle="Edit email, reset password, or disable access" />
          {org.users.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No admins yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {org.users.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Add admin" subtitle={`Another login for ${org.name}`} />
          <div className="p-5">
            <CreateUserForm orgId={org.id} label="Create admin" />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Programs" subtitle="Managed by this organization's admins" />
        {org.programs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No programs yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {org.programs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
                <div>
                  <span className="font-medium text-slate-900">{p.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{p.category}</span>
                  <div className="font-mono text-xs text-slate-400">
                    {baseUrl}/check/{p.slug}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill>{p.bureau}</Pill>
                  <BureauStatusBadge status={getBureauStatus(p.bureau as BureauCode)} />
                  <span className="text-xs tabular-nums text-slate-500">{p._count.checks} checks</span>
                  {!p.active && <span className="text-xs text-amber-700">Paused</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
