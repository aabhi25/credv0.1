import { BureauError, DEFAULT_EQUIFAX_SCOPE, type BureauAdapter, type BureauReport, type BureauRequest, type ProbeResult } from "./types";

// Equifax India CIR 360 credit report, REST/JSON over HTTPS.
// Spec: CIR360 Report API 1.0.0 (OpenAPI, developer.equifax.in), with field details from the
// IDCCR System-to-System Interface Specification, June 2025.
// Connects through Equifax's API gateway (api.sandbox / api.uat / api.equifax.co.in): a
// client-credentials token from the OAuth URL (client ID + secret via HTTP Basic) is sent as a
// Bearer token with each request. The member login also goes in the request header.

export type EquifaxCredentials = {
  endpointUrl: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  productVersion?: string;
  customerId?: string;
  userId?: string;
  password?: string;
  memberNumber?: string;
  securityCode?: string;
};

type HeaderCredentials = Pick<
  EquifaxCredentials,
  "customerId" | "userId" | "password" | "memberNumber" | "securityCode" | "productVersion"
>;

/** OAuth scope for the CIR 360 API, used when none is configured. */
export const DEFAULT_SCOPE = DEFAULT_EQUIFAX_SCOPE;

// Equifax's gateway gives up on its report service after about 50 s and answers 504 with a reason,
// so wait a little longer than that. Tokens come back in well under a second.
const REPORT_TIMEOUT_MS = 55_000;
const TOKEN_TIMEOUT_MS = 15_000;

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

/** First, middle and last names. The CIR 360 API requires LastName, so it's only empty for a single-word name. */
function splitName(name: string) {
  const words = cleanName(name).split(" ");
  const first = words.shift() ?? "";
  const last = words.pop() ?? "";
  return { FirstName: first.slice(0, 40), MiddleName: words.join(" ").slice(0, 40).trim(), LastName: last.slice(0, 40) };
}

/** YYYY-MM-DD: the IDCCR spec requires it (error E0059 otherwise). The CIR 360 spec only shows an example, 31-12-1994. */
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** The member login for the request header. ProductVersion is only sent if Equifax issued one. */
function requestHeader(creds: HeaderCredentials, reference: string) {
  return {
    CustomerId: creds.customerId ?? "",
    UserId: creds.userId ?? "",
    Password: creds.password ?? "",
    MemberNumber: creds.memberNumber ?? "",
    SecurityCode: creds.securityCode ?? "",
    ...(creds.productVersion && { ProductVersion: creds.productVersion }),
    CustRefField: reference.slice(0, 50),
    ProductCode: ["IDCCR"],
  };
}

export function buildEquifaxRequest(creds: HeaderCredentials, req: BureauRequest) {
  return {
    RequestHeader: requestHeader(creds, req.reference),
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
      const code = str(e.ErrorCode) || str(e.efxErrorCode);
      const msg = str(e.ErrorMsg) || str(e.Details) || str(e.description);
      if (code || msg) return { code, msg };
    }
  }
  return null;
}

/**
 * A consolidated reply can hold a retail and a microfinance report (product codes ICCRR and ICCRM).
 * CredCap assesses retail credit only, so it never reads microfinance data.
 */
function isMicrofinance(report: Json) {
  const codes = [obj(report.InquiryResponseHeader).ProductCode].flat().map(str);
  const data = obj(report.CIRReportData);
  return (
    codes.includes("ICCRM") ||
    Object.keys(data).some((k) => k.startsWith("Microfinance")) ||
    arr(data.ScoreDetails).some((s) => ["MRS", "MCS"].includes(str(s.Type)))
  );
}

function reports(root: Json) {
  return arr(obj(root.CCRResponse).CIRReportDataLst);
}

function retailReport(root: Json): Json | null {
  const isRetail = (r: Json) => {
    const data = obj(r.CIRReportData);
    return data.RetailAccountsSummary || data.RetailAccountDetails || arr(data.ScoreDetails).some((s) => str(s.Type) === "ERS");
  };
  const all = reports(root);
  return all.find(isRetail) ?? all.find((r) => !isMicrofinance(r)) ?? null;
}

function responseError(root: Json) {
  const retail = retailReport(root);
  return firstError(
    root.efxErrorCode || root.ErrorCode ? root : null,
    root.Error,
    obj(root.ReportData).Error,
    obj(root.CCRResponse).Error,
    // An error in the microfinance report doesn't matter when there is a retail one.
    ...(retail ? [retail] : reports(root)).map((r) => r.Error),
  );
}

