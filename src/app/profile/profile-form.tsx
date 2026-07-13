"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO, subYears } from "date-fns";
import {
  CalendarIcon,
  CheckCircle2Icon,
  CircleIcon,
  InfoIcon,
  Loader2Icon,
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
import {
  Form,
  FormControl,
  FormDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/forms";
import {
  MIN_AGE,
  PROFILE_DOCUMENT_SLOTS,
  buildProfileSchema,
  type ProfileSaveInput,
} from "@/lib/validation";

import { DocumentUpload } from "./document-upload";
import { saveProfile } from "./actions";

const GENDER_OPTIONS: { value: ProfileSaveInput["gender"]; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export interface ProfileFormProps {
  userId: string;
  defaultValues: ProfileSaveInput;
  /** Pre-existing document preview URLs keyed by profiles column. */
  documentPreviews: Record<string, string | null>;
  next: string;
}

export function ProfileForm({
  userId,
  defaultValues,
  documentPreviews,
  next,
}: ProfileFormProps) {
  const router = useRouter();
  const schema = useMemo(() => buildProfileSchema(userId), [userId]);
  const maxBirthDate = useMemo(() => subYears(new Date(), MIN_AGE), []);

  const form = useForm<ProfileSaveInput>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  });

  const [submitting, setSubmitting] = useState(false);
  const [uploadingSlots, setUploadingSlots] = useState<Record<string, boolean>>(
    {}
  );
  const anyUploading = Object.values(uploadingSlots).some(Boolean);

  const makeUploadingHandler = useCallback(
    (key: string) => (uploading: boolean) =>
      setUploadingSlots((prev) => ({ ...prev, [key]: uploading })),
    []
  );

  const values = useWatch({ control: form.control });
  const filled = (v?: string | null) => Boolean(v && v.trim().length > 0);

  const checklist = [
    {
      label: "Personal details",
      done:
        filled(values.full_name) &&
        filled(values.date_of_birth) &&
        filled(values.gender) &&
        filled(values.address) &&
        filled(values.city),
    },
    { label: "Contact number", done: filled(values.mobile) },
    {
      label: "Emergency contact",
      done:
        filled(values.emergency_contact_name) &&
        filled(values.emergency_contact_relationship) &&
        filled(values.emergency_contact_phone) &&
        filled(values.emergency_contact_email),
    },
    ...PROFILE_DOCUMENT_SLOTS.map((slot) => ({
      label: slot.label,
      done: filled(values[slot.column]),
    })),
  ];
  const remaining = checklist.filter((item) => !item.done);

  async function onSubmit(input: ProfileSaveInput) {
    setSubmitting(true);
    try {
      const result = await saveProfile(input, next);
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [name, message] of Object.entries(result.fieldErrors)) {
            form.setError(name as keyof ProfileSaveInput, {
              type: "server",
              message,
            });
          }
        }
        toast.error(result.error);
        return;
      }
      toast.success("Profile saved.");
      router.push(result.redirectTo);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Note: edits never rewrite already-submitted applications. */}
        <div className="border-input bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border px-4 py-3 text-sm">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            Changes to your profile do not affect applications you have already
            submitted.
          </p>
        </div>

        {/* Completion summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completion</CardTitle>
            <CardDescription>
              {remaining.length === 0
                ? "Everything's here — you're ready to save."
                : `${remaining.length} item(s) still needed before you can save.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {checklist.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-sm"
                >
                  {item.done ? (
                    <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-500" />
                  ) : (
                    <CircleIcon className="text-muted-foreground/50 size-4" />
                  )}
                  <span
                    className={cn(
                      item.done
                        ? "text-muted-foreground"
                        : "text-foreground font-medium"
                    )}
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Personal details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                control={form.control}
                name="full_name"
                label="Full name"
                autoComplete="name"
                placeholder="e.g. Ayesha Khan"
              />
            </div>

            <FormField
              control={form.control}
              name="date_of_birth"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date of birth</FormLabel>
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
                            : "Select your date of birth"}
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
                          field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                        }
                        captionLayout="dropdown"
                        startMonth={new Date(1920, 0)}
                        endMonth={maxBirthDate}
                        defaultMonth={
                          field.value ? parseISO(field.value) : maxBirthDate
                        }
                        disabled={{ after: maxBirthDate }}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    You must be at least {MIN_AGE} years old.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GENDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="House / street / area"
                      autoComplete="street-address"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="sm:max-w-xs">
              <TextField
                control={form.control}
                name="city"
                label="City"
                autoComplete="address-level2"
                placeholder="e.g. Karachi"
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="mobile"
              label="Mobile number"
              type="tel"
              autoComplete="tel"
              placeholder="+92 3xx xxxxxxx"
            />
            <TextField
              control={form.control}
              name="telephone"
              label="Telephone (optional)"
              type="tel"
              autoComplete="tel"
              placeholder="Landline, if any"
            />
          </CardContent>
        </Card>

        {/* Emergency contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Emergency contact</CardTitle>
            <CardDescription>
              Someone we can reach if we cannot reach you.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="emergency_contact_name"
              label="Name"
              autoComplete="name"
              placeholder="Full name"
            />
            <TextField
              control={form.control}
              name="emergency_contact_relationship"
              label="Relationship"
              placeholder="e.g. Parent, Sibling, Spouse"
            />
            <TextField
              control={form.control}
              name="emergency_contact_phone"
              label="Phone"
              type="tel"
              autoComplete="tel"
              placeholder="+92 3xx xxxxxxx"
            />
            <TextField
              control={form.control}
              name="emergency_contact_email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
            />
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>
              Upload a file or take a photo. Images are compressed
              automatically; max 10MB per file.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {PROFILE_DOCUMENT_SLOTS.map((slot) => (
              <FormField
                key={slot.key}
                control={form.control}
                name={slot.column}
                render={({ field, fieldState }) => (
                  <FormItem>
                    <DocumentUpload
                      slot={slot}
                      userId={userId}
                      value={field.value ?? ""}
                      initialSignedUrl={documentPreviews[slot.column] ?? null}
                      onChange={field.onChange}
                      onUploadingChange={makeUploadingHandler(slot.key)}
                      invalid={!!fieldState.error}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {anyUploading ? (
            <p className="text-muted-foreground text-sm">
              Waiting for uploads to finish…
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={submitting || anyUploading}>
            {submitting ? <Loader2Icon className="animate-spin" /> : null}
            Save profile
          </Button>
        </div>
      </form>
    </Form>
  );
}
