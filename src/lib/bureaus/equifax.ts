import { BureauError, type BureauAdapter, type BureauReport, type BureauRequest, type ProbeResult } from "./types";

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
const PROBE_TIMEOUT_MS = 15_000;

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

// Login / account problems (spec error list). Anything else on a blank enquiry means the login got through.
const AUTH_ERRORS = new Set([
  "E0001", "E0002", "E0005", "E0007", "E0008", "E0010", "E0013", "E0019", "E0021", "E0022", "E0023",
  "E0024", "E0025", "E0026", "E0027", "E0028", "E0074", "E0075", "E0076",
]);
const UNAVAILABLE_ERRORS = new Set(["E0029", "E0030", "E0046"]);

/** A deliberately blank enquiry: Equifax can check the login but has nothing to pull a report for. */
export function buildEquifaxProbeRequest(creds: Omit<EquifaxCredentials, "endpointUrl">) {
  const full = buildEquifaxRequest(creds, {
    name: "",
    pan: "",
    mobile: "",
    dob: new Date(0),
    address: "",
    state: "",
    pincode: "",
    inquiryPurpose: "05",
    reference: "credcap-connection-test",
  });
  return { RequestHeader: full.RequestHeader, RequestBody: { InquiryPurpose: "05" }, Score: full.Score };
}

export function classifyProbeResponse(body: unknown): ProbeResult {
  const root = obj(body);
  const ccr = obj(root.CCRResponse);
  const error = firstError(root.Error, ccr.Error, ...arr(ccr.CIRReportDataLst).map((r) => r.Error));
  if (!error) return { ok: true, message: "Connected, and Equifax accepted the request." };
  const detail = `${error.code}${error.msg ? `: ${error.msg}` : ""}`;
  if (error.code === "E0008") {
    return { ok: false, code: error.code, message: `Equifax rejected this server's IP address (${detail}). Ask Equifax to allow-list it.` };
  }
  if (AUTH_ERRORS.has(error.code)) return { ok: false, code: error.code, message: `Equifax rejected the login (${detail}).` };
  if (UNAVAILABLE_ERRORS.has(error.code)) {
    return { ok: false, code: error.code, message: `Equifax is temporarily unavailable (${detail}). Try again later.` };
  }
  return {
    ok: true,
    code: error.code,
    message: `Connected. Equifax didn't reject the login; it refused the blank test enquiry (${detail}), as expected. No credit report was pulled. Run a test enquiry to fully confirm.`,
  };
}

/** Turns a failed fetch into an explanation an admin can act on. */
export function describeNetworkError(err: unknown, host: string): string {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  const code = cause?.code ?? "";
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || ["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT", "UND_ERR_HEADERS_TIMEOUT"].includes(code)) {
    return `${host} didn't answer. This usually means Equifax hasn't allow-listed this server's IP address yet.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `${host} couldn't be found. Check the API address.`;
  if (code === "ECONNREFUSED") return `${host} refused the connection. Check the API address and port.`;
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") {
    return `${host} closed the connection. Equifax may be blocking this server's IP address.`;
  }
  if (/CERT|SSL|TLS|SELF_SIGNED/i.test(code)) return `Secure connection to ${host} failed (${code}).`;
  return `Couldn't connect to ${host}${code ? ` (${code})` : ""}.`;
}

async function post(endpointUrl: string, body: unknown, timeoutMs: number) {
  const host = (() => {
    try {
      return new URL(endpointUrl).host;
    } catch {
      return endpointUrl;
    }
  })();
  let res: Response;
  try {
    res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    throw new BureauError(describeNetworkError(err, host), "NETWORK");
  }
  if (!res.ok) throw new BureauError(`Equifax returned HTTP ${res.status}`, `HTTP_${res.status}`);
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new BureauError("Equifax returned a response that isn't valid JSON", "BAD_RESPONSE");
  }
}

export function createEquifaxAdapter(creds: EquifaxCredentials): BureauAdapter {
  const { endpointUrl, ...auth } = creds;
  return {
    code: "EQUIFAX",
    async fetchReport(req) {
      return parseEquifaxResponse(await post(endpointUrl, buildEquifaxRequest(auth, req), TIMEOUT_MS));
    },
    async probe() {
      try {
        return classifyProbeResponse(await post(endpointUrl, buildEquifaxProbeRequest(auth), PROBE_TIMEOUT_MS));
      } catch (err) {
        if (err instanceof BureauError) return { ok: false, code: err.code, message: err.message };
        throw err;
      }
    },
  };
}
