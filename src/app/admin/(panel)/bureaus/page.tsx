import { revalidatePath } from "next/cache";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Card, PageIntro } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { BUREAU_LABELS, BUREAUS, liveCredentials, type BureauCode } from "@/lib/bureaus";
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

  return (
    <div className="space-y-6">
      <PageIntro>Turn bureaus on or off for every program. Each program picks its bureau and MOCK or LIVE mode.</PageIntro>

      <div className="grid gap-3 md:grid-cols-2">
        {BUREAUS.map((code) => {
          const enabled = settings.find((s) => s.bureau === code)?.enabled ?? true;
          const live = Boolean(liveCredentials(code));
          const programs = usage.find((u) => u.bureau === code)?._count ?? 0;
          return (
            <Card key={code} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{BUREAU_LABELS[code]}</h2>
                  <p className="text-sm text-slate-500">Used by {programs} program(s)</p>
                </div>
                <form action={toggleBureau}>
                  <input type="hidden" name="bureau" value={code} />
                  <input type="hidden" name="enabled" value={String(!enabled)} />
                  <button
                    aria-label={enabled ? "Disable bureau" : "Enable bureau"}
                    className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-navy-900" : "bg-slate-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`}
                    />
                  </button>
                </form>
              </div>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Mock mode</dt>
                  <dd className="inline-flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Available
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Live credentials</dt>
                  <dd className={`inline-flex items-center gap-1.5 ${live ? "text-emerald-700" : "text-slate-500"}`}>
                    {live ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
                    {live ? "Configured" : `Set ${code}_API_URL and ${code}_API_KEY`}
                  </dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
