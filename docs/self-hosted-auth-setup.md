# Self-hosted Supabase Auth — setup for CPPD Application System

This app authenticates against a **self-hosted Supabase** stack (GoTrue for auth)
using `@supabase/ssr` cookie sessions. It runs **behind a Cloudflare Tunnel**, so
the public URL differs from `localhost` and from the internal container host. The
Next.js app reads its public origin from **`NEXT_PUBLIC_SITE_URL`** and never
hardcodes a host; GoTrue must be configured to match.

Two supported sign-in flows:

- **Google OAuth** → returns to `https://<tunnel-domain>/auth/callback`
- **Magic link (email OTP)** → returns to `https://<tunnel-domain>/auth/confirm`

All values below are **placeholders** — replace every `<FILL IN>` with your real
value. Do **not** commit real secrets.

> Notation: `<tunnel-domain>` is the public hostname of the app served through
> the Cloudflare Tunnel (the host portion of `NEXT_PUBLIC_SITE_URL`), e.g.
> `apply.cppd.example`. `<supabase-domain>` is the public hostname of the
> Supabase gateway (Kong), i.e. the host portion of `NEXT_PUBLIC_SUPABASE_URL`.

---

## 1. Next.js app environment (`.env.local`)

These are already documented in `.env.example`; repeated here for context. They
are what the app itself needs — the rest of this document configures GoTrue.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<supabase-domain>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<FILL IN — Supabase anon/publishable key>
NEXT_PUBLIC_SITE_URL=https://<tunnel-domain>
SUPABASE_SERVICE_ROLE_KEY=<FILL IN — service role key, SERVER ONLY>
```

---

## 2. GoTrue site URL & redirect allow-list

GoTrue only issues sessions and honours redirects for URLs it has been told to
trust. Because we run behind the tunnel, **`GOTRUE_SITE_URL` must be the public
tunnel URL**, not `localhost`.

```dotenv
# Public base URL of the app (the Cloudflare Tunnel URL). Must equal the app's
# NEXT_PUBLIC_SITE_URL.
GOTRUE_SITE_URL=https://<tunnel-domain>

# Every post-auth redirect target the app uses must be allow-listed. Depending
# on your GoTrue version the variable is GOTRUE_URI_ALLOW_LIST (comma-separated)
# and/or ADDITIONAL_REDIRECT_URLS. Set BOTH to be safe; keep them identical.
GOTRUE_URI_ALLOW_LIST=https://<tunnel-domain>/auth/callback,https://<tunnel-domain>/auth/confirm
ADDITIONAL_REDIRECT_URLS=https://<tunnel-domain>/auth/callback,https://<tunnel-domain>/auth/confirm
```

Notes:

- The app validates the `next` redirect target itself and rejects any
  off-origin value (open-redirect protection), but the allow-list is GoTrue's
  own independent check — both must pass.
- If you also test locally without the tunnel, append your local callback/confirm
  URLs (e.g. `http://localhost:3000/auth/callback`) to the same lists. Do not add
  them in production.

---

## 3. Google OAuth

### 3a. Google Cloud Console

Create an **OAuth 2.0 Client ID** (type: _Web application_) and add **exactly one**
authorized redirect URI — the **Supabase GoTrue callback on the tunnel/Supabase
domain**, _not_ the app's `/auth/callback`:

```
Authorized redirect URI (Google Cloud Console):
  https://<supabase-domain>/auth/v1/callback
```

> Google redirects to GoTrue's `/auth/v1/callback`; GoTrue then redirects back to
> the app's `/auth/callback` (which is why the app URL is in the allow-list
> above, and the Supabase URL is what Google needs).

Copy the generated **Client ID** and **Client secret**.

### 3b. GoTrue environment

```dotenv
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<FILL IN — Google OAuth Client ID>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<FILL IN — Google OAuth Client secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://<supabase-domain>/auth/v1/callback
```

`GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` must match the Authorized redirect URI you
entered in Google Cloud Console (3a) **character for character**.

---

## 4. Email (magic link) via Amazon SES SMTP

Magic links are emailed by GoTrue over SMTP. We use **Amazon SES**.

