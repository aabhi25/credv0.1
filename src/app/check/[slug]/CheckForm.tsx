"use client";

import { useActionState } from "react";
import { BadgeCheck, CircleAlert, Loader2, Lock, RotateCcw } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { STATES } from "@/lib/bureaus/codes";
import { formatInr } from "@/lib/format";
import { checkEligibility, type CheckState } from "./actions";

export function CheckForm({ slug, bureauLabel }: { slug: string; bureauLabel: string }) {
  const [state, action, pending] = useActionState<CheckState, FormData>(checkEligibility.bind(null, slug), {
    kind: "idle",
  });

  if (state.kind === "result") return <Result state={state} />;

  const errors = state.kind === "invalid" ? state.errors : {};
  const values = state.kind === "invalid" ? state.values : undefined;

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.kind === "unavailable" && (
        <div className="flex gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <CircleAlert className="h-4 w-4 shrink-0 translate-y-0.5" /> {state.message}
        </div>
      )}
      <Field label="Full name" error={errors.name}>
        <input name="name" defaultValue={values?.name} placeholder="As per PAN card" autoComplete="name" className={inputClass} />
      </Field>
      <Field label="Mobile number" error={errors.mobile}>
        <input
          name="mobile"
          defaultValue={values?.mobile}
          placeholder="10-digit mobile"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={14}
          className={inputClass}
        />
      </Field>
      <Field label="PAN card number" error={errors.pan}>
        <input
          name="pan"
          defaultValue={values?.pan}
          placeholder="ABCDE1234F"
          maxLength={10}
          autoCapitalize="characters"
          className={`${inputClass} uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal`}
        />
      </Field>
      <Field label="Date of birth" error={errors.dob}>
        <input name="dob" type="date" defaultValue={values?.dob} max={new Date().toISOString().slice(0, 10)} className={inputClass} />
      </Field>
      <Field label="Current address" error={errors.address}>
        <textarea
          name="address"
          defaultValue={values?.address}
          rows={2}
          maxLength={200}
          placeholder="House no., street, area, city"
          autoComplete="street-address"
          className={`${inputClass} resize-none`}
        />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
        <Field label="State" error={errors.state}>
          <select name="state" defaultValue={values?.state ?? ""} className={inputClass}>
            <option value="" disabled>
              Select
            </option>
            {STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="PIN code" error={errors.pincode}>
          <input
            name="pincode"
            defaultValue={values?.pincode}
            placeholder="560038"
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Monthly income" error={errors.monthlyIncome} hint="Take-home income per month, before EMIs">
        <div className="flex rounded-lg border border-slate-300 bg-white focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-navy-100">
          <span className="flex items-center border-r border-slate-200 px-3 text-sm text-slate-500">₹</span>
          <input
            name="monthlyIncome"
            defaultValue={values?.monthlyIncome}
            placeholder="50,000"
            inputMode="numeric"
            maxLength={12}
            className="w-full rounded-r-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </Field>

      <div>
        <label className="flex items-start gap-3 text-sm text-slate-600">
          <input name="consent" type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-navy-900" />
          <span>
            I authorise the lender to fetch my credit report from {bureauLabel} to check my loan eligibility.
          </span>
        </label>
        {errors.consent && <span className="mt-1 block text-xs text-rose-600">{errors.consent}</span>}
      </div>

      <Button type="submit" disabled={pending} className="w-full py-3 text-base">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Checking eligibility…
          </>
        ) : (
          "Check eligibility"
        )}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <Lock className="h-3.5 w-3.5" /> Your details are encrypted in transit and used only for this check.
      </p>
    </form>
  );
}

function Result({ state }: { state: Extract<CheckState, { kind: "result" }> }) {
  const firstName = state.name.split(" ")[0];
  const again = (
    <button
      onClick={() => window.location.reload()}
      className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900"
    >
      <RotateCcw className="h-4 w-4" /> Check another applicant
    </button>
  );

  if (state.status === "APPROVED") {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
          <BadgeCheck className="h-7 w-7 text-emerald-600" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-navy-900">Congratulations, {firstName}!</h2>
        <p className="mt-1 text-sm text-slate-500">You are pre-approved for a credit limit of up to</p>
        <p className="mt-4 text-4xl font-semibold tracking-tight text-navy-900">{formatInr(state.approvedLimit)}</p>
        <p className="mx-auto mt-4 max-w-xs text-xs text-slate-500">
          Our team will contact you on your registered mobile number to complete the process.
        </p>
        {again}
      </div>
    );
  }

  return (
    <div className="py-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <CircleAlert className="h-7 w-7 text-slate-500" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-navy-900">
        {state.status === "ERROR" ? "We couldn't complete your check" : `Thank you, ${firstName}`}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
        {state.status === "ERROR"
          ? "We couldn't fetch your credit report just now. Please try again in a little while."
          : "You are not pre-approved for this offer right now. You can check again later."}
      </p>
      {again}
    </div>
  );
}
