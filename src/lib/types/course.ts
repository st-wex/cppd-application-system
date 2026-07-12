/**
 * Domain types for course categories, courses and their intake batches.
 *
 * These mirror the `course_categories`, `courses` and `batches` tables in
 * `supabase/migrations`. This repo is the single source of truth for the
 * schema — keep these types in sync with the SQL, not the other way round.
 */

import type { RequirementsConfig } from "./requirements";

export interface CourseCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number | null;
}

export interface Course {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  requirements: RequirementsConfig;
}

export interface Batch {
  id: string;
  courseId: string;
  batchNumber: string;
  enrollmentStart: string; // ISO timestamp
  enrollmentEnd: string; // ISO timestamp
  classStart: string; // ISO date (yyyy-MM-dd)
  capacity: number;
  isPublished: boolean;
}

/** A coarse availability band from `get_open_batches()` (never exact counts). */
export type BatchAvailability = "available" | "limited" | "full";

/** One row returned by the `get_open_batches()` RPC. */
export interface OpenBatch {
  batchId: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  categorySlug: string;
  batchNumber: string;
  enrollmentStart: string;
  enrollmentEnd: string;
  classStart: string;
  isOpen: boolean;
  availability: BatchAvailability;
}
