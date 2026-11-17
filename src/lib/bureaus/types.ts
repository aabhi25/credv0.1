export const BUREAUS = ["EQUIFAX", "CIBIL", "CRIF", "EXPERIAN"] as const;
export type BureauCode = (typeof BUREAUS)[number];

export const BUREAU_LABELS: Record<BureauCode, string> = {
  EQUIFAX: "Equifax",
  CIBIL: "TransUnion CIBIL",
  CRIF: "CRIF High Mark",
  EXPERIAN: "Experian",
};

export type BureauRequest = {
  name: string;
  pan: string;
  mobile: string;
  dob: Date;
};

/** Normalised report every adapter must return, whatever the bureau's own format. */
export type BureauReport = {
  score: number;
  dtiPct: number;
  defaults: number;
};

export interface BureauAdapter {
  code: BureauCode;
  fetchReport(req: BureauRequest): Promise<BureauReport>;
}

export class BureauError extends Error {}

/**
 * NOT_INTEGRATED: no adapter has been built for this bureau yet.
 * NEEDS_CREDENTIALS: adapter exists but the API credentials are not set.
 * READY: checks can call the bureau.
 */
export type BureauStatus = "NOT_INTEGRATED" | "NEEDS_CREDENTIALS" | "READY";

export const BUREAU_STATUS_LABELS: Record<BureauStatus, string> = {
  NOT_INTEGRATED: "Not integrated",
  NEEDS_CREDENTIALS: "Credentials missing",
  READY: "Live",
};
