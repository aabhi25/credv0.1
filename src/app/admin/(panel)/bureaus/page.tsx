import { revalidatePath } from "next/cache";
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash } from "lucide-react";
import { BureauStatusBadge, Card, PageIntro } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { allBureauStatuses, BUREAU_LABELS, bureauCredentials, BUREAUS, type BureauCode } from "@/lib/bureaus";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

async function toggleBureau(formData: FormData) {
  "use server";
  const { organizationId } = await requireAdmin();
  const bureau = String(formData.get("bureau"));
  if (!BUREAUS.includes(bureau as BureauCode)) return;
  const enabled = formData.get("enabled") === "true";
  await db.bureauSetting.upsert({
    where: { organizationId_bureau: { organizationId, bureau } },
    update: { enabled },
    create: { organizationId, bureau, enabled },
  });
  revalidatePath("/admin/bureaus");
}

export default async function BureausPage() {
  const { organizationId } = await requireAdmin();
  const [settings, usage] = await Promise.all([
    db.bureauSetting.findMany({ where: { organizationId } }),
    db.program.groupBy({ by: ["bureau"], where: { organizationId }, _count: true }),
  ]);

  const statuses = allBureauStatuses();
  const anyReady = Object.values(statuses).includes("READY");

  return (
    <div className="space-y-6">
      <PageIntro>
        Eligibility checks pull a live report from the program&apos;s bureau. A bureau must be integrated and have API
        credentials before programs using it can run checks.
      </PageIntro>

      {!anyReady && (
        <div className="flex gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-medium">No credit bureau is live yet.</span> No eligibility checks will run, and every
            eligibility link shows applicants &ldquo;Not available yet&rdquo; until a bureau is integrated.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {BUREAUS.map((code) => {
          const enabled = settings.find((s) => s.bureau === code)?.enabled ?? true;
          const status = statuses[code];
          const integrated = status !== "NOT_INTEGRATED";
          const hasCredentials = Boolean(bureauCredentials(code));
          const programs = usage.find((u) => u.bureau === code)?._count ?? 0;
          return (
            <Card key={code} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{BUREAU_LABELS[code]}</h2>
                    <BureauStatusBadge status={status} />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">Used by {programs} program(s)</p>
                </div>
                <form action={toggleBureau}>
                  <input type="hidden" name="bureau" value={code} />
                  <input type="hidden" name="enabled" value={String(!enabled)} />
                  <button
                    aria-label={enabled ? "Turn off bureau" : "Turn on bureau"}
                    title={enabled ? "On for your organization" : "Off for your organization"}
                    className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-navy-900" : "bg-slate-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`}
                    />
                  </button>
                </form>
              </div>
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
                    ? "Checks can't use this bureau until the integration is built. This needs bureau membership and API access."
                    : "The integration is built; the platform team needs to add the API credentials."}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
