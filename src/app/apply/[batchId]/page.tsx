import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeftIcon, CalendarDaysIcon, InfoIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/auth/profile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RequirementsConfig } from "@/lib/types/requirements";

import { ApplicationForm, type ProfileSummary } from "./application-form";

// Auth + live availability: never cache.
export const dynamic = "force-dynamic";

function ClosedNotice({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <BackToCourses />
      <Alert className="mt-6">
        <InfoIcon />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{body}</p>
          <Link
            href="/courses"
            className="text-primary underline underline-offset-4"
          >
            Browse other courses
          </Link>
        </AlertDescription>
      </Alert>
    </main>
  );
}

function BackToCourses() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/courses">
        <ArrowLeftIcon />
        Back to courses
      </Link>
    </Button>
  );
}

export default async function ApplyBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const applyHref = `/apply/${batchId}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(applyHref)}`);
  }

  // Incomplete profile → onboarding first (mirrors the RPC's PT002 gate), while
  // preserving where they were headed so they return here after saving.
  const destination = await resolvePostLoginPath(supabase, user.id, applyHref);
  if (destination !== applyHref) {
    redirect(`/profile?next=${encodeURIComponent(applyHref)}`);
  }

  // RLS returns the batch only if published; the course only if active.
  const { data: batch } = await supabase
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return (
      <ClosedNotice
        title="Enrolment closed"
        body="This batch isn't open for applications. It may have closed or is no longer available."
      />
    );
  }

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", batch.course_id)
    .maybeSingle();

  if (!course) {
    return (
      <ClosedNotice
        title="Course unavailable"
        body="This course isn't currently accepting applications."
      />
    );
  }

  // The server decides openness (enrolment window + capacity) — not the client.
  const { data: availability } = await supabase.rpc("batch_availability", {
    p_batch_id: batchId,
  });
  const isOpen = availability?.[0]?.is_open ?? false;

  if (!isOpen) {
    return (
      <ClosedNotice
        title="Enrolment closed"
        body="Enrolment for this batch is closed — the window may have ended or all places are taken."
      />
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Should be unreachable (gate above), but never render a doomed form.
    redirect(`/profile?next=${encodeURIComponent(applyHref)}`);
  }

  const summary: ProfileSummary = {
    full_name: profile.full_name,
    date_of_birth: profile.date_of_birth,
    gender: profile.gender,
    address: profile.address,
    city: profile.city,
    mobile: profile.mobile,
    telephone: profile.telephone,
    emergency_contact_name: profile.emergency_contact_name,
    emergency_contact_relationship: profile.emergency_contact_relationship,
    emergency_contact_phone: profile.emergency_contact_phone,
    emergency_contact_email: profile.emergency_contact_email,
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <BackToCourses />
      <div className="mt-4 mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Apply — {course.title}
        </h1>
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CalendarDaysIcon className="size-4 shrink-0" />
          {batch.batch_number} · classes start{" "}
          {format(parseISO(batch.class_start), "d MMM yyyy")}
        </p>
      </div>

      <ApplicationForm
        batchId={batchId}
        userId={user.id}
        requirements={course.requirements as RequirementsConfig}
        profile={summary}
        courseTitle={course.title}
        batchNumber={batch.batch_number}
      />
    </main>
  );
}
