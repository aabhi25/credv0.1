import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { BUREAU_LABELS, type BureauCode } from "@/lib/bureaus";
import { db } from "@/lib/db";
import { CheckForm } from "./CheckForm";

type Props = { params: Promise<{ slug: string }> };

async function getProgram(slug: string) {
  const program = await db.program.findUnique({ where: { slug } });
  return program?.active ? program : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const program = await getProgram((await params).slug);
  return { title: program ? `Check your pre-approval — ${program.name}` : "Link not found" };
}

export default async function CheckPage({ params }: Props) {
  const program = await getProgram((await params).slug);
  if (!program) notFound();
  const bureauLabel = BUREAU_LABELS[program.bureau as BureauCode] ?? program.bureau;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-navy-900 pb-32 pt-12">
        <div className="mx-auto max-w-xl px-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <ShieldCheck className="h-6 w-6 text-gold-400" />
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
          <CheckForm slug={program.slug} bureauLabel={bureauLabel} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">PreApprove · Secure eligibility check</p>
      </main>
    </div>
  );
}
