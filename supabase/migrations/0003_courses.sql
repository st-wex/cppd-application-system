-- ============================================================================
-- 0003_courses.sql — course catalogue: categories, courses, batches
--
-- These tables are PUBLIC read (anon + authenticated) but have NO write
-- policies: staff manage them through Directus, which connects as a privileged
-- Postgres role and bypasses RLS. Only PUBLISHED/ACTIVE rows are ever exposed
-- to the app.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- course_categories
-- ----------------------------------------------------------------------------
create table if not exists public.course_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  sort_order int
);

alter table public.course_categories enable row level security;

-- Categories are non-sensitive reference data: readable by everyone.
drop policy if exists course_categories_select_all on public.course_categories;
create policy course_categories_select_all on public.course_categories
  for select to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- courses
--
-- requirements jsonb drives the dynamic application form per course. Shape
-- (kept in sync with src/lib/types/requirements.ts):
--
-- {
--   "intro_text": string | null,          -- shown at top of the form
--   "qualifications": boolean,            -- professional + additional quals
--   "employment": boolean,               -- employer, position, start, address
--   "counselling_experience": boolean,   -- free-text summary
--   "health_disclosure": boolean,        -- condition details + support needs
--   "medication_allergies": boolean,     -- regular medications + allergies
--   "personal_statement": boolean,
--   "references": { "enabled": boolean, "min": number, "max": number }, -- max 2
--   "uploads": [                          -- dynamic document upload slots
--     {
--       "key": string,                    -- unique per course, e.g. "marksheet_1"
--       "label": string,                  -- e.g. "Marksheet 1"
--       "instructions": string,           -- free text shown ABOVE the upload
--       "required": boolean,
--       "accepted_types": string[],       -- e.g. ["application/pdf","image/jpeg"]
--       "max_size_mb": number
--     }
--   ]
-- }
-- ----------------------------------------------------------------------------
create table if not exists public.courses (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.course_categories (id),
  title        text not null,
  slug         text not null unique,
  description  text,
  is_active    boolean not null default true,
  requirements jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.courses.requirements is
  'Dynamic per-course application requirement config. See src/lib/types/requirements.ts for the canonical shape.';

create index if not exists courses_category_id_idx
  on public.courses (category_id);

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

alter table public.courses enable row level security;

-- Only ACTIVE courses are ever visible to the app (anon or authenticated).
drop policy if exists courses_select_active on public.courses;
create policy courses_select_active on public.courses
  for select to anon, authenticated
  using (is_active);

-- ----------------------------------------------------------------------------
-- batches: an intake window for a course
-- ----------------------------------------------------------------------------
create table if not exists public.batches (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses (id),
  batch_number     text not null,                 -- e.g. "Batch 14"
  enrollment_start timestamptz not null,
  enrollment_end   timestamptz not null,
  class_start      date not null,
  capacity         int not null,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),

  constraint batches_course_number_unique unique (course_id, batch_number),
  constraint batches_enrollment_window check (enrollment_start < enrollment_end),
  constraint batches_capacity_positive check (capacity > 0)
);

create index if not exists batches_course_id_idx on public.batches (course_id);

alter table public.batches enable row level security;

-- Only PUBLISHED batches are visible. (Availability/openness is computed by the
-- batch_availability() / get_open_batches() functions defined in
-- 0004_applications.sql, once the applications table they count exists; the raw
-- row exposes capacity but never applicant counts.)
drop policy if exists batches_select_published on public.batches;
create policy batches_select_published on public.batches
  for select to anon, authenticated
  using (is_published);
