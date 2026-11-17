import { BureauError, type BureauAdapter, type BureauReport, type BureauRequest } from "./types";

// Equifax India "IDCCR" consolidated credit report, REST/JSON over HTTPS.
// Spec: IDCCR Bureau System-to-System External Interface Specification, June 2025.

export type EquifaxCredentials = {
  endpointUrl: string;
  customerId: string;
  userId: string;
  password: string;
  memberNumber: string;
  securityCode: string;
};

const TIMEOUT_MS = 30_000;

// Payment / account status codes (spec Appendix I) we count as a serious delinquency ("default").
const SEVERE_DPD = new Set(["90+", "120+", "180+", "360+", "540+", "720+"]);
const SEVERE_STATUS = new Set([
  "WOF", // written off
  "WOAS",
  "APWO",
  "PWOC",
  "PWOS",
  "SET", // settled
  "APS",
  "AS",
  "RPS",
  "SF", // suit filed
  "WDF", // wilful default
  "DBT", // doubtful
  "LOSS",
  "SUB", // sub-standard
  "BK", // bankruptcy
  "FPD", // first payment default
  "GI", // guarantee invoked
]);
const SEVERE_TEXT = /written[\s-]?off|settled|suit[\s-]?filed|wil+ful|doubtful|loss|sub[\s-]?standard/i;

/** Equifax name fields accept letters, space and - ' . / only, max 40 chars each. */
function cleanName(name: string) {
  return name.replace(/[^a-zA-Z '\-./]/g, " ").replace(/\s+/g, " ").trim();
}

function splitName(name: string) {
  const clean = cleanName(name);
  if (clean.length <= 40) return { FirstName: clean, MiddleName: "", LastName: "" };
  const [first, ...rest] = clean.split(" ");
  return { FirstName: first.slice(0, 40), MiddleName: "", LastName: rest.join(" ").slice(0, 40) };
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function buildEquifaxRequest(creds: Omit<EquifaxCredentials, "endpointUrl">, req: BureauRequest) {
  return {
    RequestHeader: {
      CustomerId: creds.customerId,
      UserId: creds.userId,
      Password: creds.password,
      MemberNumber: creds.memberNumber,
      SecurityCode: creds.securityCode,
      CustRefField: req.reference.slice(0, 50),
      ProductCode: ["IDCCR"],
    },
    RequestBody: {
      InquiryPurpose: req.inquiryPurpose,
      ...splitName(req.name),
      DOB: ymd(req.dob),
      InquiryAddresses: [
        {
          seq: "1",
          AddressType: ["H"],
          AddressLine1: req.address.replace(/\s+/g, " ").trim().slice(0, 220),
          State: req.state,
          Postal: req.pincode,
        },
      ],
      InquiryPhones: [{ seq: "1", Number: req.mobile, PhoneType: ["M"] }],
      IDDetails: [{ seq: "1", IDType: "T", IDValue: req.pan, Source: "Inquiry" }],
      // We only need the data, not the ~700 KB embedded PDF.
      CustomFields: [{ key: "EmbeddedPdf", value: "N" }],
    },
    Score: [{ Type: "ERS", Version: "4.0" }],
  };
}

// The response is loosely typed: fields are optional and numbers arrive as strings.
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : v && typeof v === "object" ? [obj(v)] : []);
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v: unknown) => {
  const s = str(v).replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function firstError(...sources: unknown[]) {
  for (const source of sources) {
    for (const e of arr(source)) {
      const code = str(e.ErrorCode);
      const msg = str(e.ErrorMsg) || str(e.Details);
      if (code || msg) return { code, msg };
    }
  }
  return null;
}

function isSevereAccount(account: Json) {
  if ((num(account.WriteOffAmount) ?? 0) > 0) return true;
  if (SEVERE_TEXT.test(str(account.AccountStatus)) || SEVERE_TEXT.test(str(account.AssetClassification))) return true;
  if (SEVERE_STATUS.has(str(account.SuitFiledStatus).toUpperCase())) return true;
  return arr(account.History48Months ?? account.History24Months).some((month) =>
    [month.PaymentStatus, month.SuitFiledStatus, month.AssetClassificationStatus].some((v) => {
      const code = str(v).toUpperCase();
      return SEVERE_DPD.has(code) || SEVERE_STATUS.has(code);
    }),
  );
}

export function parseEquifaxResponse(body: unknown): BureauReport {
  const root = obj(body);
  const header = obj(root.InquiryResponseHeader);
  const ccr = obj(root.CCRResponse);
  const reports = arr(ccr.CIRReportDataLst);

  const error = firstError(root.Error, ccr.Error, ...reports.map((r) => r.Error));
  if (error || str(header.SuccessCode) === "0" || str(ccr.Status) === "0") {
    const code = error?.code || "UNKNOWN";
    throw new BureauError(`Equifax error ${code}${error?.msg ? `: ${error.msg}` : ""}`, code);
  }

  // The retail report is the one with a retail summary or retail (ERS) score.
  const retail =
    reports.find((r) => {
      const data = obj(r.CIRReportData);
      return data.RetailAccountsSummary || arr(data.ScoreDetails).some((s) => str(s.Type) === "ERS");
    }) ?? reports[0];
  if (!retail) throw new BureauError("Equifax response had no report");

  const data = obj(retail.CIRReportData);
  const summary = obj(data.RetailAccountsSummary);
  const accounts = arr(data.RetailAccountDetails);
  const hitCode = str(obj(retail.InquiryResponseHeader).HitCode);

  const scoreEntry = arr(data.ScoreDetails).find((s) => str(s.Type) === "ERS") ?? arr(data.ScoreDetails)[0];
  const rawScore = num(scoreEntry?.Value);
  const score = rawScore !== null && rawScore >= 300 && rawScore <= 900 ? rawScore : null;

  const emiFromSummary = num(summary.TotalMonthlyPaymentAmount);
  const emiFromAccounts = accounts
    .filter((a) => str(a.Open).toLowerCase() === "yes")
    .reduce((sum, a) => sum + (num(a.InstallmentAmount) ?? 0), 0);

  const severeAccounts = accounts.filter(isSevereAccount).length;

  return {
    hit: hitCode ? hitCode !== "00" : accounts.length > 0 || score !== null,
    score,
    existingEmi: Math.round(emiFromSummary ?? emiFromAccounts),
    defaults: Math.max(severeAccounts, num(summary.NoOfWriteOffs) ?? 0),
    bureauRef: str(header.ReportOrderNO) || str(obj(retail.InquiryResponseHeader).ReportOrderNO) || null,
  };
}

export function createEquifaxAdapter(creds: EquifaxCredentials): BureauAdapter {
  return {
    code: "EQUIFAX",
    async fetchReport(req) {
      const { endpointUrl, ...auth } = creds;
      let res: Response;
      try {
        res = await fetch(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(buildEquifaxRequest(auth, req)),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (err) {
        const timedOut = err instanceof Error && err.name === "TimeoutError";
        throw new BureauError(timedOut ? "Equifax did not respond within 30 seconds" : "Could not reach Equifax", "NETWORK");
      }
      if (!res.ok) throw new BureauError(`Equifax returned HTTP ${res.status}`, `HTTP_${res.status}`);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new BureauError("Equifax returned a response that isn't valid JSON", "BAD_RESPONSE");
      }
      return parseEquifaxResponse(body);
    },
  };
}
