export const BUREAUS = ["EQUIFAX", "CIBIL", "CRIF", "EXPERIAN"] as const;
export type BureauCode = (typeof BUREAUS)[number];

export const API_MODES = ["MOCK", "LIVE"] as const;
export type ApiMode = (typeof API_MODES)[number];

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
