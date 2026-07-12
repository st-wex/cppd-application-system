import { z, type ZodTypeAny } from "zod";

import type { RequirementsConfig } from "@/lib/types/requirements";

/**
 * Zod schemas for the student profile + course application.
 *
 * SECURITY (see CLAUDE.md): every schema here is enforced BOTH client-side
 * (react-hook-form, for UX) AND server-side (server action / the
 * `submit_application` RPC, for security). Client validation is never trusted
 * on its own.
 *
 * The application/file schemas are built *from a course's RequirementsConfig* so
 * they mirror exactly what `submit_application` (0005) enforces: only enabled
 * sections are required, references honour min/max (capped at 2), and each file
 * is checked against its upload slot (mime, size, ownership of storage path).
 */

// E.164-ish phone check, lenient enough for local + international formats.
const phoneRegex = /^\+?[0-9\s-]{7,20}$/;

const STORAGE_BUCKET_PREFIX = "application-uploads";

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(120, "Name is too long."),
  address: z.string().trim().min(1, "Please enter your address."),
  city: z.string().trim().min(2, "Please enter your city.").max(80),
  date_of_birth: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date.")
    .refine(
      (v) => new Date(v) < new Date(new Date().toDateString()),
      "Date of birth must be in the past."
    ),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]),
  telephone: z
    .string()
    .regex(phoneRegex, "Enter a valid phone number.")
    .or(z.literal(""))
    .optional(),
  mobile: z.string().regex(phoneRegex, "Enter a valid mobile number."),
  emergency_contact_name: z
    .string()
    .trim()
    .min(1, "Please enter an emergency contact name."),
  emergency_contact_relationship: z
    .string()
    .trim()
    .min(1, "Please enter the relationship."),
  emergency_contact_phone: z
    .string()
    .regex(phoneRegex, "Enter a valid phone number."),
  emergency_contact_email: z.email("Enter a valid email address."),
});

export type ProfileInput = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Application section schemas (mirror the RPC's per-section checks)
// ---------------------------------------------------------------------------
export const qualificationsSchema = z.object({
  professional: z
    .string()
    .trim()
    .min(1, "Please describe your professional qualifications."),
  additional: z.string().trim().optional(),
});

export const employmentSchema = z.object({
  employer_name: z.string().trim().min(1, "Employer name is required."),
  position: z.string().trim().min(1, "Position is required."),
  start_date: z.string().trim().min(1, "Start date is required."),
  employer_address: z.string().trim().min(1, "Employer address is required."),
});

export const healthDisclosureSchema = z
  .object({
    has_condition: z.boolean(),
    details: z.string().trim().optional(),
    support_needed: z.string().trim().optional(),
  })
  .refine((v) => !v.has_condition || (v.details ?? "").trim().length > 0, {
    error: "Please describe your condition.",
    path: ["details"],
  });

export const medicationAllergiesSchema = z.object({
  medications: z.string().trim(),
  allergies: z.string().trim(),
});

export const referenceEntrySchema = z.object({
  name: z.string().trim().min(1, "Reference name is required."),
  position: z.string().trim().optional(),
  phone: z.string().trim().min(1, "Reference phone is required."),
  address: z.string().trim().optional(),
  email: z.email("Enter a valid reference email."),
});

export const applicationFileSchema = z.object({
  requirement_key: z.string().min(1),
  storage_path: z.string().min(1),
  original_filename: z.string().optional(),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
});

export type ApplicationFileValue = z.infer<typeof applicationFileSchema>;

// ---------------------------------------------------------------------------
// Dynamic builders — the single source of truth shared client + server
// ---------------------------------------------------------------------------

/**
 * Build the payload schema for a course, enabling only the sections its
 * RequirementsConfig turns on. Mirrors submit_application step 3 exactly.
 */
export function buildApplicationSchema(req: RequirementsConfig) {
  const shape: Record<string, ZodTypeAny> = {
    consent_given: z.literal(true, {
      error: "You must give consent to submit your application.",
    }),
    consent_text: z.string().trim().min(1, "Consent text is required."),
  };

  if (req.qualifications) shape.qualifications = qualificationsSchema;
  if (req.employment) shape.employment = employmentSchema;
  if (req.counselling_experience) {
    shape.counselling_experience = z
      .string()
      .trim()
      .min(1, "Please summarise your counselling experience.");
  }
  if (req.health_disclosure) shape.health_disclosure = healthDisclosureSchema;
  if (req.medication_allergies)
    shape.medication_allergies = medicationAllergiesSchema;
  if (req.personal_statement) {
    shape.personal_statement = z
      .string()
      .trim()
      .min(1, "Please write your personal statement.");
  }
  if (req.references.enabled) {
    const max = Math.min(req.references.max, 2);
    shape.references = z
      .array(referenceEntrySchema)
      .min(
        req.references.min,
        `Please provide at least ${req.references.min} reference(s).`
      )
      .max(max, `Please provide at most ${max} reference(s).`);
  }

  return z.object(shape);
}

/**
 * Build the files schema for a course + the current user. Mirrors the RPC's
 * upload validation: reject unknown/duplicate keys, enforce each slot's mime
 * and size, require every required slot, and ensure each storage_path lives in
 * the user's own `application-uploads/{userId}/` folder.
 */
export function buildApplicationFilesSchema(
  req: RequirementsConfig,
  userId: string
) {
  const slots = new Map(req.uploads.map((u) => [u.key, u]));
  const prefix = `${STORAGE_BUCKET_PREFIX}/${userId}/`;

  return z.array(applicationFileSchema).superRefine((files, ctx) => {
    const seen = new Set<string>();

    files.forEach((file, index) => {
      const slot = slots.get(file.requirement_key);
      if (!slot) {
        ctx.addIssue({
          code: "custom",
          path: [index, "requirement_key"],
          message: `Unknown upload: ${file.requirement_key}`,
        });
        return;
      }
      if (seen.has(file.requirement_key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "requirement_key"],
          message: `Duplicate upload for ${file.requirement_key}`,
        });
      }
      seen.add(file.requirement_key);

      if (!slot.accepted_types.includes(file.mime_type)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "mime_type"],
          message: "File type is not accepted for this upload.",
        });
      }
      if (file.size_bytes > slot.max_size_mb * 1024 * 1024) {
        ctx.addIssue({
          code: "custom",
          path: [index, "size_bytes"],
          message: `File exceeds the ${slot.max_size_mb}MB limit.`,
        });
      }
      if (!file.storage_path.startsWith(prefix)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "storage_path"],
          message: "File must be uploaded to your own folder.",
        });
      }
    });

    for (const slot of req.uploads) {
      if (slot.required && !seen.has(slot.key)) {
        ctx.addIssue({
          code: "custom",
          path: [],
          message: `Missing required upload: ${slot.label}`,
        });
      }
    }
  });
}

/** Convenience for typing a fully-built application payload schema. */
export type ApplicationSchema = ReturnType<typeof buildApplicationSchema>;
export type ApplicationValues<S extends ZodTypeAny = ApplicationSchema> =
  z.infer<S>;
