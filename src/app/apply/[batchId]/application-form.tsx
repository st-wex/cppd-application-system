"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import {
  CalendarIcon,
  CheckCircle2Icon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TextField, TextareaField } from "@/components/forms";
import type { RequirementsConfig } from "@/lib/types/requirements";
import type { ReferenceEntry } from "@/lib/types/application";
import {
  buildApplicationFilesSchema,
  buildApplicationSchema,
  type ApplicationFileValue,
} from "@/lib/validation";

import { ApplicationUpload } from "./application-upload";
import { submitApplication } from "./actions";

/**
 * The EXACT declaration wording. This single constant is both the checkbox
 * label the applicant sees AND the default `consent_text` sent to the RPC, so
 * the stored consent text always matches the displayed text verbatim (an
 * acceptance requirement).
 */
const DECLARATION_TEXT =
  "I hereby declare that all the information submitted in the form to CPPD is correct to the best of my knowledge";

const HEALTH_QUESTION =
  "Do you have any physical/sensory/psychiatric disability/diagnosis?";
const COUNSELLING_HELPER =
  "If you have any experience in counselling, or of working in a therapeutic environment, please give a summary detail.";

/** Shape of the profile fields shown in the read-only summary card. */
export interface ProfileSummary {
  full_name: string;
  date_of_birth: string;
  gender: string;
  address: string;
  city: string;
  mobile: string;
  telephone: string | null;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
  emergency_contact_email: string;
}

/**
 * Local form-values type. The rendered schema is built dynamically from the
 * course config, so we type the form with an all-optional superset and cast the
 * resolver — every enabled section is validated by the shared zod builder.
 */
interface ApplicationFormValues {
  consent_given: boolean;
  consent_text: string;
  qualifications?: { professional: string; additional?: string };
  employment?: {
    employer_name: string;
    position: string;
    start_date: string;
    employer_address: string;
  };
  counselling_experience?: string;
  health_disclosure?: {
    has_condition: boolean;
    details?: string;
    support_needed?: string;
  };
  medication_allergies?: { medications: string; allergies: string };
  personal_statement?: string;
  references?: ReferenceEntry[];
}

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

function emptyReference(): ReferenceEntry {
  return { name: "", position: "", phone: "", address: "", email: "" };
}

export interface ApplicationFormProps {
  batchId: string;
  userId: string;
  requirements: RequirementsConfig;
  profile: ProfileSummary;
  courseTitle: string;
  batchNumber: string;
}

