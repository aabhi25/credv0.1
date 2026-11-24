import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { APP_NAME, LogoMark } from "@/components/Logo";
import { BUREAU_LABELS, type BureauCode } from "@/lib/bureaus";
import { db } from "@/lib/db";
import { programAvailability } from "@/lib/eligibility";
import { CheckForm } from "./CheckForm";

type Props = { params: Promise<{ slug: string }> };

async function getProgram(slug: string) {
  const program = await db.program.findUnique({ where: { slug }, include: { organization: { select: { active: true } } } });
  return program?.active && program.organization.active ? program : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const program = await getProgram((await params).slug);
  return { title: program ? `Check your pre-approval — ${program.name}` : "Link not found" };
}

export default async function CheckPage({ params }: Props) {
  const program = await getProgram((await params).slug);
  if (!program) notFound();
  const bureauLabel = BUREAU_LABELS[program.bureau as BureauCode] ?? program.bureau;
  // Applicants never see the internal reason (e.g. bureau not integrated), only that it isn't open yet.
  const available = (await programAvailability(program)).ok;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-navy-900 pb-32 pt-12">
        <div className="mx-auto max-w-xl px-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <LogoMark className="h-7 w-7" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">{program.category}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Check your pre-approval</h1>
          <p className="mt-3 text-sm text-navy-200">
            {program.description || "Instant eligibility in under a minute."} Powered by {bureauLabel} bureau data.
          </p>
        </div>
      </div>
      <main className="mx-auto -mt-24 max-w-md px-4 pb-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-navy-900/5 sm:p-8">
          {available ? (
            <CheckForm slug={program.slug} bureauLabel={bureauLabel} askIncome={program.maxDtiPct !== null} />
          ) : (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Clock className="h-6 w-6 text-slate-500" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-navy-900">Not available yet</h2>
              <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">
                Eligibility checks for this offer aren&apos;t open yet. Please check back later or contact the lender.
              </p>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">{APP_NAME} · Secure eligibility check</p>
      </main>
    </div>
  );
}
