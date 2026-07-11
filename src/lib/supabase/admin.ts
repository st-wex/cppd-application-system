import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env, serverEnv } from "@/lib/env";

/**
 * Privileged Supabase client using the SERVICE ROLE key.
 *
 * SECURITY (see CLAUDE.md):
 * - `import "server-only"` makes any accidental client import a build error.
 * - Bypasses Row Level Security, so use sparingly and only for trusted
 *   operations that cannot be expressed as a user-scoped, RLS-guarded call
 *   (e.g. issuing short-lived signed URLs for private storage objects).
 * - The service-role key is never exposed to the browser or via NEXT_PUBLIC_*.
 */
export function createAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
