"use client";

import { useActionState, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { Program } from "@prisma/client";
import { AlertTriangle, Check, CircleCheck, Link2, Loader2 } from "lucide-react";
import { BureauStatusBadge, Button, inputClass } from "@/components/ui";
import { formatInr } from "@/lib/format";
import { BUREAU_LABELS, BUREAUS, type BureauCode, type BureauStatus } from "@/lib/bureaus/types";
import { saveProgram, type ProgramFormState } from "./actions";

type Values = {
  name: string;
  slug: string;
  category: string;
  description: string;
  bureau: string;
  minScore: number;
  maxDtiPct: number;
  maxDefaults: number;
  minAge: number;
  maxAge: number;
  approvedLimit: number;
  active: boolean;
};

const DEFAULTS: Values = {
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

const COMMON_CATEGORIES = ["Education", "Consumer Brands", "Personal Loan", "Two-Wheeler", "Home Improvement", "Healthcare"];

// Score bands on the 300–900 Indian bureau scale.
const SCORE_BANDS = [
  { label: "Poor", from: 300, to: 549, color: "bg-rose-400", text: "text-rose-700" },
  { label: "Fair", from: 550, to: 649, color: "bg-amber-400", text: "text-amber-700" },
  { label: "Good", from: 650, to: 749, color: "bg-emerald-400", text: "text-emerald-700" },
  { label: "Excellent", from: 750, to: 900, color: "bg-emerald-600", text: "text-emerald-800" },
];
const SCORE_PRESETS = [
  { label: "Lenient", value: 600 },
  { label: "Standard", value: 650 },
  { label: "Strict", value: 700 },
  { label: "Prime", value: 750 },
];
const LIMIT_PRESETS = [25_000, 50_000, 1_00_000, 3_00_000, 5_00_000];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function scoreBand(score: number) {
  return SCORE_BANDS.find((b) => score >= b.from && score <= b.to) ?? SCORE_BANDS[0];
}

function shortInr(n: number) {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toString().replace(/\.0+$/, "")}L`;
  return `₹${n / 1000}K`;
}

function toValues(p: Program | undefined, fallbackBureau: string): Values {
  if (!p) return { ...DEFAULTS, bureau: fallbackBureau };
  return {
    name: p.name,
    slug: p.slug,
    category: p.category,
    description: p.description,
    bureau: p.bureau,
    minScore: p.minScore,
    maxDtiPct: p.maxDtiPct,
    maxDefaults: p.maxDefaults,
    minAge: p.minAge,
    maxAge: p.maxAge,
    approvedLimit: p.approvedLimit,
    active: p.active,
  };
}

export function ProgramForm({
  program,
  bureauStatus,
  allowed,
  baseUrl,
  categories = [],
}: {
  program?: Program;
  bureauStatus: Record<BureauCode, BureauStatus>;
  /** Bureaus the superadmin enabled for this organization. */
  allowed: BureauCode[];
  baseUrl: string;
  /** Categories already used in this organization, offered as suggestions. */
  categories?: string[];
}) {
  const saved = toValues(program, allowed[0] ?? DEFAULTS.bureau);
  const [v, setV] = useState<Values>(saved);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const [slugTouched, setSlugTouched] = useState(Boolean(program));
  const [state, action, pending] = useActionState<ProgramFormState, FormData>(saveProgram.bind(null, program?.id ?? null), {});
  const [, startTransition] = useTransition();
  const e = state.errors ?? {};
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  // Keep an existing program's bureau selectable even if it has since been disabled.
  const bureauOptions = BUREAUS.filter((b) => allowed.includes(b) || b === program?.bureau);
  const bureau = v.bureau as BureauCode;
  const bureauEnabled = allowed.includes(bureau);
  const bureauLive = bureauEnabled && bureauStatus[bureau] === "READY";
  const band = scoreBand(v.minScore);
  const linkHost = baseUrl.replace(/^https?:\/\//, "");
  const categoryOptions = Array.from(new Set([...categories, ...COMMON_CATEGORIES]));

  // Submit without React's automatic form reset so values survive validation errors.
  const onSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    startTransition(() => action(fd));
  };

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Every value is submitted through these hidden fields; the visible controls are purely for editing. */}
      <input type="hidden" name="name" value={v.name} />
      <input type="hidden" name="slug" value={v.slug} />
      <input type="hidden" name="category" value={v.category} />
      <input type="hidden" name="description" value={v.description} />
      <input type="hidden" name="bureau" value={v.bureau} />
      <input type="hidden" name="minScore" value={v.minScore} />
      <input type="hidden" name="maxDtiPct" value={v.maxDtiPct} />
      <input type="hidden" name="maxDefaults" value={v.maxDefaults} />
      <input type="hidden" name="minAge" value={v.minAge} />
      <input type="hidden" name="maxAge" value={v.maxAge} />
      <input type="hidden" name="approvedLimit" value={v.approvedLimit} />
      {v.active && <input type="hidden" name="active" value="on" />}

      <div className="space-y-4">
        <Section step={1} title="Basics" description="How this program appears to your team and applicants.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Label text="Program name" error={e.name}>
              <input
                value={v.name}
                onChange={(ev) => {
                  set("name", ev.target.value);
                  if (!slugTouched) set("slug", slugify(ev.target.value));
                }}
                placeholder="e.g. Education Loans"
                className={inputClass}
              />
            </Label>
            <Label text="Category" error={e.category} hint="Partner group, e.g. Education">
              <input
                value={v.category}
                onChange={(ev) => set("category", ev.target.value)}
                list="program-categories"
                placeholder="Choose or type"
                className={inputClass}
              />
              <datalist id="program-categories">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Label>
          </div>
          <Label text="Description" error={e.description} hint="Shown under the title on the applicant's page" optional>
            <textarea
              value={v.description}
              onChange={(ev) => set("description", ev.target.value.slice(0, 300))}
              rows={2}
              placeholder="e.g. Course fee financing for students and parents."
              className={`${inputClass} resize-none`}
            />
          </Label>
        </Section>

        <Section step={2} title="Credit bureau" description="Where each applicant's credit report is pulled from.">
          <div role="radiogroup" aria-label="Credit bureau" className="grid gap-2 sm:grid-cols-2">
            {bureauOptions.map((b) => {
              const selected = v.bureau === b;
              const enabled = allowed.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set("bureau", b)}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
                    selected ? "border-navy-700 bg-navy-50/60 ring-1 ring-navy-700" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-navy-800 bg-navy-800" : "border-slate-300 bg-white"
                      }`}
                    >
                      {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{BUREAU_LABELS[b]}</span>
                  </span>
                  {enabled ? (
                    <BureauStatusBadge status={bureauStatus[b]} />
                  ) : (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Not enabled</span>
                  )}
                </button>
              );
            })}
          </div>
          {e.bureau && <p className="text-xs text-rose-600">{e.bureau}</p>}
          {!bureauLive && (
            <p className="flex gap-2 text-xs leading-relaxed text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              {bureauEnabled
                ? `${BUREAU_LABELS[bureau]} isn't live yet. You can save the program, but no checks will run and its link shows "Not available yet".`
                : `${BUREAU_LABELS[bureau]} is no longer enabled for your organization. Pick another bureau or ask the platform team.`}
            </p>
          )}
        </Section>

        <Section step={3} title="Eligibility rules" description="Applicants must meet every rule to be pre-approved.">
          <Rule
            title="Minimum credit score"
            hint="Applicants scoring below this are declined."
            error={e.minScore}
            control={
              <NumberBox value={v.minScore} min={300} max={900} onChange={(n) => set("minScore", n)} label="Minimum credit score" />
            }
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {SCORE_PRESETS.map((p) => (
                <PresetChip key={p.label} active={v.minScore === p.value} onClick={() => set("minScore", p.value)}>
                  {p.label} · {p.value}
                </PresetChip>
              ))}
              <span className={`ml-auto text-xs font-medium ${band.text}`}>{band.label} and above</span>
            </div>
            <input
              type="range"
              min={300}
              max={900}
              step={5}
              value={v.minScore}
              onChange={(ev) => set("minScore", Number(ev.target.value))}
              aria-label="Minimum credit score"
              className="mt-3 w-full"
            />
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full">
              {SCORE_BANDS.map((b) => (
                <div
                  key={b.label}
                  className={`${b.color} ${v.minScore > b.to ? "opacity-25" : ""}`}
                  style={{ width: `${((b.to - b.from + 1) / 601) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex text-[11px] text-slate-400">
              {SCORE_BANDS.map((b) => (
                <span key={b.label} style={{ width: `${((b.to - b.from + 1) / 601) * 100}%` }}>
                  {b.label}
                </span>
              ))}
            </div>
          </Rule>

          <Rule
            title="Maximum debt-to-income (DTI)"
            hint="Existing monthly EMIs as a share of monthly income."
            error={e.maxDtiPct}
            control={
              <NumberBox value={v.maxDtiPct} min={0} max={100} suffix="%" onChange={(n) => set("maxDtiPct", n)} label="Maximum DTI" />
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {[30, 40, 50].map((p) => (
                <PresetChip key={p} active={v.maxDtiPct === p} onClick={() => set("maxDtiPct", p)}>
                  {p}%
                </PresetChip>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={v.maxDtiPct}
              onChange={(ev) => set("maxDtiPct", Number(ev.target.value))}
              aria-label="Maximum DTI"
              className="mt-3 w-full"
            />
          </Rule>

          <Rule title="Past defaults allowed" hint="0 means only applicants with a clean repayment record qualify." error={e.maxDefaults}>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("maxDefaults", n)}
                  aria-pressed={v.maxDefaults === n}
                  className={`h-8 w-10 rounded-md text-sm font-medium tabular-nums transition-colors ${
                    v.maxDefaults === n ? "bg-navy-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {n === 0 ? "None" : n}
                </button>
              ))}
            </div>
          </Rule>

          <Rule title="Applicant age" hint="Calculated from the date of birth." error={e.minAge || e.maxAge}>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <NumberBox value={v.minAge} min={18} max={80} onChange={(n) => set("minAge", n)} label="Minimum age" />
              <span>to</span>
              <NumberBox value={v.maxAge} min={18} max={100} onChange={(n) => set("maxAge", n)} label="Maximum age" />
              <span>years</span>
            </div>
          </Rule>
        </Section>

        <Section step={4} title="Offer & link" description="What eligible applicants are offered and where they apply.">
          <Label text="Pre-approved limit" error={e.approvedLimit} hint="Offered to every applicant who meets the rules">
            <div className="flex rounded-lg border border-slate-300 bg-white focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-navy-100">
              <span className="flex items-center border-r border-slate-200 px-3 text-sm text-slate-500">₹</span>
              <input
                inputMode="numeric"
                value={v.approvedLimit ? v.approvedLimit.toLocaleString("en-IN") : ""}
                onChange={(ev) => set("approvedLimit", Number(ev.target.value.replace(/\D/g, "").slice(0, 9)) || 0)}
                className="w-full rounded-r-lg px-3 py-2 text-sm tabular-nums text-slate-900 focus:outline-none"
              />
            </div>
          </Label>
          <div className="-mt-1 flex flex-wrap gap-1.5">
            {LIMIT_PRESETS.map((n) => (
              <PresetChip key={n} active={v.approvedLimit === n} onClick={() => set("approvedLimit", n)}>
                {shortInr(n)}
              </PresetChip>
            ))}
          </div>

          <Label text="Link address" error={e.slug} hint={slugTouched ? undefined : "Filled in from the program name"}>
            <div className="flex rounded-lg border border-slate-300 bg-white focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-navy-100">
              <span className="flex max-w-[55%] items-center truncate border-r border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-500">
                {linkHost}/check/
              </span>
              <input
                value={v.slug}
                onChange={(ev) => {
                  setSlugTouched(true);
                  set("slug", slugify(ev.target.value));
                }}
                placeholder="your-link"
                className="min-w-0 flex-1 rounded-r-lg px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none"
              />
            </div>
          </Label>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3.5 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Accept applications</div>
              <div className="text-xs text-slate-500">Turn off to pause the link without deleting the program.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={v.active}
              aria-label="Accept applications"
              onClick={() => set("active", !v.active)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${v.active ? "bg-navy-900" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${v.active ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </Section>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-500">{v.category || "Category"}</div>
            <div className="truncate text-sm font-semibold text-slate-900">{v.name || "Untitled program"}</div>
          </div>
          <div className="space-y-3 px-4 py-3 text-sm">
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">Pre-approve applicants with</div>
              <ul className="space-y-1.5 text-slate-700">
                <SummaryItem>
                  Credit score <b className="font-semibold text-slate-900">{v.minScore}+</b>{" "}
                  <span className={`text-xs ${band.text}`}>({band.label})</span>
                </SummaryItem>
                <SummaryItem>
                  DTI up to <b className="font-semibold text-slate-900">{v.maxDtiPct}%</b>
                </SummaryItem>
                <SummaryItem>
                  {v.maxDefaults === 0 ? (
                    <b className="font-semibold text-slate-900">No past defaults</b>
                  ) : (
                    <>
                      Up to <b className="font-semibold text-slate-900">{v.maxDefaults}</b> past default(s)
                    </>
                  )}
                </SummaryItem>
                <SummaryItem>
                  Aged{" "}
                  <b className="font-semibold text-slate-900">
                    {v.minAge}–{v.maxAge}
                  </b>
                </SummaryItem>
              </ul>
            </div>
            <div className="rounded-lg bg-navy-50/70 px-3 py-2.5">
              <div className="text-xs text-slate-500">They&apos;re offered</div>
              <div className="text-xl font-semibold tracking-tight text-navy-900">{formatInr(v.approvedLimit || 0)}</div>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Bureau</dt>
                <dd className="flex items-center gap-1.5 font-medium text-slate-800">
                  {BUREAU_LABELS[bureau]}
                  {!bureauLive && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Not live" />}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Link</dt>
                <dd className={`font-medium ${v.active ? "text-emerald-700" : "text-slate-500"}`}>{v.active ? "Accepting" : "Paused"}</dd>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5 text-slate-500">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-mono">/check/{v.slug || "your-link"}</span>
              </div>
            </dl>
          </div>
        </div>

        {Object.keys(e).length > 0 && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
            Please fix the highlighted field{Object.keys(e).length > 1 ? "s" : ""}.
          </p>
        )}
        <Button type="submit" disabled={pending || (Boolean(program) && !dirty)} className="w-full">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : program ? (
            "Save changes"
          ) : (
            "Create program"
          )}
        </Button>
        {program && (
          <p className="text-center text-xs text-slate-500">
            {dirty ? (
              "You have unsaved changes"
            ) : state.saved ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Check className="h-3.5 w-3.5" /> All changes saved
              </span>
            ) : (
              "No changes yet"
            )}
          </p>
        )}
      </aside>
    </form>
  );
}

function Section({ step, title, description, children }: { step: number; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-3.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
          {step}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </header>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </section>
  );
}

function Label({
  text,
  hint,
  error,
  optional,
  children,
}: {
  text: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-[13px] font-medium text-slate-700">
        {text}
        {optional && <span className="text-xs font-normal text-slate-400">Optional</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

function Rule({
  title,
  hint,
  error,
  control,
  children,
}: {
  title: string;
  hint: string;
  error?: string;
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
      <div className="mb-2.5 flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-slate-800">{title}</div>
          <div className="text-xs text-slate-500">{hint}</div>
        </div>
        {control}
      </div>
      {children}
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

/** Small number input that lets you type freely and clamps to the range when you leave it. */
function NumberBox({
  value,
  min,
  max,
  suffix,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  suffix?: string;
  label: string;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    onChange(Number.isFinite(n) && draft !== "" ? Math.min(max, Math.max(min, Math.round(n))) : value);
    setDraft(null);
  };
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-navy-100">
      <input
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(ev) => setDraft(ev.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            commit();
          }
        }}
        className="w-14 rounded-lg bg-transparent px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-slate-900 focus:outline-none"
      />
      {suffix && <span className="pr-2 text-sm text-slate-500">{suffix}</span>}
    </span>
  );
}

function PresetChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}
