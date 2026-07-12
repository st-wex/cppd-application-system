import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/auth/paths";

/**
 * POST-only sign-out. Revokes the session and clears the auth cookies (the
 * server client's setAll is writable inside a route handler), then redirects to
 * /login with a 303 so the browser follows with a GET.
 *
 * POST-only on purpose: a GET would let a stray <img>/prefetch log users out.
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(siteUrl("/login"), { status: 303 });
}