export function ApplicationForm({
  batchId,
  userId,
  requirements: req,
  profile,
  courseTitle,
  batchNumber,
}: ApplicationFormProps) {
  const router = useRouter();
  const applyHref = `/apply/${batchId}`;
  const editProfileHref = `/profile?next=${encodeURIComponent(applyHref)}`;

  const schema = useMemo(() => buildApplicationSchema(req), [req]);
  const maxRefs = Math.min(req.references.max, 2);
  const minRefs = req.references.min;

  const defaultValues = useMemo<ApplicationFormValues>(() => {
    const dv: ApplicationFormValues = {
      consent_given: false,
      consent_text: DECLARATION_TEXT,
    };
    if (req.qualifications)
      dv.qualifications = { professional: "", additional: "" };
    if (req.employment)
      dv.employment = {
        employer_name: "",
        position: "",
        start_date: "",
        employer_address: "",
      };
    if (req.counselling_experience) dv.counselling_experience = "";
    if (req.health_disclosure)
      dv.health_disclosure = {
        has_condition: false,
        details: "",
        support_needed: "",
      };
    if (req.medication_allergies)
      dv.medication_allergies = { medications: "", allergies: "" };
    if (req.personal_statement) dv.personal_statement = "";
    if (req.references.enabled) {
      const start = Math.min(Math.max(minRefs, 1), maxRefs);
      dv.references = Array.from({ length: start }, emptyReference);
    }
    return dv;
  }, [req, minRefs, maxRefs]);

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<ApplicationFormValues>,
    defaultValues,
    mode: "onBlur",
  });

  const references = useFieldArray({
    control: form.control,
    name: "references",
  });

  // Per-slot upload state (uploads happen inline, independent of submit).
  const [files, setFiles] = useState<Record<string, ApplicationFileValue>>({});
  const [uploadingSlots, setUploadingSlots] = useState<
    Record<string, boolean>
  >({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const anyUploading = Object.values(uploadingSlots).some(Boolean);

  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(
    null
  );
  const [success, setSuccess] = useState<{
    id: string;
    submittedAt: string;
  } | null>(null);

  const consentGiven = useWatch({
    control: form.control,
    name: "consent_given",
  });
  const hasCondition = useWatch({
    control: form.control,
    name: "health_disclosure.has_condition",
  });
  const personalStatement = useWatch({
    control: form.control,
    name: "personal_statement",
  });

  // Warn before leaving with unsaved, in-memory work (there is no draft/save).
  const dirty =
    form.formState.isDirty || Object.keys(files).length > 0;
  useEffect(() => {
    if (!dirty || success) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, success]);

  // Stable per-slot callbacks (identity keyed on the slot set) so each
  // ApplicationUpload's effect doesn't re-fire every render. Functional updates
  // return the previous reference when nothing changed, so React bails out.
  const uploadingHandlers = useMemo(() => {
    const map: Record<string, (uploading: boolean) => void> = {};
    for (const slot of req.uploads) {
      map[slot.key] = (uploading: boolean) =>
        setUploadingSlots((prev) =>
          prev[slot.key] === uploading
            ? prev
            : { ...prev, [slot.key]: uploading }
        );
    }
    return map;
  }, [req.uploads]);

  const fileHandlers = useMemo(() => {
    const map: Record<
      string,
      (value: ApplicationFileValue | null) => void
    > = {};
    for (const slot of req.uploads) {
      map[slot.key] = (value: ApplicationFileValue | null) => {
        setFiles((prev) => {
          const next = { ...prev };
          if (value) next[slot.key] = value;
          else delete next[slot.key];
          return next;
        });
        setFileErrors((prev) => {
          if (!prev[slot.key]) return prev;
          const next = { ...prev };
          delete next[slot.key];
          return next;
        });
      };
    }
    return map;
  }, [req.uploads]);

  function validateFiles(): boolean {
    const list = Object.values(files);
    const parsed = buildApplicationFilesSchema(req, userId).safeParse(list);
    const errs: Record<string, string> = {};
    // Required-but-missing slots (schema reports these with an empty path).
    for (const slot of req.uploads) {
      if (slot.required && !files[slot.key]) {
        errs[slot.key] = "This document is required.";
      }
    }
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path.length === 0) continue; // covered by the required scan
        const idx = issue.path[0];
        if (typeof idx === "number") {
          const key = list[idx]?.requirement_key;
          if (key && !errs[key]) errs[key] = issue.message;
        }
      }
    }
    setFileErrors(errs);
    return Object.keys(errs).length === 0 && parsed.success;
  }

  async function onSubmit(values: ApplicationFormValues) {
    setNotice(null);
    if (!validateFiles()) {
      toast.error("Please attach all required documents.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitApplication({
        batchId,
        payload: { ...values, consent_text: DECLARATION_TEXT },
        files: Object.values(files),
      });

      if (!result.ok) {
        if (result.code === "PT002") {
          toast.error(result.error);
          router.push(editProfileHref);
          return;
        }
        if (
          result.code === "PT003" ||
          result.code === "PT004" ||
          result.code === "PT006"
        ) {
          setNotice({
            title:
              result.code === "PT006"
                ? "Already applied"
                : "Enrolment unavailable",
            body: result.error,
          });
          if (typeof window !== "undefined")
            window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        toast.error(result.error);
        return;
      }

      setSuccess({ id: result.applicationId, submittedAt: result.submittedAt });
      if (typeof window !== "undefined")
        window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-6 text-emerald-600 dark:text-emerald-500" />
            <CardTitle>Application submitted</CardTitle>
          </div>
          <CardDescription>
            Your application is now under review and cannot be edited.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">Reference</dt>
              <dd className="font-mono text-sm">
                {success.id.slice(0, 8).toUpperCase()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Submitted</dt>
              <dd className="text-sm">
                {format(parseISO(success.submittedAt), "d MMM yyyy, HH:mm")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Course</dt>
              <dd className="text-sm">{courseTitle}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Batch</dt>
              <dd className="text-sm">{batchNumber}</dd>
            </div>
          </dl>
          <Button asChild>
            <Link href="/dashboard">Go to your dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {notice ? (
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>{notice.title}</AlertTitle>
            <AlertDescription>
              <p>{notice.body}</p>
              <Link
                href="/dashboard"
                className="text-primary underline underline-offset-4"
              >
                Go to your dashboard
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* intro_text */}
        {req.intro_text ? (
          <div className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
            {req.intro_text}
          </div>
        ) : null}

        {/* Profile summary (read-only) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your details</CardTitle>
            <CardDescription>
              This information is submitted with your application as-is. Need to
              change something?{" "}
              <Link
                href={editProfileHref}
                className="text-primary underline underline-offset-4"
              >
                Edit profile
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <SummaryRow label="Full name" value={profile.full_name} />
              <SummaryRow
                label="Date of birth"
                value={format(parseISO(profile.date_of_birth), "d MMM yyyy")}
              />
              <SummaryRow
                label="Gender"
                value={GENDER_LABELS[profile.gender] ?? profile.gender}
              />
              <SummaryRow label="Mobile" value={profile.mobile} />
              {profile.telephone ? (
                <SummaryRow label="Telephone" value={profile.telephone} />
              ) : null}
              <SummaryRow
                label="Address"
                value={`${profile.address}, ${profile.city}`}
              />
              <SummaryRow
                label="Emergency contact"
                value={`${profile.emergency_contact_name} (${profile.emergency_contact_relationship})`}
              />
              <SummaryRow
                label="Emergency phone"
                value={profile.emergency_contact_phone}
              />
            </dl>
          </CardContent>
        </Card>

        {/* Qualifications */}
        {req.qualifications ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Qualifications</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <TextareaField
                control={form.control}
                name="qualifications.professional"
                label="Professional qualifications"
                placeholder="Degrees, diplomas and professional training relevant to this course."
                rows={4}
              />
              <TextareaField
                control={form.control}
                name="qualifications.additional"
                label="Additional qualifications (optional)"
                placeholder="Any other relevant qualifications or training."
                rows={3}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* Employment */}
        {req.employment ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employment details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="employment.employer_name"
                label="Employer name"
              />
              <TextField
                control={form.control}
                name="employment.position"
                label="Present position"
              />
              <FormField
                control={form.control}
                name="employment.start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Employment start date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon />
                            {field.value
                              ? format(parseISO(field.value), "PPP")
                              : "Select a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            field.value ? parseISO(field.value) : undefined
                          }
                          onSelect={(date) =>
                            field.onChange(
                              date ? format(date, "yyyy-MM-dd") : ""
                            )
                          }
                          captionLayout="dropdown"
                          startMonth={new Date(1960, 0)}
                          defaultMonth={
                            field.value ? parseISO(field.value) : undefined
                          }
                          autoFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="sm:col-span-2">
                <TextareaField
                  control={form.control}
                  name="employment.employer_address"
                  label="Employer address"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Counselling experience */}
        {req.counselling_experience ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Experience in counselling
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TextareaField
                control={form.control}
                name="counselling_experience"
                label="Summary"
                description={COUNSELLING_HELPER}
                rows={5}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* Health disclosure */}
        {req.health_disclosure ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Health disclosure</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <FormField
                control={form.control}
                name="health_disclosure.has_condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{HEALTH_QUESTION}</FormLabel>
                    <FormControl>
                      <RadioGroup
                        className="flex gap-6"
                        value={field.value ? "yes" : "no"}
                        onValueChange={(v) => field.onChange(v === "yes")}
                      >
                        <label className="flex items-center gap-2 text-sm font-normal">
                          <RadioGroupItem value="yes" />
                          Yes
                        </label>
                        <label className="flex items-center gap-2 text-sm font-normal">
                          <RadioGroupItem value="no" />
                          No
                        </label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {hasCondition ? (
                <>
                  <TextareaField
                    control={form.control}
                    name="health_disclosure.details"
                    label="Please give details"
                    rows={3}
                  />
                  <TextareaField
                    control={form.control}
                    name="health_disclosure.support_needed"
                    label="Any support you might need during the program for your facilitation?"
                    rows={3}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Medication & allergies */}
        {req.medication_allergies ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Medication &amp; allergies
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <TextareaField
                control={form.control}
                name="medication_allergies.medications"
                label="Regular medications"
                description="List any medication you take regularly (for longer than one month). Write 'None' if not applicable."
                rows={3}
              />
              <TextareaField
                control={form.control}
                name="medication_allergies.allergies"
                label="Known allergies"
                description="List any known allergies. Write 'None' if not applicable."
                rows={3}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* References */}
        {req.references.enabled ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">References</CardTitle>
              <CardDescription>
                {minRefs === maxRefs
                  ? `Please provide ${maxRefs} reference(s).`
                  : `Please provide between ${minRefs} and ${maxRefs} reference(s).`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              {references.fields.map((fieldItem, index) => (
                <div key={fieldItem.id} className="grid gap-4">
                  {index > 0 ? <Separator /> : null}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Reference {index + 1}
                    </p>
                    {references.fields.length > minRefs ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => references.remove(index)}
                      >
                        <Trash2Icon />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      control={form.control}
                      name={`references.${index}.name`}
                      label="Name"
                    />
                    <TextField
                      control={form.control}
                      name={`references.${index}.position`}
                      label="Position (optional)"
                    />
                    <TextField
                      control={form.control}
                      name={`references.${index}.phone`}
                      label="Phone"
                      type="tel"
                    />
                    <TextField
                      control={form.control}
                      name={`references.${index}.email`}
                      label="Email"
                      type="email"
                    />
                    <div className="sm:col-span-2">
                      <TextField
                        control={form.control}
                        name={`references.${index}.address`}
                        label="Address (optional)"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {references.fields.length < maxRefs ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => references.append(emptyReference())}
                  >
                    <PlusIcon />
                    Add reference
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Personal statement */}
        {req.personal_statement ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal statement</CardTitle>
            </CardHeader>
            <CardContent>
              <TextareaField
                control={form.control}
                name="personal_statement"
                label="Your statement"
                description="Tell us why you want to take this course, your motivations, and what you hope to gain. Aim for roughly 300–800 words."
                rows={10}
              />
              <p className="text-muted-foreground mt-2 text-xs">
                {(personalStatement ?? "").length} characters
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* Document uploads */}
        {req.uploads.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>
                Upload a file or take a photo. Uploads are saved as you add them.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              {req.uploads.map((slot) => (
                <div key={slot.key} className="grid gap-2">
                  {slot.instructions ? (
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {slot.instructions}
                    </p>
                  ) : null}
                  <ApplicationUpload
                    slot={slot}
                    userId={userId}
                    value={files[slot.key] ?? null}
                    onChange={fileHandlers[slot.key]!}
                    onUploadingChange={uploadingHandlers[slot.key]!}
                    invalid={Boolean(fileErrors[slot.key])}
                  />
                  {fileErrors[slot.key] ? (
                    <p className="text-destructive text-sm">
                      {fileErrors[slot.key]}
                    </p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Declaration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Declaration</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="consent_given"
              render={({ field }) => (
                <FormItem>
                  <label className="flex items-start gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        className="mt-0.5"
                      />
                    </FormControl>
                    <span className="text-sm leading-relaxed">
                      {DECLARATION_TEXT}
                    </span>
                  </label>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {anyUploading ? (
            <p className="text-muted-foreground text-sm">
              Waiting for uploads to finish…
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            disabled={submitting || anyUploading || !consentGiven}
          >
            {submitting ? <Loader2Icon className="animate-spin" /> : null}
            Submit application
          </Button>
        </div>
      </form>
    </Form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
