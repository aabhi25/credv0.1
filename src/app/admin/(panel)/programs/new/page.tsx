import Link from "next/link";
import { Landmark } from "lucide-react";
import { Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { enabledBureaus, orgBureauStatuses } from "@/lib/org-bureaus";
import { getBaseUrl } from "@/lib/url";
import { ProgramForm } from "../ProgramForm";

export default async function NewProgramPage() {
  const { organizationId } = await requireAdmin();
  const [allowed, statuses, baseUrl, existing] = await Promise.all([
    enabledBureaus(organizationId),
    orgBureauStatuses(organizationId),
    getBaseUrl(),
    db.program.findMany({ where: { organizationId }, select: { category: true }, distinct: ["category"] }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/programs" className="text-sm text-slate-500 hover:text-navy-900">
          ← Programs
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">New program</h1>
        <p className="mt-1 text-sm text-slate-500">Set up a rule engine and get a shareable eligibility link.</p>
      </div>
      {allowed.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Landmark className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-slate-900">No credit bureaus enabled yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Every program needs a credit bureau. Ask the platform team to enable the bureaus your organization uses.
          </p>
        </Card>
      ) : (
        <ProgramForm
          bureauStatus={statuses}
          allowed={allowed}
          baseUrl={baseUrl}
          categories={existing.map((p) => p.category)}
        />
      )}
    </div>
  );
}
