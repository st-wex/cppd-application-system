"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { CircleAlertIcon, MailCheckIcon, MailIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { loginEmailSchema } from "@/lib/validation/auth";

import {
  sendMagicLink,
  signInWithGoogle,
  type MagicLinkState,
} from "./actions";

/** Human-readable copy for the error codes the auth routes redirect with. */
const ERROR_MESSAGES: Record<string, string> = {
  expired:
    "That sign-in link has expired or already been used. Request a new one below.",
  oauth:
    "We couldn't sign you in with Google. Please try again, or use a magic link instead.",
};

const initialMagicLinkState: MagicLinkState = { status: "idle" };

export function LoginForm({
  next,
  errorCode,
}: {
  next: string;
  errorCode: string | null;
}) {
  const routeError = errorCode ? ERROR_MESSAGES[errorCode] : null;

  const [state, formAction] = useActionState(
    sendMagicLink,
    initialMagicLinkState
  );
  // Client-side validation error (UX only — the server action re-validates).
  const [clientError, setClientError] = useState<string | null>(null);
  const [resend, setResend] = useState(false);

  const showSent = state.status === "sent" && !resend;

  function handleMagicLinkSubmit(event: React.FormEvent<HTMLFormElement>) {
    const email = new FormData(event.currentTarget).get("email")?.toString();
    const parsed = loginEmailSchema.safeParse({ email });
    if (!parsed.success) {
      event.preventDefault();
      setClientError(
        parsed.error.issues[0]?.message ?? "Enter a valid email address."
      );
      return;
    }
    setClientError(null);
    setResend(false);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <Image
          src="/logo.png"
          alt="CPPD Pakistan logo"
          width={48}
          height={48}
          className="mx-auto rounded-md"
          priority
        />
        <CardTitle className="mt-3 text-xl">Sign in to CPPD Pakistan</CardTitle>
        <CardDescription>
          Continue with Google or receive a magic link by email.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {routeError ? <Alert>{routeError}</Alert> : null}

        {showSent ? (
          <MagicLinkSent
            email={state.email}
            onUseDifferentEmail={() => setResend(true)}
          />
        ) : (
          <>
            {/* Google OAuth */}
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next} />
              <GoogleButton />
            </form>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">or</span>
              <Separator className="flex-1" />
            </div>

            {/* Magic link */}
            <form
              action={formAction}
              onSubmit={handleMagicLinkSubmit}
              className="flex flex-col gap-3"
              noValidate
            >
              <input type="hidden" name="next" value={next} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={
                    clientError || state.status === "error" ? true : undefined
                  }
                  onChange={() => {
                    if (clientError) setClientError(null);
                  }}
                />
                {clientError || state.status === "error" ? (
                  <p className="text-destructive text-sm">
                    {clientError ?? state.message}
                  </p>
                ) : null}
              </div>
              <MagicLinkButton />
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full"
      disabled={pending}
    >
      <GoogleIcon />
      {pending ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}

function MagicLinkButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <MailIcon />
      {pending ? "Sending…" : "Send magic link"}
    </Button>
  );
}

function MagicLinkSent({
  email,
  onUseDifferentEmail,
}: {
  email?: string;
  onUseDifferentEmail: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <div className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-full">
        <MailCheckIcon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">Check your email</p>
        <p className="text-muted-foreground text-sm">
          {email ? (
            <>
              We sent a sign-in link to{" "}
              <span className="font-medium">{email}</span>. Open it on this
              device to continue.
            </>
          ) : (
            "We sent you a sign-in link. Open it on this device to continue."
          )}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onUseDifferentEmail}>
        Use a different email
      </Button>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
