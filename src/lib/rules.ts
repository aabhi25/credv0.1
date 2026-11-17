export type ProgramCriteria = {
  minScore: number;
  maxDtiPct: number;
  maxDefaults: number;
  minAge: number;
  maxAge: number;
  approvedLimit: number;
};

/** What the rules look at, derived from the bureau report plus the applicant's income. */
export type Assessment = { score: number; dtiPct: number; defaults: number };

export type RuleResult = {
  approved: boolean;
  reasons: string[];
  approvedLimit: number;
};

export function evaluate(criteria: ProgramCriteria, report: Assessment, age: number): RuleResult {
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
