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

/** Result of checking saved credentials without pulling a credit report. */
export type ProbeResult = { ok: boolean; message: string; code?: string };

export interface BureauAdapter {
  code: BureauCode;
  fetchReport(req: BureauRequest): Promise<BureauReport>;
  /** Checks connectivity and login without pulling a report, where the bureau allows it. */
  probe?(): Promise<ProbeResult>;
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
export type CredentialField = {
  key: string;
  label: string;
  maxLength: number;
  secret?: boolean;
  /** Must be an https:// address. */
  url?: boolean;
  optional?: boolean;
  placeholder?: string;
  hint?: string;
};

/** What the API address (endpointUrl) field should look like for each bureau. */
export const ENDPOINT_PLACEHOLDERS: Partial<Record<BureauCode, string>> = {
  EQUIFAX: "https://api.uat.equifax.co.in/business/cir/v1/cir360Report",
};

/** A bureau environment the superadmin can pick instead of typing addresses. */
export type BureauEnvironment = {
  key: string;
  label: string;
  hint: string;
  /** endpointUrl plus any URL credential fields (e.g. tokenUrl). */
  urls: Record<string, string>;
};

// From the CIR360 Report API spec (developer.equifax.in). Production's token URL follows the same pattern.
export const BUREAU_ENVIRONMENTS: Partial<Record<BureauCode, BureauEnvironment[]>> = {
  EQUIFAX: [
    {
      key: "sandbox",
      label: "Sandbox",
      hint: "Equifax's test data. Use the sandbox client ID and secret.",
      urls: {
        endpointUrl: "https://api.sandbox.equifax.co.in/business/cir/v1/cir360Report",
        tokenUrl: "https://api.sandbox.equifax.co.in/v2/oauth/token",
      },
    },
    {
      key: "uat",
      label: "UAT (Test)",
      hint: "After the app is promoted to Test in the developer portal.",
      urls: {
        endpointUrl: "https://api.uat.equifax.co.in/business/cir/v1/cir360Report",
        tokenUrl: "https://api.uat.equifax.co.in/v2/oauth/token",
      },
    },
    {
      key: "production",
      label: "Production",
      hint: "Live credit reports, billed by Equifax. Use the Live client ID and secret.",
      urls: {
        endpointUrl: "https://api.equifax.co.in/business/cir/v1/cir360Report",
        tokenUrl: "https://api.equifax.co.in/v2/oauth/token",
      },
    },
  ],
};

export const CREDENTIAL_FIELDS: Partial<Record<BureauCode, CredentialField[]>> = {
  EQUIFAX: [
    {
      key: "tokenUrl",
      label: "OAuth token URL",
      url: true,
      maxLength: 300,
      placeholder: "https://api.uat.equifax.co.in/v2/oauth/token",
    },
    { key: "clientId", label: "Client ID", maxLength: 200, hint: "From Equifax's developer portal" },
    { key: "clientSecret", label: "Client secret", secret: true, maxLength: 300 },
    {
      key: "scope",
      label: "Scope",
      optional: true,
      maxLength: 300,
      placeholder: "https://api.equifax.com/business/cir/v1",
      hint: "Leave blank to use the CIR 360 scope",
    },
    { key: "customerId", label: "Customer ID", maxLength: 50 },
    { key: "userId", label: "User ID", maxLength: 50 },
    { key: "password", label: "Password", secret: true, maxLength: 50 },
    { key: "memberNumber", label: "Member number", maxLength: 10 },
    { key: "securityCode", label: "Security code", secret: true, maxLength: 3 },
    { key: "productVersion", label: "Product version", optional: true, maxLength: 20, hint: "Only if Equifax gave you one" },
  ],
};
