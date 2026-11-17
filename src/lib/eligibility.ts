import { createHash } from "node:crypto";
import type { Program } from "@prisma/client";
import { BureauError, getBureauAdapter, type ApiMode, type BureauCode } from "./bureaus";
import { db } from "./db";
import { evaluate } from "./rules";
import { ageFrom, maskPan, parseDob, type ApplicantInput } from "./validation";

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
  const apiMode = program.apiMode as ApiMode;

  const bureauSetting = await db.bureauSetting.findUnique({ where: { bureau } });
  const started = Date.now();
  let status: CheckOutcome["status"];
  let reasons: string[];
  let approvedLimit = 0;
  let report: { score: number; dtiPct: number; defaults: number } | null = null;

  try {
    if (bureauSetting && !bureauSetting.enabled) throw new BureauError(`${bureau} is disabled`);
    report = await getBureauAdapter(bureau, apiMode).fetchReport({ ...input, dob });
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
      apiMode,
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
