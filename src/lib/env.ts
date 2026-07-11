import { z } from "zod";

/**
 * Centralised, fail-fast environment validation.
 *
 * - `env`        -> public variables (safe on the client, inlined by Next.js via
 *                   the `NEXT_PUBLIC_` prefix). Validated eagerly at module load.
 * - `serverEnv()` -> server-only variables (e.g. the Supabase service-role key).
 *                   Guarded so it can NEVER run on the client and is only read
 *                   inside server code. See CLAUDE.md security rules.
 *
 * Validation errors are aggregated and thrown with a clear message so a
 * misconfigured deployment fails immediately rather than at first use.
 */

function formatIssues(context: string, error: z.ZodError): never {
  const lines = error.issues.map(
    (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`
  );
  throw new Error(
    `Invalid ${context} environment variables:\n${lines.join("\n")}\n` +
      "Check your .env file against .env.example."
  );
}

// ---------------------------------------------------------------------------
// Public (client-safe) environment
// ---------------------------------------------------------------------------

const publicSchema = z.object({
  // Base URL of the self-hosted Supabase instance.
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  // Supabase anon (publishable) key — safe to expose to the browser.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Public origin of the app (the Cloudflare Tunnel URL). Used for redirects.
  NEXT_PUBLIC_SITE_URL: z.url(),
});

const publicParsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!publicParsed.success) {
  formatIssues("public", publicParsed.error);
}

export const env = publicParsed.data;

// ---------------------------------------------------------------------------
// Server-only environment
// ---------------------------------------------------------------------------

const serverSchema = z.object({
  // Full-access service-role key. NEVER expose to the client or prefix with
  // NEXT_PUBLIC_. Only used by trusted server code (e.g. signed-URL issuance).
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

type ServerEnv = z.infer<typeof serverSchema>;

let serverEnvCache: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() was called on the client. Server-only secrets must never reach the browser."
    );
  }

  if (serverEnvCache) return serverEnvCache;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    formatIssues("server", parsed.error);
  }

  serverEnvCache = parsed.data;
  return serverEnvCache;
}