```dotenv
GOTRUE_SMTP_HOST=email-smtp.<region>.amazonaws.com   # e.g. email-smtp.eu-west-1.amazonaws.com
GOTRUE_SMTP_PORT=587                                  # STARTTLS
GOTRUE_SMTP_USER=<FILL IN — SES SMTP username>        # SES SMTP credential, NOT your AWS access key
GOTRUE_SMTP_PASS=<FILL IN — SES SMTP password>        # SES SMTP credential
GOTRUE_SMTP_ADMIN_EMAIL=<FILL IN — verified sender, e.g. no-reply@cppd.example>
GOTRUE_SMTP_SENDER_NAME=CPPD Pakistan
```

SES prerequisites (do these in the AWS console, not in env):

- The **sender domain (or address)** in `GOTRUE_SMTP_ADMIN_EMAIL` must be
  **verified in SES** (`<FILL IN — sender domain>`), with the appropriate DKIM /
  SPF records published.
- The SES account must be **out of the sandbox** (request production access);
  in the sandbox SES only delivers to pre-verified recipients, so real
  applicants would never receive their link.
- `GOTRUE_SMTP_USER` / `GOTRUE_SMTP_PASS` are **SES SMTP credentials** (generated
  under SES → SMTP settings) — these are different from your AWS access
  key/secret.

---

## 5. Mailer templates (branded "CPPD Pakistan")

Point the magic-link and confirmation templates at the app's **`/auth/confirm`**
route, using GoTrue's `{{ .TokenHash }}` so the link carries `token_hash` + `type`
(what `/auth/confirm` verifies with `verifyOtp`).

```dotenv
GOTRUE_MAILER_SUBJECTS_MAGIC_LINK=Your CPPD Pakistan sign-in link
GOTRUE_MAILER_SUBJECTS_CONFIRMATION=Confirm your CPPD Pakistan email

# Template URLs — self-hosted GoTrue reads these from files or inline env,
# depending on your image. If using URL-based templates:
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=<FILL IN — URL to magic_link.html, optional>
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=<FILL IN — URL to confirmation.html, optional>
```

**Magic link** template body (`magic_link.html`):

```html
<h2>Sign in to CPPD Pakistan</h2>
<p>
  Click the button below to sign in. This link can only be used once and expires
  shortly.
</p>
<p>
  <a
    href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink"
  >
    Sign in to CPPD Pakistan
  </a>
</p>
<p>If you didn’t request this, you can safely ignore this email.</p>
```

**Confirmation** template body (`confirmation.html`) — covers email
sign-up/change confirmation:

```html
<h2>Confirm your email — CPPD Pakistan</h2>
<p>Confirm this email address to continue with your CPPD Pakistan account.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
    Confirm email address
  </a>
</p>
<p>If you didn’t request this, you can safely ignore this email.</p>
```

Notes:

- `{{ .SiteURL }}` resolves to `GOTRUE_SITE_URL` (the tunnel URL), so links point
  at the public app — never `localhost`.
- The `type` value matters: `magiclink` for the login link, `email` for email
  confirmation/change. The `/auth/confirm` handler passes whatever `type` arrives
  straight to `verifyOtp`.

---

## 6. Rate limits — keep the defaults

**Do not raise GoTrue's email rate limits.** The defaults (per-hour email cap and
per-request minimum interval) protect the SES reputation and blunt abuse. Leave
`GOTRUE_RATE_LIMIT_EMAIL_SENT` (and related limits) at their built-in defaults —
do not add overrides to increase them.

---

## 7. Post-setup verification checklist

Run against a stack configured with the values above:

- [ ] **Google login** round-trips: `/login` → Google consent →
      `/auth/callback` → `/dashboard` (or `/profile` if the profile is
      incomplete).
- [ ] **Magic link** round-trips: `/login` → "check your email" state → email
      link → `/auth/confirm` → `/dashboard` / `/profile`.
- [ ] Visiting **`/dashboard` while logged out** redirects to
      `/login?next=/dashboard`, and after login you land back on `/dashboard`.
- [ ] **`/auth/callback?next=https://evil.com`** does **not** redirect
      off-origin (lands on `/dashboard`).
- [ ] **Session survives a refresh**; **sign-out** (`POST /auth/signout`) clears
      it and `/dashboard` redirects to `/login` again.
- [ ] No auth tokens, `token_hash`, or email addresses appear in server logs.
