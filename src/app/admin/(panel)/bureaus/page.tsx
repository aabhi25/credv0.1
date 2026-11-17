import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Landmark } from "lucide-react";
import { BureauStatusBadge, Card, PageIntro } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { BUREAU_LABELS, bureauCredentials, getBureauStatus } from "@/lib/bureaus";
import { db } from "@/lib/db";
import { enabledBureaus } from "@/lib/org-bureaus";

export const dynamic = "force-dynamic";

export default async function BureausPage() {
  const { organizationId } = await requireAdmin();
  const [bureaus, usage] = await Promise.all([
    enabledBureaus(organizationId),
    db.program.groupBy({ by: ["bureau"], where: { organizationId }, _count: true }),
  ]);
  const anyReady = bureaus.some((b) => getBureauStatus(b) === "READY");

  return (
    <div className="space-y-6">
      <PageIntro>
        Credit bureaus your organization can use, as set up by the platform team. Eligibility checks pull a live report
        from the program&apos;s bureau.
      </PageIntro>

      {bureaus.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Landmark className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-slate-900">No credit bureaus enabled yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            The platform team enables bureaus for your organization, usually the ones you hold membership with. Contact
            them to get started.
          </p>
        </Card>
      ) : (
        <>
          {!anyReady && (
            <div className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                <span className="font-medium">None of your bureaus is live yet.</span> No eligibility checks will run, and
                your eligibility links show applicants &ldquo;Not available yet&rdquo; until one is integrated.
              </p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {bureaus.map((code) => {
              const status = getBureauStatus(code);
              const integrated = status !== "NOT_INTEGRATED";
              const hasCredentials = Boolean(bureauCredentials(code));
              const programs = usage.find((u) => u.bureau === code)?._count ?? 0;
              return (
                <Card key={code} className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{BUREAU_LABELS[code]}</h2>
                    <BureauStatusBadge status={status} />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">Used by {programs} program(s)</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-500">Integration</dt>
                      <dd className={`inline-flex items-center gap-1.5 ${integrated ? "text-emerald-700" : "text-amber-800"}`}>
                        {integrated ? <CheckCircle2 className="h-4 w-4" /> : <CircleSlash className="h-4 w-4" />}
                        {integrated ? "Built" : "Not built yet"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-500">API credentials</dt>
                      <dd className={`inline-flex items-center gap-1.5 ${hasCredentials ? "text-emerald-700" : "text-slate-500"}`}>
                        {hasCredentials ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
                        {hasCredentials ? "Configured" : "Not configured"}
                      </dd>
                    </div>
                  </dl>
                  {status !== "READY" && (
                    <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                      {status === "NOT_INTEGRATED"
                        ? "Checks can't use this bureau until the platform team finishes the integration."
                        : "The integration is built; the platform team needs to add the API credentials."}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
