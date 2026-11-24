import { z } from "zod";
import { INQUIRY_PURPOSES, STATES, toStateCode } from "./bureaus/codes";

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const MOBILE_REGEX = /^[6-9]\d{9}$/;
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const STATE_CODES = new Set(STATES.map((s) => s.code));

export const applicantSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  mobile: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))
    .pipe(z.string().regex(MOBILE_REGEX, "Enter a valid 10-digit mobile number")),
  pan: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(PAN_REGEX, "Enter a valid PAN, e.g. ABCDE1234F")),
  dob: z.string().trim().refine((v) => parseDob(v) !== null, "Enter a valid date of birth"),
  address: z
    .string()
    .trim()
    .min(10, "Enter your full address")
    .max(200, "Keep the address under 200 characters"),
  // Accepts a code (MH) or a name (Maharashtra), so CSV uploads can use either.
  state: z
    .string()
    .trim()
    .transform((v) => toStateCode(v) ?? v)
    .pipe(z.string().refine((v) => STATE_CODES.has(v), "Select your state")),
  pincode: z.string().trim().regex(PINCODE_REGEX, "Enter a valid 6-digit PIN code"),
  monthlyIncome: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(/[,\s₹]/g, "")))
    .pipe(
      z
        .number({ error: "Enter your monthly income" })
        .int("Enter a whole number")
        .min(1000, "Enter your monthly income in rupees")
        .max(10_00_00_000, "That looks too high; enter your monthly income"),
    ),
});

const withoutIncome = applicantSchema.omit({ monthlyIncome: true });

/** Income is only needed for the DTI rule, so it's only asked for when a program has one. */
export function applicantSchemaFor(program: { maxDtiPct: number | null }) {
  return program.maxDtiPct === null ? withoutIncome : applicantSchema;
}

export type ApplicantInput = z.infer<typeof withoutIncome> & { monthlyIncome?: number };

/** Accepts YYYY-MM-DD (date input) or DD/MM/YYYY / DD-MM-YYYY (CSV). */
export function parseDob(value: string): Date | null {
  let y: number, m: number, d: number;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [y, m, d] = [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (date > new Date() || y < 1900) return null;
  return date;
}

export function ageFrom(dob: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function maskPan(pan: string): string {
  return `XXXXX${pan.slice(5)}`;
}

export const programSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes"),
    category: z.string().trim().min(2, "Category is required").max(60),
    description: z.string().trim().max(300).default(""),
    bureau: z.enum(["EQUIFAX", "CIBIL", "CRIF", "EXPERIAN"]),
    inquiryPurpose: z
      .string()
      .refine((v) => INQUIRY_PURPOSES.some((p) => p.code === v), "Choose the loan type for bureau enquiries"),
    minScore: z.coerce.number().int().min(300).max(900),
    // Blank: the program doesn't check DTI.
    maxDtiPct: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(0).max(100).nullable()),
    maxDefaults: z.coerce.number().int().min(0).max(10),
    minAge: z.coerce.number().int().min(18).max(80),
    maxAge: z.coerce.number().int().min(18).max(100),
    approvedLimit: z.coerce.number().int().min(1000).max(100_000_000),
    active: z.boolean(),
  })
  .refine((p) => p.maxAge >= p.minAge, { message: "Max age must be at least min age", path: ["maxAge"] });

export type ProgramInput = z.infer<typeof programSchema>;
