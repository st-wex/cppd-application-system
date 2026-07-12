import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Minimal authenticated landing page. The proxy already guards this route, but
 * we re-check `getUser()` here (never trust getSession() for authenticity) and
 * derive the greeting from the verified user. Fuller dashboard UI lands later.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Signed in as {user.email}
          </p>
        </div>
        <SignOutButton />
      </div>

      <p className="text-muted-foreground mt-8 text-sm">
        Your applications will appear here.
      </p>
    </main>
  );
}
