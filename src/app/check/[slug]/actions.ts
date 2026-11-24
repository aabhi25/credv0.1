"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { programAvailability, runEligibilityCheck } from "@/lib/eligibility";
import { rateLimit } from "@/lib/rate-limit";
import { applicantSchemaFor } from "@/lib/validation";

export type CheckState =
  | { kind: "idle" }
  | { kind: "invalid"; errors: Record<string, string>; values: Record<string, string> }
  | { kind: "result"; status: "APPROVED" | "DECLINED" | "ERROR"; approvedLimit: number; name: string; mismatch?: boolean }
  | { kind: "unavailable"; message: string };

export async function checkEligibility(slug: string, _prev: CheckState, formData: FormData): Promise<CheckState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    mobile: String(formData.get("mobile") ?? ""),
    pan: String(formData.get("pan") ?? ""),
    dob: String(formData.get("dob") ?? ""),
    address: String(formData.get("address") ?? ""),
    state: String(formData.get("state") ?? ""),
    pincode: String(formData.get("pincode") ?? ""),
    monthlyIncome: String(formData.get("monthlyIncome") ?? ""),
  };

  const program = await db.program.findUnique({ where: { slug }, include: { organization: { select: { active: true } } } });
  if (!program || !program.active || !program.organization.active) {
    return { kind: "unavailable", message: "This eligibility link is no longer active." };
  }

  const errors: Record<string, string> = {};
  if (formData.get("consent") !== "on") errors.consent = "Please give consent to fetch your credit report";
  const parsed = applicantSchemaFor(program).safeParse(values);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
  }
  if (!parsed.success || Object.keys(errors).length) return { kind: "invalid", errors, values };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (!rateLimit(`check:${ip}`, 5, 60_000)) {
    return { kind: "unavailable", message: "Too many attempts. Please wait a minute and try again." };
  }

  if (!(await programAvailability(program)).ok) {
    return { kind: "unavailable", message: "Eligibility checks for this offer aren't available yet. Please try again later." };
  }

  const outcome = await runEligibilityCheck(program, parsed.data, "LINK");
  return { kind: "result", status: outcome.status, approvedLimit: outcome.approvedLimit, name: parsed.data.name, mismatch: outcome.mismatch };
}
