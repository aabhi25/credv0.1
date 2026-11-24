import { createHash, randomUUID } from "node:crypto";
import type { Program } from "@prisma/client";
import { BUREAU_LABELS, BureauError, bureauStatus, getBureauAdapter, type BureauCode, type BureauReport } from "./bureaus";
import { db } from "./db";
import { hasUsableCredentials, loadBureauCredentials } from "./org-bureaus";
import { evaluate } from "./rules";
import { ageFrom, maskPan, parseDob, type ApplicantInput } from "./validation";

export type Availability = { ok: true } | { ok: false; reason: string };

/**
 * Whether a program can run checks right now. The public page uses this to show applicants
 * "not available" up front instead of letting them submit a check that can't run.
 */
export async function programAvailability(program: Program): Promise<Availability> {
  const bureau = program.bureau as BureauCode;
  const label = BUREAU_LABELS[bureau] ?? bureau;
  if (!program.active) return { ok: false, reason: "This program's link is paused" };
  const setting = await db.bureauSetting.findUnique({
    where: { organizationId_bureau: { organizationId: program.organizationId, bureau } },
  });
  if (!setting?.enabled) return { ok: false, reason: `${label} is not enabled for your organization` };
  const hasCredentials = await hasUsableCredentials(program.organizationId, bureau);
  const status = bureauStatus(bureau, hasCredentials);
  if (status === "NOT_INTEGRATED") return { ok: false, reason: `${label} is not integrated yet` };
  if (status === "NEEDS_CREDENTIALS") return { ok: false, reason: `${label} API credentials are not configured` };
  return { ok: true };
}

export type CheckOutcome = {
  id: string;
  status: "APPROVED" | "DECLINED" | "ERROR";
  approvedLimit: number;
  reasons: string[];
  /** The bureau couldn't match the applicant's details, so they can correct them and retry. */
  mismatch?: boolean;
};

/** Pulls the bureau report, applies the program's rules and records the check. */
export async function runEligibilityCheck(
  program: Program,
  input: ApplicantInput,
  source: "LINK" | "BULK",
): Promise<CheckOutcome> {
  const dob = parseDob(input.dob)!;
  const age = ageFrom(dob);
  const bureau = program.bureau as BureauCode;
  const started = Date.now();
  let status: CheckOutcome["status"];
  let reasons: string[];
  let approvedLimit = 0;
  let report: BureauReport | null = null;
  let dtiPct: number | null = null;
  let mismatch = false;

  try {
    const availability = await programAvailability(program);
    if (!availability.ok) throw new BureauError(availability.reason);
    const creds = await loadBureauCredentials(program.organizationId, bureau);
    report = await getBureauAdapter(bureau, creds).fetchReport({
      name: input.name,
      pan: input.pan,
      mobile: input.mobile,
      dob,
      address: input.address,
      state: input.state,
      pincode: input.pincode,
      inquiryPurpose: program.inquiryPurpose,
      reference: randomUUID().replace(/-/g, "").slice(0, 20),
    });
    if (input.monthlyIncome) dtiPct = Math.round((report.existingEmi / input.monthlyIncome) * 100);

    if (!report.hit || report.score === null) {
      // No credit file (or no score): there's nothing to assess against the rules.
      status = "DECLINED";
      reasons = [report.hit ? "No credit score available" : "No retail credit history at the bureau"];
    } else {
      const result = evaluate(program, { score: report.score, dtiPct, defaults: report.defaults }, age);
      status = result.approved ? "APPROVED" : "DECLINED";
      reasons = result.reasons;
      approvedLimit = result.approvedLimit;
    }
  } catch (err) {
    status = "ERROR";
    mismatch = err instanceof BureauError && err.code === "IDENTITY_MISMATCH";
    reasons = [err instanceof BureauError ? err.message : "Bureau request failed"];
    if (!(err instanceof BureauError)) console.error("Bureau request failed", err);
  }

  const check = await db.eligibilityCheck.create({
    data: {
      programId: program.id,
      name: input.name,
      mobile: input.mobile,
      panMasked: maskPan(input.pan),
      panHash: createHash("sha256").update(input.pan).digest("hex"),
      age,
      bureau,
      score: report?.score ?? null,
      dtiPct,
      defaults: report?.defaults ?? null,
      monthlyIncome: input.monthlyIncome ?? null,
      existingEmi: report?.existingEmi ?? null,
      bureauRef: report?.bureauRef ?? null,
      status,
      reasons: JSON.stringify(reasons),
      approvedLimit,
      latencyMs: Date.now() - started,
      source,
    },
  });

  return { id: check.id, status, approvedLimit, reasons, mismatch };
}

export function parseReasons(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}
