import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import { isProtectedPath } from "@/lib/auth/paths";

/**
 * Refreshes the Supabase auth session on every matched request, keeps the auth
 * cookies in sync between the browser and the server, AND guards the protected
 * routes (/dashboard, /profile, /apply): unauthenticated users are redirected to
 * /login?next=<original path>.
 *
 * Wired from the root `src/proxy.ts` (Next.js 16 renamed `middleware` to
 * `proxy`). Follows the official @supabase/ssr cookie pattern: read cookies from
 * the request, write refreshed cookies onto BOTH the request and the outgoing
 * response.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  // getUser() revalidates the token with the auth server (never trust
  // getSession() alone for protection) and triggers the cookie refresh above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guard protected routes for unauthenticated users.
  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // Preserve where they were headed as a same-origin relative path.
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );

    const redirectResponse = NextResponse.redirect(loginUrl);
    // Carry over any refreshed auth cookies so the redirect stays consistent.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
