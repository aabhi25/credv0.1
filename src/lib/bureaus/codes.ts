// Client-safe code lists from the Equifax IDCCR specification (June 2025), appendices A and C.

/** State codes. Where the spec lists two codes (e.g. "OR, OD"), the first is used. */
export const STATES: { code: string; name: string }[] = [
  { code: "AN", name: "Andaman and Nicobar Islands" },
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CH", name: "Chandigarh" },
  { code: "CG", name: "Chhattisgarh" },
  { code: "DN", name: "Dadra and Nagar Haveli" },
  { code: "DD", name: "Daman and Diu" },
  { code: "DL", name: "Delhi" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JK", name: "Jammu and Kashmir" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OR", name: "Odisha" },
  { code: "PY", name: "Puducherry" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TG", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },
];

const ALIASES: Record<string, string> = { CT: "CG", OD: "OR", TS: "TG", UL: "UK", PONDICHERRY: "PY", ORISSA: "OR" };

/** Accepts a state code or name (any case) and returns its code, or null. Used for CSV uploads. */
export function toStateCode(input: string): string | null {
  const v = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (!v) return null;
  if (ALIASES[v]) return ALIASES[v];
  const match = STATES.find((s) => s.code === v || s.name.toUpperCase() === v || s.name.toUpperCase().replace(/ AND /g, " & ") === v);
  return match?.code ?? null;
}

/** Retail enquiry purposes (Appendix A), limited to the ones relevant for pre-approved credit. */
export const INQUIRY_PURPOSES: { code: string; label: string }[] = [
  { code: "05", label: "Personal Loan" },
  { code: "06", label: "Consumer Loan" },
  { code: "08", label: "Education Loan" },
  { code: "13", label: "Two-Wheeler Loan" },
  { code: "01", label: "Auto Loan (Personal)" },
  { code: "02", label: "Housing Loan" },
  { code: "03", label: "Property Loan" },
  { code: "07", label: "Gold Loan" },
  { code: "09", label: "Loan to Professional" },
  { code: "10", label: "Credit Card" },
  { code: "12", label: "Overdraft" },
  { code: "17", label: "Commercial Vehicle Loan" },
  { code: "21", label: "Seller Financing" },
  { code: "00", label: "Other" },
];
