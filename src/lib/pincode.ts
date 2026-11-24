// Which state a PIN code is in, from its first digits. Only prefixes that lie in a single state are listed; for
// mixed ones (e.g. 396 is partly Gujarat, partly Daman) it returns null and the applicant chooses.

/** [first prefix, last prefix, state code], as 3-digit prefixes. */
const RANGES: [number, number, string][] = [
  [110, 110, "DL"],
  [121, 136, "HR"],
  [140, 159, "PB"],
  [171, 177, "HP"],
  [180, 193, "JK"],
  [194, 194, "LA"],
  [201, 243, "UP"],
  [245, 245, "UP"],
  [248, 249, "UK"],
  [250, 261, "UP"],
  [263, 263, "UK"],
  [271, 285, "UP"],
  [301, 345, "RJ"],
  [360, 395, "GJ"],
  [400, 402, "MH"],
  [403, 403, "GA"],
  [404, 445, "MH"],
  [450, 488, "MP"],
  [490, 497, "CG"],
  [500, 506, "TG"],
  [508, 509, "TG"],
  [515, 535, "AP"],
  [560, 591, "KA"],
  [600, 604, "TN"],
  [606, 643, "TN"],
  [670, 695, "KL"],
  [700, 736, "WB"],
  [737, 737, "SK"],
  [738, 743, "WB"],
  [744, 744, "AN"],
  [751, 770, "OR"],
  [781, 788, "AS"],
  [790, 792, "AR"],
  [793, 794, "ML"],
  [795, 795, "MN"],
  [796, 796, "MZ"],
  [797, 798, "NL"],
  [799, 799, "TR"],
  [800, 805, "BR"],
  [811, 812, "BR"],
  [815, 816, "JH"],
  [821, 821, "BR"],
  [822, 822, "JH"],
  [823, 824, "BR"],
  [825, 835, "JH"],
  [841, 855, "BR"],
];

/** Enclaves inside another state's range: a state code, or null where the area is mixed. */
const EXCEPTIONS: [string, string | null][] = [
  ["3625", null], // Diu and Gujarat
  ["533464", null], // Yanam and Andhra Pradesh
  ["607402", null], // Puducherry and Tamil Nadu
  ["607403", null],
  ["6096", null], // Karaikal and Tamil Nadu
  ["673310", null], // Mahe and Kerala
  ["68255", "LD"], // Lakshadweep
];

export function stateFromPin(pin: string): string | null {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  const exception = EXCEPTIONS.find(([prefix]) => pin.startsWith(prefix));
  if (exception) return exception[1];
  const prefix = Number(pin.slice(0, 3));
  return RANGES.find(([from, to]) => prefix >= from && prefix <= to)?.[2] ?? null;
}
