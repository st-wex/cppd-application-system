# CPPD Application System

Course application system for **CPPD Pakistan**, a therapy training institute.
Students register, complete a profile, and apply to course batches. Staff manage
applications in **Directus**. The backend is a **self-hosted Supabase** stack
(Postgres, Auth, Storage).

> **Conventions & security rules live in [`CLAUDE.md`](./CLAUDE.md) — read it
> before contributing.**

## Stack

- Next.js 16 (App Router, React 19), TypeScript (strict), Node **>= 24**
- Tailwind CSS v4 + shadcn/ui
- Supabase (`@supabase/ssr`), react-hook-form + zod
- Deployed as Docker via Komodo, behind a Cloudflare Tunnel

## Getting started

```bash
nvm use            # Node 24 (see .nvmrc)
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

Open http://localhost:3000.

## Environment

Copy `.env.example` to `.env.local` and set every variable. They are validated
fail-fast at startup by `src/lib/env.ts`. **Never commit secrets.**
`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to the
client or prefixed with `NEXT_PUBLIC_`.

## Scripts

| Script                 | Purpose                             |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | Start the dev server                |
| `npm run build`        | Production build (zero type errors) |
| `npm run start`        | Serve the production build          |
| `npm run typecheck`    | `tsc --noEmit`                      |
| `npm run lint`         | ESLint                              |
| `npm run format`       | Prettier (write)                    |
| `npm run format:check` | Prettier (check)                    |

## Database

The database schema is owned by this repo. **All schema changes go through SQL
files in [`supabase/migrations/`](./supabase/migrations)** — Directus must never
create or alter tables. See `CLAUDE.md` for the full security model (RLS on every
table, append-only applications, the `submit_application` RPC, private storage).

## Project layout

```
src/app                 Routes (App Router)
src/components/ui        shadcn/ui components
src/components/forms     Form building blocks (react-hook-form + zod)
src/lib/supabase         Browser / server / proxy / admin Supabase clients
src/lib/validation       Zod schemas (shared client + server)
src/lib/types            Shared TypeScript types
src/lib/env.ts           Fail-fast environment validation
src/proxy.ts             Next.js proxy (Supabase session refresh)
supabase/migrations      SQL migrations (single source of truth for schema)
```
