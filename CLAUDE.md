# CPPD Application System — Project Conventions

Course application system for **CPPD Pakistan**, a therapy training institute.
Students register, complete a profile, and apply to course batches. Admins
manage applications in Directus. This file is the source of truth for
conventions — read it before making changes.

> **Next.js note:** this project uses Next.js 16 (App Router). APIs differ from
> older versions — e.g. `middleware.ts` is now `proxy.ts`, `cookies()` is async.
> See `AGENTS.md` and `node_modules/next/dist/docs/` when unsure.

## Stack & Architecture

- **Frontend:** Next.js 16 (App Router, React 19), TypeScript **strict**,
  Tailwind CSS v4, shadcn/ui. Node **>= 24** (see `.nvmrc` / `engines`).
- **Backend:** self-hosted **Supabase** (Postgres, Auth, Storage). Access from
  the app via `@supabase/ssr` cookie-based clients.
- **Admin:** **Directus** runs over the **same Postgres** as Supabase, used by
  staff to review/manage applications. Directus is read/write on data **but
  MUST NEVER create or alter tables** — see schema rule below.
- **Deployment:** Docker images orchestrated by **Komodo**, exposed to the
  public via a **Cloudflare Tunnel** (`NEXT_PUBLIC_SITE_URL`).

```
Browser ──▶ Next.js (SSR/Server Actions) ──▶ Supabase (Postgres + Auth + Storage)
                                                  ▲
Staff  ──▶ Directus (admin UI) ───────────────────┘  (same Postgres, data only)
```

## SECURITY RULES (non-negotiable)

1. **RLS everywhere.** Every table has Row Level Security **enabled** with
   explicit policies. No table is ever left unprotected.
2. **Applications are append-only for users.** Users can **never `UPDATE` or
   `DELETE`** applications. There are no user-facing update/delete policies.
3. **Inserts go through the RPC only.** Application inserts happen **only**
   through the `submit_application` **`SECURITY DEFINER`** RPC — never via a
   direct client `insert` into the `applications` table.
4. **Storage is private.** All storage buckets are **private**. Files are served
   **only** via **short-lived signed URLs** — never public URLs, never by
   embedding the service key.
5. **Service role key is server-only.** `SUPABASE_SERVICE_ROLE_KEY` is **never**
   imported into client components and **never** exposed via `NEXT_PUBLIC_*`.
   It lives only in server code (see `src/lib/supabase/admin.ts`, which is
   `import "server-only"`).
6. **No PII in logs or errors.** Never log or surface names, CNIC, CNIC file
   paths, health data, or other PII in `console.*` output or error messages.

## Database & Schema

- **Schema changes happen ONLY via SQL files in `supabase/migrations/`.** This
  repo is the **single source of truth** for the database schema. Directus (or
  anyone) must never create or alter tables — do it here, in a new numbered
  migration, and apply it.
- Keep `src/lib/types` in sync with the SQL (or regenerate with
  `supabase gen types typescript`).
- Migrations live in `supabase/migrations/` as ordered files
  `0001_init.sql` … `0007_storage.sql`; they must apply cleanly, in order, to a
  fresh database. `supabase/tests/rls_test.sql` is a repeatable RLS/RPC
  acceptance script — run it against the DB after schema changes.

### TODO — orphaned upload cleanup

Files in the private `application-uploads` bucket are **immutable** (users can
INSERT + SELECT but never UPDATE/DELETE), so a user cannot swap or remove a file
a submitted application may reference. Files uploaded for an application that is
then **abandoned** (never submitted via `submit_application`) are therefore left
orphaned. A separate **admin job** should periodically delete
`application-uploads` objects that are not referenced by any
`application_files.storage_path`. This job is not yet implemented.

## Forms & Validation

- Forms use **react-hook-form + zod** (`@hookform/resolvers/zod`).
- **Every zod schema is enforced BOTH client-side and server-side.** Client
  validation is UX only; **server validation (Server Actions / RPC) is the
  security boundary.** Share the same schema from `src/lib/validation` on both
  sides — never trust the client.
- Reusable field building blocks live in `src/components/forms`.

## UI

- Use **shadcn/ui** components from `src/components/ui`. Compose, don't fork.
- Keep styling consistent; use the design tokens in `src/app/globals.css` and
  the `cn()` helper (`src/lib/utils.ts`). Icons: `lucide-react`.

## Environment

- All env vars are validated fail-fast in `src/lib/env.ts`. Public vars via
  `env`; server-only via `serverEnv()` (guarded against client use).
- Document every variable in `.env.example`. Never commit real secrets.

## Project Layout

```
src/app                 Routes (App Router)
src/components/ui        shadcn/ui components
src/components/forms     Form building blocks (RHF + zod)
src/lib/supabase         client.ts (browser), server.ts (RSC/actions),
                         middleware.ts (session refresh), admin.ts (server-only)
src/lib/validation       Zod schemas (shared client + server)
src/lib/types            Shared TypeScript types
src/lib/env.ts           Fail-fast env validation
src/proxy.ts             Next.js proxy (session refresh)
supabase/migrations      SQL migrations — single source of truth for schema
```

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build (must pass with zero type errors)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint
- `npm run format` / `format:check` — Prettier
