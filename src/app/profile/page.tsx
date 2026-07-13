import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  PROFILE_DOCUMENT_SLOTS,
  type ProfileSaveInput,
} from "@/lib/validation";

import { ProfileForm } from "./profile-form";

/**
 * Profile / onboarding page — the gate every user completes before applying.
 *
 * Renders the react-hook-form profile form pre-populated from the existing
 * `profiles` row (edit mode) or empty (first-time onboarding). Existing document
 * previews are shown via short-lived (60s) signed URLs generated here on the
 * server; they are never public URLs. The write path (save) is the
 * `saveProfile` server action, which re-validates the whole payload.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Short-lived signed URLs for any documents already uploaded (previews).
  const documentPreviews: Record<string, string | null> = {};
  for (const slot of PROFILE_DOCUMENT_SLOTS) {
    const path = profile?.[slot.column] ?? null;
    if (path) {
      const { data } = await supabase.storage
        .from("profile-documents")
        .createSignedUrl(path, 60);
      documentPreviews[slot.column] = data?.signedUrl ?? null;
    } else {
      documentPreviews[slot.column] = null;
    }
  }

  const defaultValues: ProfileSaveInput = {
    full_name: profile?.full_name ?? "",
    address: profile?.address ?? "",
    city: profile?.city ?? "",
    date_of_birth: profile?.date_of_birth ?? "",
    gender: profile?.gender ?? ("" as ProfileSaveInput["gender"]),
    telephone: profile?.telephone ?? "",
    mobile: profile?.mobile ?? "",
    emergency_contact_name: profile?.emergency_contact_name ?? "",
    emergency_contact_relationship:
      profile?.emergency_contact_relationship ?? "",
    emergency_contact_phone: profile?.emergency_contact_phone ?? "",
    emergency_contact_email: profile?.emergency_contact_email ?? "",
    cnic_front_path: profile?.cnic_front_path ?? "",
    cnic_back_path: profile?.cnic_back_path ?? "",
    photo_path: profile?.photo_path ?? "",
  };

  const isEditing = Boolean(profile);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEditing ? "Your profile" : "Complete your profile"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isEditing
              ? "Keep your details up to date."
              : "We need a few details before you can apply to a course."}
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-8">
        <ProfileForm
          userId={user.id}
          defaultValues={defaultValues}
          documentPreviews={documentPreviews}
          next={next ?? ""}
        />
      </div>
    </main>
  );
}
