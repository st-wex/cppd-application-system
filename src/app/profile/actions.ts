"use server";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/paths";
import { buildProfileSchema } from "@/lib/validation";

/**
 * Server actions backing the /profile onboarding form.
 *
 * SECURITY (see CLAUDE.md):
 * - `saveProfile` is the write-side security boundary. It re-validates the WHOLE
 *   payload with the same zod schema the client uses (never trusting the client)
 *   and upserts under the caller's RLS-scoped session, so a row can only ever be
 *   written for `auth.uid()`.
 * - `signProfileDocument` issues 60s signed URLs for private previews. It runs
 *   under the user's RLS-scoped client (so it can only ever sign the caller's own
 *   objects) and additionally rejects any path outside the caller's folder.
 * - No PII is logged or returned in error strings.
 */

export type SaveProfileResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveProfile(
  input: unknown,
  next?: string
): Promise<SaveProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  // Re-validate the full payload with the shared schema (the security boundary).
  const parsed = buildProfileSchema(user.id).safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      error: "Please fix the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const v = parsed.data;
  const row = {
    id: user.id,
    full_name: v.full_name,
    address: v.address,
    city: v.city,
    date_of_birth: v.date_of_birth,
    gender: v.gender,
    telephone: v.telephone ? v.telephone : null,
    mobile: v.mobile,
    emergency_contact_name: v.emergency_contact_name,
    emergency_contact_relationship: v.emergency_contact_relationship,
    emergency_contact_phone: v.emergency_contact_phone,
    emergency_contact_email: v.emergency_contact_email,
    cnic_front_path: v.cnic_front_path,
    cnic_back_path: v.cnic_back_path,
    photo_path: v.photo_path,
  };

  // Upsert under RLS: profiles_insert_own / profiles_update_own both require
  // auth.uid() = id, so this can only ever write the caller's own row.
  const { error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" });

  if (error) {
    // Never surface DB internals / PII — return a generic message.
    return {
      ok: false,
      error: "We couldn't save your profile. Please try again in a moment.",
    };
  }

  return { ok: true, redirectTo: safeNextPath(next) };
}

export type SignedUrlResult = { url: string } | { error: string };

/**
 * Issue a short-lived (60s) signed URL for one of the caller's own profile
 * documents. Used to (re)load private previews without ever exposing a public
 * URL or the service-role key.
 */
export async function signProfileDocument(
  path: string
): Promise<SignedUrlResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };
  // Defense in depth: RLS already restricts SELECT to the owner's folder.
  if (!path.startsWith(`${user.id}/`)) return { error: "Forbidden." };

  const { data, error } = await supabase.storage
    .from("profile-documents")
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) return { error: "Could not load preview." };
  return { url: data.signedUrl };
}
