import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/auth/profile";

/**
 * Course application entry point. Protected by the proxy; also re-checks the
 * verified user and the onboarding gate here so an incomplete profile can never
 * reach the application flow. The application form lands in a later change.
 */
export default async function ApplyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/apply");
  }

  // Incomplete profile → onboarding first (mirrors submit_application's gate).
  const destination = await resolvePostLoginPath(supabase, user.id, "/apply");
  if (destination !== "/apply") {
    redirect(destination);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Apply to a course
      </h1>
      <p className="text-muted-foreground mt-8 text-sm">
        The application form will appear here.
      </p>
    </main>
  );
}
