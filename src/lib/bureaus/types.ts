// Client-safe bureau types and constants. Server-only code lives in index.ts and the adapters.

export const BUREAUS = ["EQUIFAX", "CIBIL", "CRIF", "EXPERIAN"] as const;
export type BureauCode = (typeof BUREAUS)[number];

export const BUREAU_LABELS: Record<BureauCode, string> = {
  EQUIFAX: "Equifax",
  CIBIL: "TransUnion CIBIL",
  CRIF: "CRIF High Mark",
  EXPERIAN: "Experian",
};

/** Bureaus with a built integration. Keep in sync with INTEGRATIONS in index.ts. */
export const INTEGRATED_BUREAUS: readonly BureauCode[] = ["EQUIFAX"];

export type BureauRequest = {
  name: string;
  pan: string;
  mobile: string;
  dob: Date;
  address: string;
  /** Two-letter state code, e.g. MH. */
  state: string;
  pincode: string;
  /** Bureau enquiry purpose code, e.g. 05 = Personal Loan. */
  inquiryPurpose: string;
  /** Our reference for this enquiry, echoed back by the bureau. */
  reference: string;
};

/** Normalised report every adapter must return, whatever the bureau's own format. */
export type BureauReport = {
  /** False when the bureau has no credit file for the applicant. */
  hit: boolean;
  score: number | null;
  /** Total monthly EMIs across open accounts. */
  existingEmi: number;
  /** Accounts with serious delinquency (90+ days late, written off, settled, suit filed…). */
  defaults: number;
  /** Bureau's own report reference, kept for audit. */
  bureauRef: string | null;
};

export interface BureauAdapter {
  code: BureauCode;
  fetchReport(req: BureauRequest): Promise<BureauReport>;
}

/**
 * A failed bureau call. `adminMessage` explains it to admins (e.g. rejected credentials);
 * applicants only ever see a generic message.
 */
export class BureauError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * NOT_INTEGRATED: no adapter has been built for this bureau yet.
 * NEEDS_CREDENTIALS: adapter exists but this organization hasn't been given API credentials.
 * READY: checks can call the bureau.
 */
export type BureauStatus = "NOT_INTEGRATED" | "NEEDS_CREDENTIALS" | "READY";

export const BUREAU_STATUS_LABELS: Record<BureauStatus, string> = {
  NOT_INTEGRATED: "Not integrated",
  NEEDS_CREDENTIALS: "Credentials missing",
  READY: "Live",
};

/** Credential fields a superadmin enters per organization, by bureau. */
export type CredentialField = { key: string; label: string; secret?: boolean; maxLength: number; hint?: string };

export const CREDENTIAL_FIELDS: Partial<Record<BureauCode, CredentialField[]>> = {
  EQUIFAX: [
    { key: "customerId", label: "Customer ID", maxLength: 50 },
    { key: "userId", label: "User ID", maxLength: 50 },
    { key: "password", label: "Password", secret: true, maxLength: 50 },
    { key: "memberNumber", label: "Member number", maxLength: 10 },
    { key: "securityCode", label: "Security code", secret: true, maxLength: 3 },
  ],
};
