/**
 * Application domain types.
 *
 * `ApplicationPayload` / `ApplicationFileInput` are the exact shapes accepted by
 * the `submit_application(p_batch_id, p_payload, p_files)` RPC (see
 * `supabase/migrations/0005_submit_application.sql`). The zod schemas in
 * `src/lib/validation` validate these on the client (UX) and again server-side
 * (the RPC is the security boundary).
 */

export type ApplicationStatus = "applied" | "approved" | "rejected";

/** Custom SQLSTATEs raised by submit_application(), for frontend branching. */
export const SUBMIT_ERROR_CODES = {
  NOT_AUTHENTICATED: "PT001",
  PROFILE_INCOMPLETE: "PT002",
  BATCH_NOT_OPEN: "PT003",
  BATCH_FULL: "PT004",
  VALIDATION: "PT005",
  DUPLICATE: "PT006",
  CONSENT_REQUIRED: "PT007",
} as const;

export type SubmitErrorCode =
  (typeof SUBMIT_ERROR_CODES)[keyof typeof SUBMIT_ERROR_CODES];

// ---------------------------------------------------------------------------
// Payload sections (present only when the course enables them)
// ---------------------------------------------------------------------------

export interface QualificationsSection {
  professional: string;
  additional?: string;
}

export interface EmploymentSection {
  employer_name: string;
  position: string;
  /** ISO date string (yyyy-MM-dd). */
  start_date: string;
  employer_address: string;
}

export interface HealthDisclosureSection {
  has_condition: boolean;
  details?: string;
  support_needed?: string;
}

export interface MedicationAllergiesSection {
  medications: string;
  allergies: string;
}

export interface ReferenceEntry {
  name: string;
  position?: string;
  phone: string;
  address?: string;
  email: string;
}

/** One uploaded file, linking a requirement slot to a stored storage object. */
export interface ApplicationFileInput {
  /** Must match a course upload slot's `key`. */
  requirement_key: string;
  /** Full path, must start with `application-uploads/{user_id}/`. */
  storage_path: string;
  original_filename?: string;
  mime_type: string;
  size_bytes: number;
}

/**
 * The `p_payload` argument to submit_application. Optional sections are only
 * required/stored when the target course enables them.
 */
export interface ApplicationPayload {
  consent_given: true;
  /** The exact declaration wording shown to the applicant, stored verbatim. */
  consent_text: string;
  qualifications?: QualificationsSection;
  employment?: EmploymentSection;
  counselling_experience?: string;
  health_disclosure?: HealthDisclosureSection;
  medication_allergies?: MedicationAllergiesSection;
  personal_statement?: string;
  references?: ReferenceEntry[];
}
