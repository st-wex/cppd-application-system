import type { Course } from "@/lib/types";

/**
 * TEMPORARY placeholder course data for the landing page.
 *
 * TODO: wire the landing page to the `courses` table via the Supabase server
 * client (`src/lib/supabase/server.ts`) once the schema is seeded. Kept as a
 * typed array so the swap to a real query is type-checked.
 */
export const placeholderCourses: Course[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "foundations-of-counselling",
    title: "Foundations of Counselling & Psychotherapy",
    summary:
      "An introduction to core therapeutic concepts, ethics, and the counselling relationship for aspiring practitioners.",
    level: "foundation",
    durationMonths: 6,
    isPublished: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    slug: "diploma-integrative-therapy",
    title: "Diploma in Integrative Psychotherapy",
    summary:
      "A structured, supervised programme covering integrative theory, clinical skills, and reflective practice.",
    level: "diploma",
    durationMonths: 18,
    isPublished: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    slug: "advanced-trauma-practice",
    title: "Advanced Certificate in Trauma-Informed Practice",
    summary:
      "For qualified therapists: advanced approaches to working safely and effectively with trauma.",
    level: "advanced",
    durationMonths: 9,
    isPublished: true,
  },
];
