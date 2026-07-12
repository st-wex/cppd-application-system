import { z } from "zod";

/**
 * Zod schema for the /login magic-link email field.
 *
 * SECURITY (see CLAUDE.md): enforced BOTH client-side (in the login form, for
 * UX) AND server-side (the `sendMagicLink` server action, the security
 * boundary). The client check is never trusted on its own.
 */
export const loginEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .pipe(z.email("Enter a valid email address.")),
});

export type LoginEmailInput = z.infer<typeof loginEmailSchema>;
