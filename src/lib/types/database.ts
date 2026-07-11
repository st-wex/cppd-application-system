/**
 * Placeholder for generated Supabase database types.
 *
 * Once the schema in `supabase/migrations` stabilises, generate strongly-typed
 * definitions with the Supabase CLI and replace this file, e.g.:
 *
 *   supabase gen types typescript --local > src/lib/types/database.ts
 *
 * Until then, `Database` is intentionally loose so the Supabase clients compile.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Database {}
