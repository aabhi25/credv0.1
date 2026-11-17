import { createHash } from "node:crypto";
import type { BureauAdapter, BureauCode, BureauReport, BureauRequest } from "./types";

/**
 * Deterministic fake bureau: the same PAN always gets the same report from the same bureau,
 * so demos and tests are repeatable.
 */
export function createMockAdapter(code: BureauCode): BureauAdapter {
  return {
    code,
    async fetchReport(req: BureauRequest): Promise<BureauReport> {
      const digest = createHash("sha256").update(`${code}:${req.pan}`).digest();
      await new Promise((r) => setTimeout(r, 250 + (digest[0] % 450)));
      return {
        score: 550 + (digest.readUInt16BE(1) % 301), // 550–850
        dtiPct: 5 + (digest[3] % 46), // 5–50%
        defaults: digest[4] % 10 < 7 ? 0 : (digest[4] % 3) + 1, // mostly clean
      };
    },
  };
}
