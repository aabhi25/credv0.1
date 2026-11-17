import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Building2 } from "lucide-react";
import { CopyLink } from "@/components/CopyLink";
import { ActiveBadge, BureauStatusBadge, Card, CardHeader, Pill } from "@/components/ui";
import { requireSuperadmin } from "@/lib/auth";
import { BUREAU_LABELS, BUREAUS, isIntegrated, type BureauCode } from "@/lib/bureaus";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { orgBureauStatuses } from "@/lib/org-bureaus";
import { getBaseUrl } from "@/lib/url";
import { AddUserButton, OrganizationBureaus, OrganizationStatusButton, RenameOrganizationButton, UserRow } from "../../forms";

export const dynamic = "force-dynamic";

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadmin();
  const { id } = await params;
  const [org, baseUrl] = await Promise.all([
    db.organization.findUnique({
      where: { id },
      include: {
        users: { orderBy: { createdAt: "asc" } },
        bureaus: true,
        bureauCredentials: { select: { bureau: true, hint: true, endpointUrl: true, updatedAt: true } },
        programs: { orderBy: { createdAt: "asc" }, include: { _count: { select: { checks: true } } } },
      },
    }),
    getBaseUrl(),
  ]);
  if (!org) notFound();
  const [statuses, eligible] = await Promise.all([
    orgBureauStatuses(org.id),
    db.eligibilityCheck.count({ where: { program: { organizationId: org.id }, status: "APPROVED" } }),
  ]);
  const totalChecks = org.programs.reduce((sum, p) => sum + p._count.checks, 0);
  const bureaus = BUREAUS.map((code) => ({
    code,
    label: BUREAU_LABELS[code],
    enabled: org.bureaus.some((b) => b.bureau === code && b.enabled),
    status: statuses[code],
    programs: org.programs.filter((p) => p.bureau === code).length,
    integrated: isIntegrated(code),
    credential: org.bureauCredentials.find((c) => c.bureau === code) ?? null,
  }));
  const stats = [
    { label: "Admins", value: org.users.length },
    { label: "Programs", value: org.programs.length },
    { label: "Checks", value: totalChecks },
    { label: "Eligible", value: eligible },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/superadmin" className="text-sm text-slate-500 hover:text-navy-900">
          ← Organizations
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-slate-900">{org.name}</h1>
                <ActiveBadge active={org.active} on="Active" off="Disabled" />
              </div>
              <p className="text-xs text-slate-500">Created {formatDateTime(org.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RenameOrganizationButton orgId={org.id} name={org.name} />
            <OrganizationStatusButton orgId={org.id} active={org.active} name={org.name} />
          </div>
        </div>
      </div>

      {!org.active && (
        <div className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          This organization is disabled. Its admins can&apos;t sign in and its eligibility links show as inactive.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Admin accounts"
          subtitle={`People who sign in to manage ${org.name}`}
          action={
            <AddUserButton
              orgId={org.id}
              label="Add admin"
              title={`Add an admin to ${org.name}`}
              description="They'll sign in with this email or username and password."
            />
          }
        />
        {org.users.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No admins yet. Add the first one.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {org.users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Programs" subtitle="Created and managed by this organization's admins" />
        {org.programs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No programs yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {org.programs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="text-xs text-slate-500">{p.category}</span>
                    {!p.active && <ActiveBadge active={false} off="Paused" />}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-3">
                    <span className="truncate font-mono text-xs text-slate-400">
                      {baseUrl}/check/{p.slug}
                    </span>
                    <CopyLink url={`${baseUrl}/check/${p.slug}`} compact />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill>{BUREAU_LABELS[p.bureau as BureauCode] ?? p.bureau}</Pill>
                  <BureauStatusBadge status={statuses[p.bureau as BureauCode]} />
                  <span className="w-20 text-right text-xs tabular-nums text-slate-500">{p._count.checks} checks</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Credit bureaus"
          subtitle="Choose which bureaus this organization can see and use, and add its API credentials"
        />
        <OrganizationBureaus orgId={org.id} orgName={org.name} bureaus={bureaus} />
      </Card>
    </div>
  );
}
