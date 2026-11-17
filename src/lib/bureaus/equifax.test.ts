import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEquifaxRequest, parseEquifaxResponse } from "./equifax";
import { BureauError, type BureauRequest } from "./types";

// Fixtures are synthetic but follow the structure of Equifax's IDCCR sample response.

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
    assert.equal(body.RequestBody.FirstName, "Asha Verma");
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

  it("strips characters Equifax rejects and splits names longer than 40 characters", () => {
    const body = buildEquifaxRequest(creds, { ...request, name: "Venkata Subramanya Lakshmi Narasimha Rao Chowdary (Jr)" });
    assert.equal(body.RequestBody.FirstName, "Venkata");
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
