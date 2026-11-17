import { createLiveAdapter } from "./live";
import { createMockAdapter } from "./mock";
import type { ApiMode, BureauAdapter, BureauCode } from "./types";

export * from "./types";
export { liveCredentials } from "./live";

export function getBureauAdapter(code: BureauCode, mode: ApiMode): BureauAdapter {
  return mode === "LIVE" ? createLiveAdapter(code) : createMockAdapter(code);
}
