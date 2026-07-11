import { z } from "zod";

/**
 * Zod schemas for the student profile + course application.
 *
 * SECURITY (see CLAUDE.md): every schema here is enforced BOTH client-side
 * (react-hook-form, for UX) AND server-side (server action / the
 * `submit_application` RPC, for security). Client validation is never trusted
 * on its own.
 */

// Pakistani CNIC: 13 digits, canonical format 00000-0000000-0.
const cnicRegex = /^\d{5}-\d{7}-\d$/;
// E.164-ish phone check, lenient enough for local + international formats.
const phoneRegex = /^\+?[0-9\s-]{7,20}$/;

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(120, "Name is too long."),
  email: z.email("Enter a valid email address."),
  phone: z.string().regex(phoneRegex, "Enter a valid phone number."),
  cnic: z
    .string()
    .regex(cnicRegex, "CNIC must be in the format 00000-0000000-0."),
  dateOfBirth: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date."),
  city: z.string().trim().min(2, "Please enter your city.").max(80),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const applicationSchema = z.object({
  batchId: z.uuid("Select a valid course batch."),
  highestQualification: z
    .string()
    .trim()
    .min(2, "Please enter your highest qualification.")
    .max(160),
  motivation: z
    .string()
    .trim()
    .min(50, "Tell us a little more (at least 50 characters).")
    .max(2000, "Please keep this under 2000 characters."),
  agreeToTerms: z.literal(true, {
    error: "You must accept the terms to apply.",
  }),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;
