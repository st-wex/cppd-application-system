import { env } from "@/lib/env";

/**
 * Where authenticated users land when no explicit `next` is requested.
 */
export const DEFAULT_AUTHED_PATH = "/dashboard";

/**
 * Route prefixes that require an authenticated user. Kept here so the proxy
 * (session refresh + guard) and any server-side checks share one definition.
 */
export const PROTECTED_PREFIXES = ["/dashboard", "/profile", "/apply"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Validate a `next` redirect target so it can ONLY ever point back into this
 * app — never off-origin. This is the open-redirect guard used by /login,
 * /auth/callback and /auth/confirm.
 *
 * A value is accepted only if it is a same-origin relative path:
 * - must start with a single "/" (rejects "https://evil.com", "mailto:…")
 * - must NOT start with "//" or "/\\" (rejects protocol-relative "//evil.com")
 * - must parse to the same origin as a throwaway base (double-checks the above)
 *
 * Anything else falls back to {@link DEFAULT_AUTHED_PATH}. The returned value is
 * always a path (pathname + search + hash), never absolute.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_AUTHED_PATH
): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;

  try {
    // Resolve against an opaque base; a truly relative path keeps this origin.
    const base = "http://localhost";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Build an absolute URL on the app's PUBLIC origin (the Cloudflare Tunnel URL
 * from NEXT_PUBLIC_SITE_URL). Used for every auth redirect so links resolve to
 * the tunnel domain rather than an internal request host — never hardcode hosts.
 */
export function siteUrl(path: string): string {
  return new URL(path, env.NEXT_PUBLIC_SITE_URL).toString();
}
