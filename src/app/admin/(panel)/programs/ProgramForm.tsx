"use client";

import { useActionState, useState } from "react";
import type { Program } from "@prisma/client";
import { AlertTriangle, Check } from "lucide-react";
import { BureauStatusBadge, Button, Field, inputClass } from "@/components/ui";
import { BUREAU_LABELS, BUREAU_STATUS_LABELS, BUREAUS, type BureauCode, type BureauStatus } from "@/lib/bureaus/types";
import { saveProgram, type ProgramFormState } from "./actions";

const defaults = {
  name: "",
  slug: "",
  category: "",
  description: "",
  bureau: "EQUIFAX",
  minScore: 650,
  maxDtiPct: 40,
  maxDefaults: 0,
  minAge: 21,
  maxAge: 60,
  approvedLimit: 50000,
  active: true,
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function ProgramForm({ program, bureauStatus }: { program?: Program; bureauStatus: Record<BureauCode, BureauStatus> }) {
  const initial = program ?? defaults;
  const [state, action, pending] = useActionState<ProgramFormState, FormData>(
    saveProgram.bind(null, program?.id ?? null),
    {},
  );
  const [slugTouched, setSlugTouched] = useState(Boolean(program));
  const [slug, setSlug] = useState(initial.slug);
  const [bureau, setBureau] = useState(initial.bureau);
  const [minScore, setMinScore] = useState(initial.minScore);
  const [maxDtiPct, setMaxDtiPct] = useState(initial.maxDtiPct);
  const [maxDefaults, setMaxDefaults] = useState(initial.maxDefaults);
  const e = state.errors ?? {};

  return (
    <form action={action} className="space-y-6">
      <section className="grid gap-5 sm:grid-cols-2">
        <Field label="Program name" error={e.name}>
          <input
            name="name"
            defaultValue={initial.name}
            placeholder="e.g. Education Loans"
            className={inputClass}
            onChange={(ev) => !slugTouched && setSlug(slugify(ev.target.value))}
          />
        </Field>
        <Field label="Category" error={e.category} hint="Group or partner type, e.g. Education, Consumer Brands">
          <input name="category" defaultValue={initial.category} className={inputClass} />
        </Field>
        <Field label="Shareable link" error={e.slug} hint={`/check/${slug || "your-link"}`}>
          <input
            name="slug"
            value={slug}
            onChange={(ev) => {
              setSlugTouched(true);
              setSlug(slugify(ev.target.value));
            }}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Description" error={e.description} hint="Shown to applicants on the eligibility page">
          <input name="description" defaultValue={initial.description} className={inputClass} />
        </Field>
      </section>

      <section className="rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-navy-900">Credit bureau</h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="Bureau">
            <select name="bureau" value={bureau} onChange={(ev) => setBureau(ev.target.value)} className={inputClass}>
              {BUREAUS.map((b) => (
                <option key={b} value={b}>
                  {BUREAU_LABELS[b]}
                  {bureauStatus[b] !== "READY" ? ` (${BUREAU_STATUS_LABELS[bureauStatus[b]].toLowerCase()})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="mb-1 block text-[13px] font-medium text-slate-700">Status</span>
            <div className="py-2">
              <BureauStatusBadge status={bureauStatus[bureau as BureauCode]} />
            </div>
          </div>
        </div>
        {bureauStatus[bureau as BureauCode] !== "READY" && (
          <div className="mt-4 flex gap-2.5 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              {bureauStatus[bureau as BureauCode] === "NOT_INTEGRATED"
                ? `${BUREAU_LABELS[bureau as BureauCode]} is not integrated yet.`
                : `${BUREAU_LABELS[bureau as BureauCode]} API credentials are not configured.`}{" "}
              You can save this program, but no eligibility checks will run and applicants will see &ldquo;Not
              available yet&rdquo; on its link.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-navy-900">Eligibility criteria</h3>
        <div className="mt-5 grid gap-x-10 gap-y-6 md:grid-cols-2">
          <Slider label="Minimum credit score" name="minScore" min={300} max={900} value={minScore} onChange={setMinScore} error={e.minScore} />
          <Slider label="Maximum DTI ratio" name="maxDtiPct" min={0} max={100} value={maxDtiPct} onChange={setMaxDtiPct} suffix="%" error={e.maxDtiPct} />
          <Slider label="Maximum defaults allowed" name="maxDefaults" min={0} max={5} value={maxDefaults} onChange={setMaxDefaults} error={e.maxDefaults} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min age" error={e.minAge}>
              <input name="minAge" type="number" min={18} max={80} defaultValue={initial.minAge} className={inputClass} />
            </Field>
            <Field label="Max age" error={e.maxAge}>
              <input name="maxAge" type="number" min={18} max={100} defaultValue={initial.maxAge} className={inputClass} />
            </Field>
          </div>
          <Field label="Approved limit (₹)" error={e.approvedLimit} hint="Offered to every eligible applicant">
            <input name="approvedLimit" type="number" min={1000} step={1000} defaultValue={initial.approvedLimit} className={inputClass} />
          </Field>
          <label className="flex items-center gap-3 self-end pb-2.5 text-sm text-slate-700">
            <input name="active" type="checkbox" defaultChecked={initial.active} className="h-4 w-4 accent-navy-900" />
            Link is active (applicants can check eligibility)
          </label>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : program ? "Save criteria" : "Create program"}
        </Button>
        {state.saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

function Slider({
  label,
  name,
  min,
  max,
  value,
  onChange,
  suffix = "",
  error,
}: {
  label: string;
  name: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  error?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-lg font-semibold tabular-nums text-navy-900">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={(ev) => onChange(Number(ev.target.value))}
        className="mt-2 w-full"
      />
      <div className="flex justify-between text-xs text-slate-400">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </div>
  );
}
