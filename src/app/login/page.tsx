import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/auth/profile";
import { safeNextPath } from "@/lib/auth/paths";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — CPPD Pakistan",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = safeNextPath(firstValue(params.next));

  // Already signed in? Skip the form and route onward.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(await resolvePostLoginPath(supabase, user.id, next));
  }

  const errorCode = firstValue(params.error);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <LoginForm next={next} errorCode={errorCode} />
    </main>
  );
}
