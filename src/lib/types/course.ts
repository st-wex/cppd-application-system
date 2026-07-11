/**
 * Domain types for courses and their intake batches.
 *
 * These mirror the `courses` and `batches` tables defined in
 * `supabase/migrations`. This repo is the single source of truth for the
 * schema — keep these types in sync with the SQL, not the other way round.
 */

export type CourseLevel = "foundation" | "diploma" | "advanced";

export interface Course {
  id: string;
  slug: string;
  title: string;
  summary: string;
  level: CourseLevel;
  durationMonths: number;
  isPublished: boolean;
}

export type BatchStatus = "upcoming" | "open" | "closed";

export interface Batch {
  id: string;
  courseId: string;
  name: string;
  status: BatchStatus;
  startDate: string; // ISO date (yyyy-MM-dd)
  applicationDeadline: string; // ISO date (yyyy-MM-dd)
  seats: number;
}
