import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEquifaxProbeRequest,
  buildEquifaxRequest,
  buildTokenRequest,
  classifyGatewayError,
  classifyProbeResponse,
  DEFAULT_SCOPE,
  describeHttpError,
  describeNetworkError,
  parseEquifaxResponse,
} from "./equifax";
import { BureauError, type BureauRequest } from "./types";

// Fixtures are synthetic but follow the structure of Equifax's IDCCR sample response and the
// CIR 360 Report API spec.

const creds = { customerId: "1", userId: "user", password: "secret", memberNumber: "MEMBER0001", securityCode: "ABC" };

const request: BureauRequest = {
  name: "Asha Verma",
  pan: "ABCDE1234F",
  mobile: "9876543210",
  dob: new Date(Date.UTC(1990, 4, 14)),
  address: "12  MG Road,   Indiranagar Bengaluru",
  state: "KA",
  pincode: "560038",
  inquiryPurpose: "05",
  reference: "chk_123",
};

function report(data: Record<string, unknown>, hitCode = "10") {
  return {
    InquiryResponseHeader: { ClientID: "MEMBER0001", ReportOrderNO: "99887766", SuccessCode: "1" },
    CCRResponse: {
      Status: "1",
      CIRReportDataLst: [{ InquiryResponseHeader: { HitCode: hitCode, SuccessCode: "1" }, CIRReportData: data }],
    },
  };
}

const month = (key: string, status: string) => ({ key, PaymentStatus: status, SuitFiledStatus: "*", AssetClassificationStatus: "*" });