// "Consumer record not found": no credit file, not a failure.
const NO_RECORD = "E0011";

/** Equifax refuses the report when a phone, ID or name differs from its records. */
function isMismatch(error: { code: string; msg: string }) {
  return /does not match|unable to verify input pii/i.test(error.msg);
}

/** Equifax can append the consumer's masked phones and emails after "~"; never keep those. */
function errorDetail(error: { code: string; msg: string }) {
  return [error.code, safeText(error.msg)].filter(Boolean).join(": ");
}

/** The title and visible text of a web page, e.g. a firewall's block page. Null if it isn't one. */
function pageText(text: string): string | null {
  if (!/<(!doctype\s+html|html|head|body)[\s>]/i.test(text)) return null;
  const clean = (html: string) =>
    html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#0?39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim();
  const title = clean(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const visible = clean(
    text.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(head|script|style|noscript|svg)\b[\s\S]*?(<\/\1>|$)/gi, " "),
  );
  const parts = [title, visible.startsWith(title) ? visible.slice(title.length).trim() : visible].filter(Boolean);
  return parts.length ? `web page: ${parts.join(" - ")}` : "web page with no text";
}

/** Error text without anything that could identify an applicant. */
function safeText(text: string) {
  const page = pageText(text);
  // A block page's reference number is what Equifax needs to trace it.
  const refs = page ? [...page.matchAll(/\b(?:support|reference|incident|request|event|trace)\s*(?:id|no\.?|number|#)?\s*(?:is)?\s*[:#]?\s*([\w.-]*\d[\w.-]{5,60})/gi)].map((m) => m[1]) : [];
  const masked = maskPersonal(page ?? text, page ? 400 : 200);
  return refs.length ? `${masked} (reference ${[...new Set(refs)].slice(0, 2).join(", ")})` : masked;
}

function maskPersonal(text: string, max: number) {
  return text
    .split("~")[0]
    .replace(/\S+@\S+/g, "…")
    .replace(/\b[A-Za-z]{5}\d{4}[A-Za-z]\b/g, "…")
    .replace(/(?<![A-Za-z])\d[\d\s-]{4,}\d/g, "…")
    .trim()
    .slice(0, max);
}

/** Equifax's documentation sample fills every field with the word "string". */
function isPlaceholder(root: Json) {
  return Object.values(obj(root.InquiryResponseHeader)).some((v) => v === "string");
}

const PLACEHOLDER_MESSAGE =
  "Equifax replied with its documentation sample (placeholder values), not a credit report.";

/** What a reply contains, for diagnosing: field names and status codes only, never applicant values. */
function describeLayout(body: unknown): string {
  const root = obj(body);
  const keys = (v: unknown) =>
    Object.keys(obj(v)).filter((k) => /^[A-Za-z]\w{0,39}$/.test(k)).slice(0, 20).join(", ") || "nothing";
  const header = obj(root.InquiryResponseHeader);
  const parts = [`fields: ${keys(root)}`];
  for (const k of ["ReportData", "CCRResponse"]) if (k in root) parts.push(`${k}: ${keys(root[k])}`);
  const codes = { SuccessCode: header.SuccessCode, HitCode: header.HitCode, status: root.status };
  for (const [k, v] of Object.entries(codes)) if (/^\w{1,15}$/.test(str(v))) parts.push(`${k} ${str(v)}`);
  return parts.join("; ");
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

type ReportParts = { data: Json; header: Json; summary: Json; accounts: Json[]; emi: number | null; writeOffs: number | null };

/** CIR 360 API shape: a single ReportData object next to InquiryResponseHeader. */
function cir360Parts(root: Json): ReportParts | null {
  if (!root.ReportData) return null;
  const data = obj(root.ReportData);
  const retail = obj(obj(obj(data.AccountsSummary).ConsolidateCreditSummary).Retail);
  return {
    data,
    header: obj(root.InquiryResponseHeader),
    summary: retail,
    accounts: arr(obj(data.Accounts).Retails),
    emi: num(retail.InstallmentAmount),
    writeOffs: num(retail.NoOfWriteOffs),
  };
}

/** IDCCR shape: CCRResponse.CIRReportDataLst, one entry per report type; we want the retail one. */
function idccrParts(root: Json): ReportParts | null {
  const retail = retailReport(root);
  if (!retail) return null;
  const data = obj(retail.CIRReportData);
  const summary = obj(data.RetailAccountsSummary);
  return {
    data,
    header: obj(retail.InquiryResponseHeader),
    summary,
    accounts: arr(data.RetailAccountDetails),
    emi: num(summary.TotalMonthlyPaymentAmount),
    writeOffs: num(summary.NoOfWriteOffs),
  };
}

export function parseEquifaxResponse(body: unknown): BureauReport {
  const root = obj(body);
  const header = obj(root.InquiryResponseHeader);
  const ccr = obj(root.CCRResponse);

  const noFile = { hit: false, score: null, existingEmi: 0, defaults: 0, bureauRef: str(header.ReportOrderNO) || null };
  const error = responseError(root);
  if (error?.code === NO_RECORD) return noFile;
  if (error && isMismatch(error)) {
    throw new BureauError("The applicant's details don't match Equifax's records", "IDENTITY_MISMATCH");
  }
  if (error || str(header.SuccessCode) === "0" || str(ccr.Status) === "0") {
    throw new BureauError(`Equifax error ${error ? errorDetail(error) : "UNKNOWN"}`, error?.code || "UNKNOWN");
  }

  if (isPlaceholder(root)) throw new BureauError(PLACEHOLDER_MESSAGE, "PLACEHOLDER");
  const parts = cir360Parts(root) ?? idccrParts(root);
  // Only a microfinance report: there's no retail credit to assess.
  if (!parts && reports(root).some(isMicrofinance)) return noFile;
  if (!parts) throw new BureauError(`Equifax's reply had no credit report (${describeLayout(root)})`, "NO_REPORT");
  const hitCode = str(parts.header.HitCode) || str(header.HitCode);

  const scoreEntry = arr(parts.data.ScoreDetails).find((s) => str(s.Type) === "ERS");
  const rawScore = num(scoreEntry?.Value);
  const score = rawScore !== null && rawScore >= 300 && rawScore <= 900 ? rawScore : null;

  const emiFromAccounts = parts.accounts
    .filter((a) => str(a.Open).toLowerCase() === "yes")
    .reduce((sum, a) => sum + (num(a.InstallmentAmount) ?? 0), 0);

  const severeAccounts = parts.accounts.filter(isSevereAccount).length;

  return {
    // HitCode 00 = no credit file; "0" too, since the CIR 360 API sends it as a number.
    hit: hitCode ? !/^0+$/.test(hitCode) : parts.accounts.length > 0 || score !== null,
    score,
    existingEmi: Math.round(parts.emi ?? emiFromAccounts),
    defaults: Math.max(severeAccounts, parts.writeOffs ?? 0),
    bureauRef: str(header.ReportOrderNO) || str(parts.header.ReportOrderNO) || null,
  };
}

// Login / account problems (spec error list).
const AUTH_ERRORS = new Set([
  "E0001", "E0002", "E0005", "E0007", "E0008", "E0010", "E0013", "E0019", "E0020", "E0021", "E0022", "E0023",
  "E0024", "E0025", "E0026", "E0027", "E0028", "E0034", "E0074", "E0075", "E0076", "E0077", "E0088", "E0089",
  "E0090", "E0103", "E0104", "E0526", "E0951", "GSWDOE101", "GSWDOE102", "GSWDOE103", "GSWDOE104", "GSWDOE5304",
]);
const UNAVAILABLE_ERRORS = new Set(["E0029", "E0030", "E0046", "E0601", "E0602", "E0603", "E0604", "GSWDOE999"]);
// Missing applicant details: what a blank enquiry should be refused for once the login is accepted.
const BLANK_ENQUIRY_ERRORS = new Set([
  "E0032", "E0043", "E0044", "E0047", "E0048", "E0050", "E0051", "E0056", "E0057", "E0059", "E0068", "E0081", "E0086",
  "E0095", "E0098", "E0101", "E0102", "E0431", "E0511", "E0701", "E0707", "E0708", "E0773", "E0800", "E0826", "E0841",
  "E0909", "E0989", "E9867", "GSWDOE107", "GSWDOE108", "GSWDOE115",
]);

/** A deliberately blank enquiry: Equifax can check the login but has nothing to pull a report for. */
export function buildEquifaxProbeRequest(creds: HeaderCredentials) {
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
  const error = responseError(root);
  if (!error) {
    if (isPlaceholder(root)) {
      return {
        ok: true,
        code: "PLACEHOLDER",
        message: `${PLACEHOLDER_MESSAGE} The connection works, but this doesn't check the member login or reports.`,
      };
    }
    const failed = [obj(root.InquiryResponseHeader).SuccessCode, obj(root.CCRResponse).Status].some((v) => str(v) === "0");
    if (failed || !(cir360Parts(root) ?? idccrParts(root))) {
      return {
        ok: false,
        code: "NO_REPORT",
        message: `Equifax replied, but not with a report or an error CredCap recognises (${describeLayout(root)}).`,
      };
    }
    return { ok: true, message: "Connected, and Equifax returned a report." };
  }
  const detail = errorDetail(error);
  if (error.code === "E0008") {
    return { ok: false, code: error.code, message: `Equifax rejected this server's IP address (${detail}). Ask Equifax to allow-list it.` };
  }
  if (AUTH_ERRORS.has(error.code)) return { ok: false, code: error.code, message: `Equifax rejected the login (${detail}).` };
  if (UNAVAILABLE_ERRORS.has(error.code)) {
    return { ok: false, code: error.code, message: `Equifax is temporarily unavailable (${detail}). Try again later.` };
  }
  if (!BLANK_ENQUIRY_ERRORS.has(error.code)) {
    return { ok: false, code: error.code, message: `Equifax replied with an error (${detail}), so the login isn't confirmed.` };
  }
  return {
    ok: true,
    code: error.code,
    message: `Connected. Equifax didn't reject the login; it refused the blank test enquiry (${detail}), as expected. No credit report was pulled. Run a test enquiry to fully confirm.`,
  };
}

/**
 * The gateway checks the request against its schema before Equifax does, so it may reject the
 * blank test enquiry with HTTP 400. That still proves the token was accepted for this API.
 */
export function classifyGatewayError(err: BureauError): ProbeResult | null {
  if (err.code === "HTTP_400") {
    return {
      ok: true,
      code: err.code,
      message: `Connected. The API accepted the token and refused the blank test enquiry (${err.message}). This doesn't check the member login. No credit report was pulled. Run a test enquiry to fully confirm.`,
    };
  }
  if (err.code === "HTTP_401" || err.code === "HTTP_403") {
    return {
      ok: false,
      code: err.code,
      message: `The token was refused for the CIR 360 API (${err.message}). Check the app in Equifax's developer portal includes the CIR Client Gateway product.`,
    };
  }
  return null;
}

/** Turns a failed fetch into an explanation an admin can act on. */
function isTimeout(err: unknown) {
  const code = (err as { cause?: { code?: string } } | null)?.cause?.code ?? "";
  const name = err instanceof Error ? err.name : "";
  return name === "TimeoutError" || ["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT", "UND_ERR_HEADERS_TIMEOUT"].includes(code);
}

export function describeNetworkError(err: unknown, host: string): string {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  const code = cause?.code ?? "";
  if (isTimeout(err)) {
    return `${host} didn't answer in time. Check the address, or ask Equifax whether access is restricted by IP address.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `${host} couldn't be found. Check the API address.`;
  if (code === "ECONNREFUSED") return `${host} refused the connection. Check the API address and port.`;
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") {
    return `${host} closed the connection. Equifax may be blocking this server's IP address.`;
  }
  if (/CERT|SSL|TLS|SELF_SIGNED/i.test(code)) return `Secure connection to ${host} failed (${code}).`;
  return `Couldn't connect to ${host}${code ? ` (${code})` : ""}.`;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Equifax's own ID for a request, which its engineers can look up. */
function traceNote(res: Response) {
  const id = res.headers.get("efx-transaction-id") ?? "";
  return /^[\w-]{8,64}$/.test(id) ? ` Equifax transaction ${id}.` : "";
}

function gatewayDetail(body: unknown) {
  const b = obj(body);
  const detail = [str(b.efxErrorCode), safeText(str(b.description))].filter(Boolean).join(": ");
  return detail ? `, ${detail}` : "";
}

/** additionalErrorDetails isn't in Equifax's spec: it may be an object, a list, or either as JSON text. */
function additionalDetails(body: unknown): unknown {
  const raw = obj(body).additionalErrorDetails;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const ERROR_KEY = /code|msg|message|desc|detail|reason|error|title|status|field/i;
// Parts that echo what was sent, or the consumer's own details.
const PERSONAL_KEY = /request|applicant|customer|consumer|address|phone|mobile|email|name|dob|birth|^pan|idvalue|iddetails|password|security/i;

/** Error codes and messages inside additionalErrorDetails, skipping anything personal. */
function collectDetails(value: unknown, key = "detail", depth = 0): string[] {
  if (value === null || value === undefined || depth > 5 || PERSONAL_KEY.test(key)) return [];
  if (Array.isArray(value)) return value.slice(0, 10).flatMap((v) => collectDetails(v, key, depth + 1));
  if (typeof value === "object") return Object.entries(value).flatMap(([k, v]) => collectDetails(v, k, depth + 1));
  const text = ERROR_KEY.test(key) ? safeText(str(value)) : "";
  return text ? [text] : [];
}

/** The bureau's own error (e.g. E0048), when the gateway wraps it in additionalErrorDetails. */
function bureauError(value: unknown, depth = 0): { code: string; msg: string } | null {
  if (!value || typeof value !== "object" || depth > 5) return null;
  if (!Array.isArray(value)) {
    const o = obj(value);
    const code = [o.ErrorCode, o.errorCode, o.code, o.Code].map(str).find((c) => /^(E\d{4}|GSWDOE\d+|EX\d{2})$/.test(c));
    if (code) return { code, msg: [o.ErrorMsg, o.errorMsg, o.errorMessage, o.message, o.description, o.Details].map(str).find(Boolean) ?? "" };
  }
  for (const v of Object.values(value)) {
    const found = bureauError(v, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Rewrites a wrapped bureau error as the error reply the parser already understands. */
export function unwrapBureauError(body: unknown): unknown | null {
  const error = bureauError(additionalDetails(body));
  return error && { InquiryResponseHeader: { SuccessCode: "0" }, Error: [{ ErrorCode: error.code, ErrorMsg: error.msg }] };
}

/** Equifax's gateway errors look like { efxErrorCode, description }; OAuth errors like { error, error_description }. */
export function describeHttpError(status: number, body: unknown): string {
  const b = obj(body);
  const code = str(b.efxErrorCode) || str(b.error) || str(b.errorCode);
  const msg = str(b.description) || str(b.error_description) || str(b.message);
  const details = additionalDetails(body);
  const more = [...new Set(collectDetails(details))].slice(0, 6).join(", ");
  // Nothing readable: say which fields came back, so it can still be diagnosed.
  const fields = Object.keys(obj(details)).filter((k) => /^[A-Za-z]\w{0,39}$/.test(k)).slice(0, 10).join(", ");
  const extra = more || (fields && `fields: ${fields}`);
  const detail = [code, safeText(msg), extra].filter(Boolean).join(": ");
  return `Equifax returned HTTP ${status}${detail ? ` (${detail})` : ""}`;
}

async function send(url: string, init: RequestInit, timeoutMs: number) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (err) {
    throw new BureauError(describeNetworkError(err, hostOf(url)), isTimeout(err) ? "TIMEOUT" : "NETWORK");
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) return { description: text };
    throw new BureauError("Equifax returned a response that isn't valid JSON", "BAD_RESPONSE");
  }
}

// --- OAuth (API gateway) -------------------------------------------------------------------------

type CachedToken = { token: string; expiresAt: number };
// One cache per server process: Next.js can load this module more than once (per route bundle).
const globalForTokens = globalThis as unknown as { equifaxTokens?: Map<string, CachedToken> };
const tokenCache = (globalForTokens.equifaxTokens ??= new Map<string, CachedToken>());

/** Basic-auth header for the client-credentials grant, as Equifax's token endpoint expects. */
export function buildTokenRequest(creds: Pick<EquifaxCredentials, "clientId" | "clientSecret" | "scope">) {
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: creds.scope || DEFAULT_SCOPE });
  return {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.clientId ?? ""}:${creds.clientSecret ?? ""}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  } satisfies RequestInit;
}

async function getAccessToken(creds: EquifaxCredentials, timeoutMs: number, forceNew = false): Promise<string> {
  if (!creds.tokenUrl || !creds.clientId || !creds.clientSecret) {
    throw new BureauError(
      "These Equifax credentials are missing the OAuth URL, client ID or client secret. Update them on the superadmin organization page.",
      "OAUTH_CONFIG",
    );
  }
  const key = `${creds.tokenUrl}|${creds.clientId}|${creds.scope || DEFAULT_SCOPE}`;
  const cached = tokenCache.get(key);
  if (!forceNew && cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await send(creds.tokenUrl, buildTokenRequest(creds), timeoutMs);
  const body = obj(await readJson(res));
  if (!res.ok) {
    const code = str(body.error);
    if (res.status === 401 || code === "invalid_client") {
      throw new BureauError(`Equifax rejected the client ID or secret (${describeHttpError(res.status, body)})`, "OAUTH_INVALID_CLIENT");
    }
    throw new BureauError(`Couldn't get an Equifax access token: ${describeHttpError(res.status, body)}`, "OAUTH_FAILED");
  }
  const token = str(body.access_token);
  if (!token) throw new BureauError("Equifax's token response had no access_token", "OAUTH_FAILED");
  // Refresh a minute early; default to 5 minutes if Equifax doesn't say.
  const ttl = (num(body.expires_in) ?? 300) * 1000;
  tokenCache.set(key, { token, expiresAt: Date.now() + Math.max(ttl - 60_000, 30_000) });
  return token;
}

/** Posts a JSON request to the report API with a Bearer token. */
async function postReport(creds: EquifaxCredentials, body: unknown, timeoutMs: number): Promise<unknown> {
  const call = async (forceNewToken: boolean) => {
    const token = await getAccessToken(creds, TOKEN_TIMEOUT_MS, forceNewToken);
    const headers = { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` };
    try {
      return await send(creds.endpointUrl, { method: "POST", headers, body: JSON.stringify(body) }, timeoutMs);
    } catch (err) {
      // We have a token, so the gateway is reachable: a timeout here is Equifax's report service.
      if (err instanceof BureauError && err.code === "TIMEOUT") {
        throw new BureauError(
          `Signed in to Equifax, but its report service didn't respond within ${timeoutMs / 1000} seconds. Ask Equifax to check the report service for your app.`,
          "TIMEOUT",
        );
      }
      throw err;
    }
  };

  let res = await call(false);
  // A cached token can be revoked early; get a fresh one once.
  if (res.status === 401) res = await call(true);
  const json = await readJson(res);
  if (res.status === 504 || res.status === 503) {
    throw new BureauError(
      `Signed in to Equifax, but its report service didn't respond (HTTP ${res.status}${gatewayDetail(json)}). Ask Equifax to check the report service for your app, and whether this server's IP address needs allow-listing.${traceNote(res)}`,
      `HTTP_${res.status}`,
    );
  }
  if (!res.ok) {
    const wrapped = res.status === 401 || res.status === 403 ? null : unwrapBureauError(json);
    if (wrapped) return wrapped;
    throw new BureauError(`${describeHttpError(res.status, json)}${traceNote(res) && `.${traceNote(res)}`}`, `HTTP_${res.status}`);
  }
  return json;
}

async function checkConnection(creds: EquifaxCredentials): Promise<ProbeResult> {
  try {
    // Getting a token proves the client ID and secret without touching any report.
    await getAccessToken(creds, TOKEN_TIMEOUT_MS, true);
    const signedIn = "Signed in to Equifax (access token received).";
    try {
      const result = classifyProbeResponse(await postReport(creds, buildEquifaxProbeRequest(creds), REPORT_TIMEOUT_MS));
      return { ...result, message: `${signedIn} ${result.message}` };
    } catch (err) {
      const probe = err instanceof BureauError ? classifyGatewayError(err) : null;
      if (probe) return { ...probe, message: `${signedIn} ${probe.message}` };
      throw err;
    }
  } catch (err) {
    if (err instanceof BureauError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}

/** Server log line for a failed call. Messages here are already free of applicant details. */
function logFailure(call: string, creds: EquifaxCredentials, code: string | undefined, message: string) {
  console.warn(`[equifax] ${call} failed at ${hostOf(creds.endpointUrl)}: ${code ?? "UNKNOWN"}: ${message}`);
}

export function createEquifaxAdapter(creds: EquifaxCredentials): BureauAdapter {
  return {
    code: "EQUIFAX",
    async fetchReport(req) {
      try {
        return parseEquifaxResponse(await postReport(creds, buildEquifaxRequest(creds, req), REPORT_TIMEOUT_MS));
      } catch (err) {
        if (err instanceof BureauError) logFailure("report", creds, err.code, err.message);
        throw err;
      }
    },
    async probe() {
      const result = await checkConnection(creds);
      if (!result.ok) logFailure("quick check", creds, result.code, result.message);
      return result;
    },
  };
}
