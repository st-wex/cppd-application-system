"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath, siteUrl } from "@/lib/auth/paths";
import { loginEmailSchema } from "@/lib/validation/auth";

/**
 * Server actions backing the /login form.
 *
 * These are the SECURITY boundary: `next` is re-validated here (never trust the
 * hidden field) and all redirect URLs are built on NEXT_PUBLIC_SITE_URL so the
 * email/OAuth links resolve to the public tunnel domain.
 */

/**
 * Kick off Google OAuth. We ask Supabase for the provider URL server-side (this
 * also writes the PKCE code-verifier cookie), then redirect the browser to it.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
    },
  });

  if (error || !data?.url) {
    redirect(`/login?error=oauth&next=${encodeURIComponent(next)}`);
  }

  redirect(data.url);
}

export type MagicLinkState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
};

/**
 * Send a magic-link email. Validates the address with the shared zod schema,
 * then asks GoTrue to email a link back to /auth/confirm. The response never
 * reveals whether the address exists, and the email itself is never logged.
 */
export async function sendMagicLink(
  _prev: MagicLinkState,
  formData: FormData
): Promise<MagicLinkState> {
  const next = safeNextPath(formData.get("next")?.toString());

  const parsed = loginEmailSchema.safeParse({
    email: formData.get("email")?.toString() ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: siteUrl(
        `/auth/confirm?next=${encodeURIComponent(next)}`
      ),
      shouldCreateUser: true,
    },
  });

  if (error) {
    return {
      status: "error",
      message: "We couldn't send the link. Please try again in a moment.",
    };
  }

  return { status: "sent", email };
}