describe("buildEquifaxRequest", () => {
  it("maps applicant details to the IDCCR request", () => {
    const body = buildEquifaxRequest(creds, request);
    assert.equal(body.RequestHeader.MemberNumber, "MEMBER0001");
    assert.deepEqual(body.RequestHeader.ProductCode, ["IDCCR"]);
    assert.equal(body.RequestBody.InquiryPurpose, "05");
    assert.equal(body.RequestBody.FirstName, "Asha");
    assert.equal(body.RequestBody.LastName, "Verma");
    assert.equal(body.RequestBody.DOB, "1990-05-14");
    assert.deepEqual(body.RequestBody.InquiryAddresses[0], {
      seq: "1",
      AddressType: ["H"],
      AddressLine1: "12 MG Road, Indiranagar Bengaluru",
      State: "KA",
      Postal: "560038",
    });
    assert.deepEqual(body.RequestBody.IDDetails, [{ seq: "1", IDType: "T", IDValue: "ABCDE1234F", Source: "Inquiry" }]);
    assert.equal(body.RequestBody.InquiryPhones[0].Number, "9876543210");
    assert.deepEqual(body.RequestBody.CustomFields, [{ key: "EmbeddedPdf", value: "N" }]);
    assert.deepEqual(body.Score, [{ Type: "ERS", Version: "4.0" }]);
  });

  it("strips characters Equifax rejects and splits names", () => {
    const body = buildEquifaxRequest(creds, { ...request, name: "Venkata Subramanya Lakshmi Narasimha Rao Chowdary (Jr)" });
    assert.equal(body.RequestBody.FirstName, "Venkata");
    assert.ok(body.RequestBody.MiddleName.length <= 40);
    assert.equal(buildEquifaxRequest(creds, { ...request, name: "Asha" }).RequestBody.LastName, "");
    assert.ok(body.RequestBody.LastName.length <= 40);
    assert.match(body.RequestBody.LastName, /^[a-zA-Z '\-./]+$/);
  });
});

describe("parseEquifaxResponse", () => {
  it("reads score, EMIs and reference from a clean report", () => {
    const result = parseEquifaxResponse(
      report({
        RetailAccountDetails: [
          { Open: "Yes", InstallmentAmount: "6742", AccountStatus: "Standard", History48Months: [month("01-18", "000"), month("12-17", "STD")] },
        ],
        RetailAccountsSummary: { NoOfWriteOffs: "0", TotalMonthlyPaymentAmount: "6742.00" },
        ScoreDetails: [{ Type: "ERS", Version: "4.0", Value: "703" }],
      }),
    );
    assert.deepEqual(result, { hit: true, score: 703, existingEmi: 6742, defaults: 0, bureauRef: "99887766" });
  });

  it("counts each account with serious delinquency once", () => {
    const result = parseEquifaxResponse(
      report({
        RetailAccountDetails: [
          { Open: "Yes", History48Months: [month("03-24", "30+"), month("02-24", "90+"), month("01-24", "120+")] },
          { Open: "No", AccountStatus: "Written-off", WriteOffAmount: "15000" },
          { Open: "Yes", History48Months: [month("03-24", "01+"), month("02-24", "60+")] },
          { Open: "No", History48Months: [month("05-23", "SET")] },
        ],
        RetailAccountsSummary: { NoOfWriteOffs: "1", TotalMonthlyPaymentAmount: "12000" },
        ScoreDetails: [{ Type: "ERS", Value: "612" }],
      }),
    );
    assert.equal(result.defaults, 3);
    assert.equal(result.score, 612);
  });

  it("falls back to summing open accounts' instalments when the summary has no EMI total", () => {
    const result = parseEquifaxResponse(
      report({
        RetailAccountDetails: [
          { Open: "Yes", InstallmentAmount: "4,000" },
          { Open: "Yes", InstallmentAmount: "2500" },
          { Open: "No", InstallmentAmount: "9999" },
        ],
        RetailAccountsSummary: {},
        ScoreDetails: [{ Type: "ERS", Value: "740" }],
      }),
    );
    assert.equal(result.existingEmi, 6500);
  });

  it("reports no hit when Equifax has no credit file", () => {
    const result = parseEquifaxResponse(report({ ScoreDetails: [{ Type: "ERS", Value: "-1" }] }, "00"));
    assert.equal(result.hit, false);
    assert.equal(result.score, null);
  });

  describe("with a microfinance report", () => {
    const retail = {
      InquiryResponseHeader: { ProductCode: ["ICCRR"], HitCode: "10" },
      CIRReportData: {
        RetailAccountsSummary: { NoOfWriteOffs: "0", TotalMonthlyPaymentAmount: "5000" },
        ScoreDetails: [{ Type: "ERS", Value: "710" }],
      },
    };
    const micro = {
      InquiryResponseHeader: { ProductCode: ["ICCRM"], HitCode: "10" },
      CIRReportData: {
        MicrofinanceAccountsSummary: { TotalMonthlyPaymentAmount: "2150" },
        ScoreDetails: [{ Type: "MRS", Value: "535" }],
      },
    };
    const reply = (...list: unknown[]) => ({
      InquiryResponseHeader: { ReportOrderNO: "1", SuccessCode: "1" },
      CCRResponse: { Status: "1", CIRReportDataLst: list },
    });

    it("reads only the retail report, whichever comes first", () => {
      const expected = { hit: true, score: 710, existingEmi: 5000, defaults: 0, bureauRef: "1" };
      assert.deepEqual(parseEquifaxResponse(reply(retail, micro)), expected);
      assert.deepEqual(parseEquifaxResponse(reply(micro, retail)), expected);
    });

    it("never uses the microfinance score", () => {
      assert.deepEqual(parseEquifaxResponse(reply(micro)), { hit: false, score: null, existingEmi: 0, defaults: 0, bureauRef: "1" });
      const noScore = { ...retail, CIRReportData: { ...retail.CIRReportData, ScoreDetails: [{ Type: "MRS", Value: "535" }] } };
      assert.equal(parseEquifaxResponse(reply(noScore)).score, null);
    });

    it("ignores an error in the microfinance report when there is a retail one", () => {
      const failed = { InquiryResponseHeader: { ProductCode: ["ICCRM"] }, Error: [{ ErrorCode: "E0708", ErrorMsg: "Family Details are mandatory" }] };
      assert.equal(parseEquifaxResponse(reply(failed, retail)).score, 710);
      assert.throws(() => parseEquifaxResponse(reply(failed)), /E0708/);
    });
  });

  it("treats a missing consumer record as no credit file", () => {
    const body = { InquiryResponseHeader: { SuccessCode: "0" }, Error: [{ ErrorCode: "E0011", ErrorMsg: "Consumer record not found" }] };
    assert.equal(parseEquifaxResponse(body).hit, false);
  });

  it("reports identity mismatches without keeping the bureau's contact details", () => {
    const error = (ErrorCode: string, ErrorMsg: string) => ({ InquiryResponseHeader: { SuccessCode: "0" }, Error: [{ ErrorCode, ErrorMsg }] });
    assert.throws(
      () => parseEquifaxResponse(error("GSWDOE116", "Inquiry parameters:Phone does not match with credit file~Phones:|XXXXX23107")),
      (err: unknown) => err instanceof BureauError && err.code === "IDENTITY_MISMATCH" && !/23107/.test(err.message),
    );
    assert.throws(
      () => parseEquifaxResponse(error("E9999", "Failed~Emails:|XX@EXAMPLE.COM")),
      (err: unknown) => err instanceof BureauError && !/EXAMPLE/.test(err.message),
    );
  });

  it("throws a BureauError carrying Equifax's error code", () => {
    assert.throws(
      () =>
        parseEquifaxResponse({
          InquiryResponseHeader: { SuccessCode: "0" },
          Error: [{ ErrorCode: "E0005", ErrorMsg: "Incorrect user or password." }],
        }),
      (err: unknown) => err instanceof BureauError && err.code === "E0005" && /Incorrect user or password/.test(err.message),
    );
  });
});

describe("connection test", () => {
  const fail = (code: string, msg: string) => ({ InquiryResponseHeader: { SuccessCode: "0" }, Error: [{ ErrorCode: code, ErrorMsg: msg }] });

  it("sends credentials but no applicant details", () => {
    const body = buildEquifaxProbeRequest(creds);
    assert.equal(body.RequestHeader.UserId, "user");
    assert.deepEqual(body.RequestBody, { InquiryPurpose: "05" });
  });

  it("reports rejected logins as failures", () => {
    const result = classifyProbeResponse(fail("E0005", "Incorrect user or password."));
    assert.equal(result.ok, false);
    assert.match(result.message, /rejected the login/);
  });

  it("explains an IP rejection", () => {
    const result = classifyProbeResponse(fail("E0008", "The IP is not valid for WS Inquiry."));
    assert.equal(result.ok, false);
    assert.match(result.message, /allow-list/);
  });

  it("treats a refused blank enquiry as a successful connection", () => {
    const result = classifyProbeResponse(fail("E0048", "Address information not present."));
    assert.equal(result.ok, true);
    assert.equal(result.code, "E0048");
  });

  it("fails on login, service and unknown errors", () => {
    for (const code of ["E0020", "E0077", "E0088", "E0090", "E0103", "E0104", "GSWDOE101", "GSWDOE102", "GSWDOE999", "E0401", "EX99", "E7777"]) {
      assert.equal(classifyProbeResponse(fail(code, "x")).ok, false, code);
    }
  });

  it("says so when Equifax sends its documentation sample", () => {
    const sample = { InquiryResponseHeader: { ClientID: "string", SuccessCode: "string" }, InquiryRequestInfo: { FirstName: "string" } };
    assert.match(classifyProbeResponse(sample).message, /documentation sample/);
    assert.throws(() => parseEquifaxResponse(sample), (err: unknown) => err instanceof BureauError && err.code === "PLACEHOLDER");
  });

  it("doesn't pass a reply it can't recognise", () => {
    for (const body of [{}, { status: "FAILED", message: "x" }, { InquiryResponseHeader: { SuccessCode: 0 } }]) {
      assert.equal(classifyProbeResponse(body).ok, false);
    }
    assert.equal(classifyProbeResponse({ efxErrorCode: "400.01", description: "Invalid" }).code, "400.01");
  });

  it("describes an unrecognised reply without applicant values", () => {
    const body = {
      InquiryResponseHeader: { SuccessCode: "1", CustRefField: "ref-1" },
      InquiryRequestInfo: { FirstName: "Asha", IDDetails: [{ IDValue: "ABCDE1234F" }] },
    };
    assert.throws(
      () => parseEquifaxResponse(body),
      (err: unknown) =>
        err instanceof BureauError &&
        /InquiryResponseHeader, InquiryRequestInfo; SuccessCode 1/.test(err.message) &&
        !/Asha|ABCDE1234F|ref-1/.test(err.message),
    );
  });
});

describe("describeNetworkError", () => {
  const fetchError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

  it("explains a connection timeout", () => {
    assert.match(describeNetworkError(fetchError("UND_ERR_CONNECT_TIMEOUT"), "x.example"), /didn't answer/);
    assert.match(describeNetworkError(Object.assign(new Error("t"), { name: "TimeoutError" }), "x.example"), /didn't answer/);
  });

  it("flags a wrong address", () => {
    assert.match(describeNetworkError(fetchError("ENOTFOUND"), "x.example"), /couldn't be found/);
  });
});

describe("parseEquifaxResponse (CIR 360 API shape)", () => {
  const cir360 = (reportData: Record<string, unknown>, hitCode: unknown = 10) => ({
    InquiryResponseHeader: { ReportOrderNO: "55443322", SuccessCode: 1, HitCode: hitCode },
    ReportData: reportData,
  });

  it("reads score, EMIs and defaults", () => {
    const result = parseEquifaxResponse(
      cir360({
        AccountsSummary: { ConsolidateCreditSummary: { Retail: { InstallmentAmount: "8,100", NoOfWriteOffs: "0" } } },
        Accounts: {
          Retails: [
            { Open: "Yes", InstallmentAmount: "8100", AccountStatus: "Standard", History48Months: [month("01-25", "000")] },
            { Open: "No", AccountStatus: "Closed", History48Months: [month("03-22", "90+")] },
          ],
        },
        ScoreDetails: [{ Type: "ERS", Version: "4.0", Value: "742" }],
      }),
    );
    assert.deepEqual(result, { hit: true, score: 742, existingEmi: 8100, defaults: 1, bureauRef: "55443322" });
  });

  it("treats a numeric HitCode 0 as no credit file", () => {
    assert.equal(parseEquifaxResponse(cir360({ ScoreDetails: [] }, 0)).hit, false);
  });

  it("raises errors reported inside ReportData", () => {
    assert.throws(
      () => parseEquifaxResponse(cir360({ Error: { efxErrorCode: "E0020", description: "Invalid DOB" } })),
      (err: unknown) => err instanceof BureauError && err.code === "E0020" && /Invalid DOB/.test(err.message),
    );
  });
});

describe("OAuth", () => {
  it("requests a client-credentials token with HTTP Basic auth", () => {
    const req = buildTokenRequest({ clientId: "my-client", clientSecret: "s3cret" });
    assert.equal(req.headers.Authorization, `Basic ${Buffer.from("my-client:s3cret").toString("base64")}`);
    assert.equal(req.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.equal(new URLSearchParams(req.body).get("grant_type"), "client_credentials");
  });

  it("asks for the CIR 360 scope unless another is configured", () => {
    assert.equal(new URLSearchParams(buildTokenRequest({ clientId: "c", clientSecret: "s" }).body).get("scope"), DEFAULT_SCOPE);
    const req = buildTokenRequest({ clientId: "c", clientSecret: "s", scope: "cir.read" });
    assert.equal(new URLSearchParams(req.body).get("scope"), "cir.read");
  });

  it("sends the member login, and a product version only when set", () => {
    const body = buildEquifaxRequest(creds, request);
    assert.deepEqual(Object.keys(body.RequestHeader).sort(), [
      "CustRefField", "CustomerId", "MemberNumber", "Password", "ProductCode", "SecurityCode", "UserId",
    ]);
    assert.equal(buildEquifaxRequest({ ...creds, productVersion: "1.0" }, request).RequestHeader.ProductVersion, "1.0");
  });

  it("treats a schema rejection of the blank test enquiry as connected", () => {
    assert.equal(classifyGatewayError(new BureauError("Equifax returned HTTP 400 (400.01: Invalid JSON payload)", "HTTP_400"))?.ok, true);
    const denied = classifyGatewayError(new BureauError("Equifax returned HTTP 401 (401.01: No product match found)", "HTTP_401"));
    assert.equal(denied?.ok, false);
    assert.match(denied!.message, /CIR Client Gateway/);
    assert.equal(classifyGatewayError(new BureauError("Equifax returned HTTP 500", "HTTP_500")), null);
  });

  it("explains Equifax gateway and OAuth errors", () => {
    assert.equal(
      describeHttpError(401, { efxErrorCode: "401.03", description: "Invalid mandatory parameters" }),
      "Equifax returned HTTP 401 (401.03: Invalid mandatory parameters)",
    );
    assert.match(describeHttpError(401, { error: "invalid_client", error_description: "Invalid mandatory parameters" }), /invalid_client/);
  });
});
