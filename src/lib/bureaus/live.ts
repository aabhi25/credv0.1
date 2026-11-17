import { BureauError, BUREAU_LABELS, type BureauAdapter, type BureauCode } from "./types";

export function liveCredentials(code: BureauCode) {
  const url = process.env[`${code}_API_URL`];
  const key = process.env[`${code}_API_KEY`];
  return url && key ? { url, key } : null;
}

/**
 * Live bureau adapter.
 *
 * Each bureau has its own request/response format and onboarding (member ID, certificates, etc.).
 * Once credentials are issued, implement the call for that bureau below and map its response to
 * a BureauReport. Until then a LIVE check fails clearly instead of returning made-up data.
 */
export function createLiveAdapter(code: BureauCode): BureauAdapter {
  return {
    code,
    async fetchReport() {
      if (!liveCredentials(code)) {
        throw new BureauError(`${BUREAU_LABELS[code]} live credentials are not configured`);
      }
      throw new BureauError(`${BUREAU_LABELS[code]} live integration is not implemented yet`);
    },
  };
}
