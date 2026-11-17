import { createHash } from "node:crypto";
import type { Program } from "@prisma/client";
import { BUREAU_LABELS, BureauError, getBureauAdapter, getBureauStatus, type BureauCode } from "./bureaus";
import { db } from "./db";
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
  const status = getBureauStatus(bureau);
  if (status === "NOT_INTEGRATED") return { ok: false, reason: `${label} is not integrated yet` };
  if (status === "NEEDS_CREDENTIALS") return { ok: false, reason: `${label} API credentials are not configured` };
  return { ok: true };
}

export type CheckOutcome = {
  id: string;
  status: "APPROVED" | "DECLINED" | "ERROR";
  approvedLimit: number;
  reasons: string[];
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
  let report: { score: number; dtiPct: number; defaults: number } | null = null;

  try {
    const availability = await programAvailability(program);
    if (!availability.ok) throw new BureauError(availability.reason);
    report = await getBureauAdapter(bureau).fetchReport({ ...input, dob });
    const result = evaluate(program, report, age);
    status = result.approved ? "APPROVED" : "DECLINED";
    reasons = result.reasons;
    approvedLimit = result.approvedLimit;
  } catch (err) {
    status = "ERROR";
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
      score: report?.score,
      dtiPct: report?.dtiPct,
      defaults: report?.defaults,
      status,
      reasons: JSON.stringify(reasons),
      approvedLimit,
      latencyMs: Date.now() - started,
      source,
    },
  });

  return { id: check.id, status, approvedLimit, reasons };
}

export function parseReasons(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}
