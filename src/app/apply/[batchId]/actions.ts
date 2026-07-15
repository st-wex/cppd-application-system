"use server";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";
import {
  SUBMIT_ERROR_CODES,
  type SubmitErrorCode,
} from "@/lib/types/application";
import type { RequirementsConfig } from "@/lib/types/requirements";
import {
  buildApplicationSchema,
  buildApplicationFilesSchema,
  type ApplicationFileValue,
} from "@/lib/validation";

/**
 * Server action backing /apply/[batchId].
 *
 * SECURITY (see CLAUDE.md):
 * - This is the write-side security boundary alongside the RPC. It re-validates
 *   the WHOLE payload + file manifest with the SAME dynamic zod builders the
 *   client uses (never trusting the client), then submits through the
 *   `submit_application` SECURITY DEFINER RPC — the only insert path for
 *   applications. There is never a direct client insert.
 * - Runs under the caller's RLS-scoped session, so the RPC sees `auth.uid()`.
 * - No PII is logged or returned in error strings; only mapped, generic
 *   messages + a machine code for branching.
 */

const ERROR_MESSAGES: Record<SubmitErrorCode, string> = {
  PT001: "Your session has expired. Please sign in again.",
  PT002: "Please complete your profile before applying.",
  PT003: "Enrolment for this batch is closed.",
  PT004: "This batch is now full.",
  PT005: "Please review your answers and try again.",
  PT006: "You have already applied to this batch.",
  PT007: "You must agree to the declaration to submit.",
};

const CODE_SET = new Set<string>(Object.values(SUBMIT_ERROR_CODES));

function isSubmitErrorCode(code: unknown): code is SubmitErrorCode {
  return typeof code === "string" && CODE_SET.has(code);
}

export interface SubmitApplicationInput {
  batchId: string;
  payload: unknown;
  files: ApplicationFileValue[];
}

export type SubmitApplicationResult =
  | {
      ok: true;
      applicationId: string;
      submittedAt: string;
    }
  | {
      ok: false;
      code: SubmitErrorCode | "UNKNOWN";
      error: string;
    };

export async function submitApplication(
  input: SubmitApplicationInput
): Promise<SubmitApplicationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, code: "PT001", error: ERROR_MESSAGES.PT001 };
  }

  // Resolve the course requirements for this batch (RLS returns it only when the
  // batch is published + the course active). This drives the same validation the
  // RPC runs.
  const { data: batch } = await supabase
    .from("batches")
    .select("id, course_id")
    .eq("id", input.batchId)
    .maybeSingle();

  if (!batch) {
    return { ok: false, code: "PT003", error: ERROR_MESSAGES.PT003 };
  }

  const { data: course } = await supabase
    .from("courses")
    .select("requirements")
    .eq("id", batch.course_id)
    .maybeSingle();

  if (!course) {
    return { ok: false, code: "PT003", error: ERROR_MESSAGES.PT003 };
  }

  const req = course.requirements as RequirementsConfig;

  // Re-validate the payload + files with the shared builders (the boundary).
  const payloadParsed = buildApplicationSchema(req).safeParse(input.payload);
  if (!payloadParsed.success) {
    return { ok: false, code: "PT005", error: ERROR_MESSAGES.PT005 };
  }

  const filesParsed = buildApplicationFilesSchema(req, user.id).safeParse(
    input.files
  );
  if (!filesParsed.success) {
    return { ok: false, code: "PT005", error: ERROR_MESSAGES.PT005 };
  }

  // Submit through the only write path.
  const { data: applicationId, error } = await supabase.rpc(
    "submit_application",
    {
      p_batch_id: input.batchId,
      p_payload: payloadParsed.data as unknown as Json,
      p_files: filesParsed.data as unknown as Json,
    }
  );

  if (error) {
    const code = isSubmitErrorCode(error.code) ? error.code : "UNKNOWN";
    return {
      ok: false,
      code,
      error:
        code === "UNKNOWN"
          ? "We couldn't submit your application. Please try again in a moment."
          : ERROR_MESSAGES[code],
    };
  }

  if (!applicationId) {
    return {
      ok: false,
      code: "UNKNOWN",
      error: "We couldn't submit your application. Please try again in a moment.",
    };
  }

  // Read back the authoritative submitted_at for the success screen (RLS: own).
  const { data: submitted } = await supabase
    .from("applications")
    .select("submitted_at")
    .eq("id", applicationId)
    .maybeSingle();

  return {
    ok: true,
    applicationId,
    submittedAt: submitted?.submitted_at ?? new Date().toISOString(),
  };
}
