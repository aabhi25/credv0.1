import type { BureauReport } from "./bureaus";

export type ProgramCriteria = {
  minScore: number;
  maxDtiPct: number;
  maxDefaults: number;
  minAge: number;
  maxAge: number;
  approvedLimit: number;
};

export type RuleResult = {
  approved: boolean;
  reasons: string[];
  approvedLimit: number;
};

export function evaluate(criteria: ProgramCriteria, report: BureauReport, age: number): RuleResult {
  const reasons: string[] = [];
  if (report.score < criteria.minScore) reasons.push(`Score below ${criteria.minScore}`);
  if (report.dtiPct > criteria.maxDtiPct) reasons.push(`DTI above ${criteria.maxDtiPct}%`);
  if (report.defaults > criteria.maxDefaults) {
    reasons.push(`${report.defaults} default(s), max ${criteria.maxDefaults}`);
  }
  if (age < criteria.minAge || age > criteria.maxAge) {
    reasons.push(`Age ${age} outside ${criteria.minAge}–${criteria.maxAge}`);
  }
  const approved = reasons.length === 0;
  return { approved, reasons, approvedLimit: approved ? criteria.approvedLimit : 0 };
}
