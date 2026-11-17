import Link from "next/link";
import { Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { BUREAUS, liveCredentials } from "@/lib/bureaus";
import { ProgramForm } from "../ProgramForm";

export default async function NewProgramPage() {
  await requireAdmin();
  const liveReady = Object.fromEntries(BUREAUS.map((b) => [b, Boolean(liveCredentials(b))]));
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/programs" className="text-sm text-slate-500 hover:text-navy-900">
          ← Programs
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-navy-900">New program</h1>
        <p className="mt-1 text-sm text-slate-500">Set up a rule engine and get a shareable eligibility link.</p>
      </div>
      <Card className="p-6">
        <ProgramForm liveReady={liveReady} />
      </Card>
    </div>
  );
}
