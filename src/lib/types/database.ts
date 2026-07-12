/**
 * Hand-written Supabase `Database` type.
 *
 * Mirrors the schema in `supabase/migrations`. This repo is the single source of
 * truth for the schema; keep this in sync with the SQL (or regenerate with
 * `supabase gen types typescript` once a live instance is available). Typed here
 * so the `@supabase/ssr` clients (`src/lib/supabase/*`) get row/RPC typing.
 */

import type { RequirementsConfig } from "./requirements";
import type { ApplicationStatus } from "./application";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          address: string;
          city: string;
          date_of_birth: string;
          gender: "male" | "female" | "other" | "prefer_not_to_say";
          telephone: string | null;
          mobile: string;
          emergency_contact_name: string;
          emergency_contact_relationship: string;
          emergency_contact_phone: string;
          emergency_contact_email: string;
          cnic_front_path: string | null;
          cnic_back_path: string | null;
          photo_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          address: string;
          city: string;
          date_of_birth: string;
          gender: "male" | "female" | "other" | "prefer_not_to_say";
          telephone?: string | null;
          mobile: string;
          emergency_contact_name: string;
          emergency_contact_relationship: string;
          emergency_contact_phone: string;
          emergency_contact_email: string;
          cnic_front_path?: string | null;
          cnic_back_path?: string | null;
          photo_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      course_categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sort_order: number | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          sort_order?: number | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["course_categories"]["Insert"]
        >;
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          category_id: string;
          title: string;
          slug: string;
          description: string | null;
          is_active: boolean;
          requirements: RequirementsConfig;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          title: string;
          slug: string;
          description?: string | null;
          is_active?: boolean;
          requirements?: RequirementsConfig;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["courses"]["Insert"]>;
        Relationships: [];
      };
      batches: {
        Row: {
          id: string;
          course_id: string;
          batch_number: string;
          enrollment_start: string;
          enrollment_end: string;
          class_start: string;
          capacity: number;
          is_published: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          batch_number: string;
          enrollment_start: string;
          enrollment_end: string;
          class_start: string;
          capacity: number;
          is_published?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["batches"]["Insert"]>;
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          user_id: string;
          batch_id: string;
          status: ApplicationStatus;
          profile_snapshot: Json;
          qualifications: Json | null;
          employment: Json | null;
          counselling_experience: string | null;
          health_disclosure: Json | null;
          medication_allergies: Json | null;
          personal_statement: string | null;
          references: Json | null;
          consent_given: boolean;
          consent_text: string;
          submitted_at: string;
          status_changed_at: string | null;
          status_changed_by: string | null;
        };
        // Applications are insert-only via the RPC and immutable to users.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      application_files: {
        Row: {
          id: string;
          application_id: string;
          user_id: string;
          requirement_key: string;
          storage_path: string;
          original_filename: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      submit_application: {
        Args: { p_batch_id: string; p_payload: Json; p_files: Json };
        Returns: string;
      };
      batch_availability: {
        Args: { p_batch_id: string };
        Returns: {
          batch_id: string;
          capacity: number;
          seats_taken: number;
          is_open: boolean;
        }[];
      };
      get_open_batches: {
        Args: Record<string, never>;
        Returns: {
          batch_id: string;
          course_id: string;
          course_slug: string;
          course_title: string;
          category_slug: string;
          batch_number: string;
          enrollment_start: string;
          enrollment_end: string;
          class_start: string;
          is_open: boolean;
          availability: "available" | "limited" | "full";
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
