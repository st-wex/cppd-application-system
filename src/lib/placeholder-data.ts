import type { Course } from "@/lib/types";

/**
 * TEMPORARY placeholder course data for the landing page.
 *
 * TODO: wire the landing page to the `courses` table via the Supabase server
 * client (`src/lib/supabase/server.ts`) once the schema is seeded. Kept as a
 * typed array (matching the real `courses` shape) so the swap to a real query
 * is type-checked. The `requirements` here mirror the seeded configs in
 * `supabase/migrations/0006_seed.sql`.
 */

const CATEGORY = {
  certificate: "00000000-0000-0000-0000-0000000000c1",
  diploma: "00000000-0000-0000-0000-0000000000d1",
  workshop: "00000000-0000-0000-0000-0000000000f1",
} as const;

export const placeholderCourses: Course[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    categoryId: CATEGORY.certificate,
    slug: "certificate-humanistic-integrative-counselling",
    title: "Certificate in Humanistic Integrative Counselling",
    description:
      "An introductory certificate grounding you in the core theory and skills of humanistic integrative counselling.",
    isActive: true,
    requirements: {
      intro_text: null,
      qualifications: true,
      employment: false,
      counselling_experience: true,
      health_disclosure: true,
      medication_allergies: true,
      personal_statement: true,
      references: { enabled: true, min: 2, max: 2 },
      uploads: [],
    },
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    categoryId: CATEGORY.diploma,
    slug: "diploma-humanistic-integrative-counselling",
    title: "Diploma in Humanistic Integrative Counselling",
    description:
      "A professional diploma developing you into a competent, ethical humanistic integrative counsellor.",
    isActive: true,
    requirements: {
      intro_text: null,
      qualifications: true,
      employment: true,
      counselling_experience: true,
      health_disclosure: true,
      medication_allergies: true,
      personal_statement: true,
      references: { enabled: true, min: 2, max: 2 },
      uploads: [],
    },
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    categoryId: CATEGORY.workshop,
    slug: "nourish-2-your-best-self",
    title: "Nourish 2: Your Best Self",
    description:
      "A follow-on workshop building practical habits for sustained emotional and physical wellbeing.",
    isActive: true,
    requirements: {
      intro_text: null,
      qualifications: false,
      employment: false,
      counselling_experience: false,
      health_disclosure: false,
      medication_allergies: false,
      personal_statement: false,
      references: { enabled: false, min: 0, max: 0 },
      uploads: [],
    },
  },
];
