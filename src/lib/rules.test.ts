import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluate, type ProgramCriteria } from "./rules";
import { applicantSchemaFor, programSchema } from "./validation";

const criteria: ProgramCriteria = { minScore: 650, maxDtiPct: 40, maxDefaults: 0, minAge: 21, maxAge: 60, approvedLimit: 50000 };
const report = { score: 703, dtiPct: 13, defaults: 0 };

describe("DTI rule", () => {
  it("declines a DTI above the limit", () => {
    assert.equal(evaluate(criteria, report, 30).approved, true);
    assert.deepEqual(evaluate(criteria, { ...report, dtiPct: 41 }, 30).reasons, ["DTI above 40%"]);
  });

  it("doesn't approve without an income when DTI is checked", () => {
    assert.deepEqual(evaluate(criteria, { ...report, dtiPct: null }, 30).reasons, ["Income not given"]);
  });

  it("is skipped when the program doesn't check DTI, and the other rules still apply", () => {
    const off = { ...criteria, maxDtiPct: null };
    assert.equal(evaluate(off, { ...report, dtiPct: null }, 30).approved, true);
    assert.equal(evaluate(off, { ...report, dtiPct: 95 }, 30).approved, true);
    assert.equal(evaluate(off, { ...report, dtiPct: null, score: 600 }, 30).approved, false);
    assert.equal(evaluate(off, { ...report, dtiPct: null, defaults: 1 }, 30).approved, false);
    assert.equal(evaluate(off, { ...report, dtiPct: null }, 66).approved, false);
  });
});

describe("income", () => {
  const applicant = { name: "Asha Verma", mobile: "9876543210", pan: "ABCDE1234F", dob: "1990-05-14", address: "12 MG Road, Bengaluru", state: "KA", pincode: "560038", monthlyIncome: "" };

  it("is required only when the program checks DTI", () => {
    assert.equal(applicantSchemaFor({ maxDtiPct: 40 }).safeParse(applicant).success, false);
    assert.equal(applicantSchemaFor({ maxDtiPct: 40 }).safeParse({ ...applicant, monthlyIncome: "50,000" }).success, true);
    const parsed = applicantSchemaFor({ maxDtiPct: null }).safeParse({ ...applicant, monthlyIncome: "50000" });
    assert.ok(parsed.success && !("monthlyIncome" in parsed.data));
  });

  it("saves a blank DTI as not checked, and keeps 0 as a real limit", () => {
    const program = { name: "Loans", slug: "loans", category: "Consumer", bureau: "EQUIFAX", inquiryPurpose: "06", minScore: "650", maxDefaults: "0", minAge: "21", maxAge: "60", approvedLimit: "50000", active: true };
    const dti = (maxDtiPct: unknown) => programSchema.safeParse({ ...program, maxDtiPct });
    assert.equal(dti("").data?.maxDtiPct, null);
    assert.equal(dti("0").data?.maxDtiPct, 0);
    assert.equal(dti("40").data?.maxDtiPct, 40);
    assert.equal(dti("101").success, false);
    assert.equal(dti(undefined).success, false);
  });
});
