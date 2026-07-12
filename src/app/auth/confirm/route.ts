import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/auth/profile";
import { safeNextPath, siteUrl } from "@/lib/auth/paths";

/**
 * Email-link verification for self-hosted GoTrue. The mailer templates point
 * here with `token_hash` + `type`, which covers the magic-link and email-change
 * flows. We verify with verifyOtp, then send the user to a validated
 * same-origin `next` path (or the onboarding gate).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const destination = user
        ? await resolvePostLoginPath(supabase, user.id, next)
        : next;

      return NextResponse.redirect(siteUrl(destination));
    }
  }

  // Missing/expired/invalid link.
  return NextResponse.redirect(siteUrl("/login?error=expired"));
}
