import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/auth/profile";
import { safeNextPath, siteUrl } from "@/lib/auth/paths";

/**
 * OAuth (and PKCE) callback. Google redirects here with a `code`; we exchange it
 * for a session, then send the user to a validated same-origin `next` path (or
 * the onboarding gate). All redirects are built on NEXT_PUBLIC_SITE_URL so they
 * resolve to the public tunnel domain, never an internal request host.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Provider-reported failure (e.g. user denied consent).
  if (searchParams.get("error") || !code) {
    return NextResponse.redirect(siteUrl("/login?error=oauth"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(siteUrl("/login?error=oauth"));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const destination = user
    ? await resolvePostLoginPath(supabase, user.id, next)
    : next;

  return NextResponse.redirect(siteUrl(destination));
}
