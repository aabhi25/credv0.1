import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATES } from "./bureaus/codes";
import { stateFromPin } from "./pincode";

describe("stateFromPin", () => {
  it("finds the state for PIN codes in a single state", () => {
    const cases: Record<string, string> = {
      "110001": "DL", "122002": "HR", "134109": "HR", "194101": "LA", "248001": "UK", "249145": "UK", "302020": "RJ",
      "400057": "MH", "403001": "GA", "560038": "KA", "500001": "TG", "530001": "AP", "682001": "KL", "682555": "LD",
      "737101": "SK", "744101": "AN", "793001": "ML", "799001": "TR", "800001": "BR", "822101": "JH", "834001": "JH",
    };
    for (const [pin, state] of Object.entries(cases)) assert.equal(stateFromPin(pin), state, pin);
  });

  it("leaves areas shared by two states to the applicant", () => {
    for (const pin of ["160017", "396210", "396001", "246701", "247667", "262001", "244713", "507126", "605001", "609602", "533464", "673310", "813208", "814131", "362520"]) {
      assert.equal(stateFromPin(pin), null, pin);
    }
  });

  it("ignores incomplete and invalid PIN codes", () => {
    for (const pin of ["", "56003", "5600381", "012345", "abcdef", "999999"]) assert.equal(stateFromPin(pin), null, pin);
  });

  it("only returns states the form offers", () => {
    const codes = new Set(STATES.map((s) => s.code));
    for (let p = 100; p <= 999; p++) {
      const state = stateFromPin(`${p}001`);
      assert.ok(state === null || codes.has(state), `${p}: ${state}`);
    }
  });
});
