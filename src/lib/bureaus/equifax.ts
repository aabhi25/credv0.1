import { BureauError, type BureauAdapter, type BureauReport, type BureauRequest, type ProbeResult } from "./types";

// Equifax India "IDCCR" consolidated credit report, REST/JSON over HTTPS.
// Spec: IDCCR Bureau System-to-System External Interface Specification, June 2025.
// Connects through Equifax's API gateway (api.sandbox / api.uat / api.equifax.co.in): a
// client-credentials token from the OAuth URL (client ID + secret via HTTP Basic) is sent as a
// Bearer token with each request. Member fields, if given, also go in the request header.

export type EquifaxCredentials = {
  endpointUrl: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  customerId?: string;
  userId?: string;
  password?: string;
  memberNumber?: string;
  securityCode?: string;
};

type HeaderCredentials = Pick<EquifaxCredentials, "customerId" | "userId" | "password" | "memberNumber" | "securityCode">;

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

/** Member fields for the request header; empty ones are left out (they're optional). */
function requestHeader(creds: HeaderCredentials, reference: string) {
  const fields = {
    CustomerId: creds.customerId,
    UserId: creds.userId,
    Password: creds.password,
    MemberNumber: creds.memberNumber,
    SecurityCode: creds.securityCode,
  };
  return {
    ...(Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) as Partial<Record<keyof typeof fields, string>>),
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

/** Equifax's gateway errors look like { efxErrorCode, description }; OAuth errors like { error, error_description }. */
export function describeHttpError(status: number, body: unknown): string {
  const b = obj(body);
  const code = str(b.efxErrorCode) || str(b.error) || str(b.errorCode);
  const msg = str(b.description) || str(b.error_description) || str(b.message);
  const detail = [code, msg].filter(Boolean).join(": ");
  return `Equifax returned HTTP ${status}${detail ? ` (${detail})` : ""}`;
}

async function send(url: string, init: RequestInit, timeoutMs: number) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (err) {
    throw new BureauError(describeNetworkError(err, hostOf(url)), "NETWORK");
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) return { description: text.slice(0, 200) };
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
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  if (creds.scope) body.set("scope", creds.scope);
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
  const key = `${creds.tokenUrl}|${creds.clientId}|${creds.scope ?? ""}`;
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
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${await getAccessToken(creds, timeoutMs, forceNewToken)}`,
    };
    return send(creds.endpointUrl, { method: "POST", headers, body: JSON.stringify(body) }, timeoutMs);
  };

  let res = await call(false);
  // A cached token can be revoked early; get a fresh one once.
  if (res.status === 401) res = await call(true);
  const json = await readJson(res);
  if (!res.ok) throw new BureauError(describeHttpError(res.status, json), `HTTP_${res.status}`);
  return json;
}

export function createEquifaxAdapter(creds: EquifaxCredentials): BureauAdapter {
  return {
    code: "EQUIFAX",
    async fetchReport(req) {
      return parseEquifaxResponse(await postReport(creds, buildEquifaxRequest(creds, req), TIMEOUT_MS));
    },
    async probe() {
      try {
        // Getting a token proves the client ID and secret without touching any report.
        await getAccessToken(creds, PROBE_TIMEOUT_MS, true);
        const result = classifyProbeResponse(await postReport(creds, buildEquifaxProbeRequest(creds), PROBE_TIMEOUT_MS));
        return { ...result, message: `Signed in to Equifax (access token received). ${result.message}` };
      } catch (err) {
        if (err instanceof BureauError) return { ok: false, code: err.code, message: err.message };
        throw err;
      }
    },
  };
}
