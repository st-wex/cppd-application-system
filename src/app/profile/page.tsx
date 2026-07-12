import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Profile / onboarding page. The proxy guards the route; post-login routing
 * (see resolvePostLoginPath) sends users here until their profile is complete,
 * making this the onboarding gate. The profile form itself lands in a later
 * change — this is the authenticated shell it renders into.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Complete your profile
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            We need a few details before you can apply to a course.
          </p>
        </div>
        <SignOutButton />
      </div>

      <p className="text-muted-foreground mt-8 text-sm">
        The profile form will appear here.
      </p>
    </main>
  );
}
