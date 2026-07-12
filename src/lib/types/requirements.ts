/**
 * RequirementsConfig — the dynamic, per-course application requirement config.
 *
 * This is the canonical shape of `public.courses.requirements` (jsonb). Keep it
 * in sync with the SQL comment in `supabase/migrations/0003_courses.sql` and the
 * server-side validation in `submit_application` (0005). Client zod schemas in
 * `src/lib/validation` mirror this so the same rules run on both sides.
 */

/** A single dynamic document upload slot on a course's application form. */
export interface UploadSlot {
  /** Unique key within a course, e.g. "marksheet_1". Matches application_files.requirement_key. */
  key: string;
  /** Human label, e.g. "Marksheet 1". */
  label: string;
  /** Free-text instructions shown ABOVE the upload control (varies per course). */
  instructions: string;
  /** Whether the applicant must provide this file. */
  required: boolean;
  /** Allowed MIME types, e.g. ["application/pdf", "image/jpeg", "image/png"]. */
  accepted_types: string[];
  /** Maximum accepted file size, in megabytes. */
  max_size_mb: number;
}

/** Reference-request configuration. The system caps references at 2. */
export interface ReferencesConfig {
  enabled: boolean;
  min: number;
  /** Never more than 2. */
  max: number;
}

/**
 * The full requirement config for a course. Boolean flags toggle whole form
 * sections; when a flag is false the corresponding payload section is omitted
 * and never stored.
 */
export interface RequirementsConfig {
  /** Optional copy shown at the top of the application form. */
  intro_text: string | null;
  /** Professional + additional qualifications section. */
  qualifications: boolean;
  /** Employer, position, start date, employer address. */
  employment: boolean;
  /** Free-text counselling-experience summary. */
  counselling_experience: boolean;
  /** Disability/diagnosis details + support needs. */
  health_disclosure: boolean;
  /** Regular medications + allergies. */
  medication_allergies: boolean;
  /** Personal statement. */
  personal_statement: boolean;
  /** Reference requests. */
  references: ReferencesConfig;
  /** Dynamic document upload slots. */
  uploads: UploadSlot[];
}
