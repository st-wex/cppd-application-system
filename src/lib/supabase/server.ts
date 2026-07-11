import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Authenticated as the current user (anon key + the user's session cookie), so
 * Row Level Security still applies. `cookies()` is async in Next.js 15+.
 *
 * Note: in a Server Component the cookie store is read-only; the `setAll`
 * failure is swallowed because session refresh happens in `proxy.ts`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore when the session
            // is refreshed by the proxy (see src/lib/supabase/middleware.ts).
          }
        },
      },
    }
  );
}
