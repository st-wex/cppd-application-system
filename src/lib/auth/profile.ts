import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * Post-login onboarding gate.
 *
 * A profile is "complete" when a `profiles` row exists AND all three document
 * paths (CNIC front/back + photo) are present — the exact same rule the
 * `submit_application` RPC (0005) enforces before accepting an application. The
 * remaining personal/contact columns are NOT NULL by table constraint, so a row
 * existing already guarantees they are filled.
 *
 * Until the profile is complete, the user is routed to /profile so onboarding
 * becomes a hard gate before /dashboard or /apply.
 *
 * Runs under the caller's RLS-scoped client, so it can only ever read the
 * signed-in user's own row.
 */
export async function resolvePostLoginPath(
  supabase: SupabaseClient<Database>,
  userId: string,
  intended: string
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("cnic_front_path, cnic_back_path, photo_path")
    .eq("id", userId)
    .maybeSingle();

  const complete = Boolean(
    profile &&
    profile.cnic_front_path &&
    profile.cnic_back_path &&
    profile.photo_path
  );

  // Incomplete profile → force onboarding, unless they were already headed there.
  if (!complete && !intended.startsWith("/profile")) {
    return "/profile";
  }

  return intended;
}
