-- ============================================================================
-- 0004_applications.sql — applications + application_files (IMMUTABLE to users)
--
-- Applications are APPEND-ONLY for users and there is no draft state:
--   * Users may SELECT their own rows only.
--   * There is NO user INSERT policy — inserts happen ONLY through
--     submit_application() (SECURITY DEFINER, see 0005).
--   * There is NO user UPDATE or DELETE policy.
--   * On top of RLS we REVOKE insert/update/delete from anon + authenticated
--     (belt and braces), and a BEFORE UPDATE trigger blocks non-privileged
--     callers from changing anything but the status bookkeeping columns —
--     defense in depth in case a Directus/role grant is ever misconfigured.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- applications
--
-- Note: "references" is a SQL reserved word and is quoted everywhere.
-- profile_snapshot freezes the profile row at submission time so later profile
-- edits never mutate a submitted application.
-- ----------------------------------------------------------------------------
create table if not exists public.applications (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id),
  batch_id               uuid not null references public.batches (id),
  status                 text not null default 'applied',

  profile_snapshot       jsonb not null,   -- frozen copy of the profile row

  -- Dynamic sections (present only when the course enables them):
  qualifications         jsonb,            -- { professional, additional }
  employment             jsonb,            -- { employer_name, position, start_date, employer_address }
  counselling_experience text,
  health_disclosure      jsonb,            -- { has_condition, details, support_needed }
  medication_allergies   jsonb,            -- { medications, allergies }
  personal_statement     text,
  "references"           jsonb,            -- array of { name, position, phone, address, email }, max 2

  -- Consent (the exact wording shown is stored for auditability):
  consent_given          boolean not null,
  consent_text           text not null,

  submitted_at           timestamptz not null default now(),

  -- Status workflow (Directus fills the change metadata):
  status_changed_at      timestamptz,
  status_changed_by      text,

  constraint applications_status_valid
    check (status in ('applied', 'approved', 'rejected')),
  constraint applications_consent_required
    check (consent_given = true),
  constraint applications_user_batch_unique
    unique (user_id, batch_id)
);

create index if not exists applications_user_id_idx  on public.applications (user_id);
create index if not exists applications_batch_id_idx on public.applications (batch_id);
create index if not exists applications_status_idx   on public.applications (status);

alter table public.applications enable row level security;

-- Users may READ their own applications only. Intentionally NO insert/update/
-- delete policies (inserts go through the RPC; rows are immutable to users).
drop policy if exists applications_select_own on public.applications;
create policy applications_select_own on public.applications
  for select to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- application_files: one row per uploaded document linked to an application.
-- on delete restrict: a file cannot be orphaned by deleting its application.
-- ----------------------------------------------------------------------------
create table if not exists public.application_files (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references public.applications (id) on delete restrict,
  user_id           uuid not null references auth.users (id),
  requirement_key   text not null,          -- matches courses.requirements uploads[].key
  storage_path      text not null,          -- application-uploads/{user_id}/{uuid}/{filename}
  original_filename text,
  mime_type         text,
  size_bytes        bigint,
  created_at        timestamptz not null default now(),

  constraint application_files_app_key_unique unique (application_id, requirement_key)
);

create index if not exists application_files_application_id_idx
  on public.application_files (application_id);
create index if not exists application_files_user_id_idx
  on public.application_files (user_id);

alter table public.application_files enable row level security;

drop policy if exists application_files_select_own on public.application_files;
create policy application_files_select_own on public.application_files
  for select to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Belt and braces: even though there are no user write policies, explicitly
-- REVOKE all write DML from the app roles. The submit_application() RPC runs as
-- its owner (postgres) and is unaffected by these grants.
-- ----------------------------------------------------------------------------
revoke insert, update, delete on public.applications      from anon, authenticated;
revoke insert, update, delete on public.application_files from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Immutability trigger: a non-privileged caller may only ever change the status
-- bookkeeping columns (status, status_changed_at, status_changed_by). A
-- superuser or service_role caller (the trusted admin/Directus context) is
-- allowed through unchanged. This is defense in depth on top of RLS + REVOKE.
-- ----------------------------------------------------------------------------
create or replace function public.applications_enforce_immutable()
returns trigger
language plpgsql
as $$
declare
  v_privileged boolean;
begin
  -- Trusted context = Postgres superuser OR a member of service_role.
  -- The service_role check is guarded so this also works on a plain Postgres
  -- (e.g. local tests) where that role may not exist.
  v_privileged :=
    coalesce(current_setting('is_superuser', true) = 'on', false)
    or exists (
      select 1 from pg_roles r
      where r.rolname = 'service_role'
        and pg_has_role(current_user, r.oid, 'MEMBER')
    );

  if v_privileged then
    return new;
  end if;

  -- Non-privileged callers may change ONLY the status bookkeeping columns.
  if new.id                     is distinct from old.id
     or new.user_id             is distinct from old.user_id
     or new.batch_id            is distinct from old.batch_id
     or new.profile_snapshot    is distinct from old.profile_snapshot
     or new.qualifications      is distinct from old.qualifications
     or new.employment          is distinct from old.employment
     or new.counselling_experience is distinct from old.counselling_experience
     or new.health_disclosure   is distinct from old.health_disclosure
     or new.medication_allergies is distinct from old.medication_allergies
     or new.personal_statement  is distinct from old.personal_statement
     or new."references"        is distinct from old."references"
     or new.consent_given       is distinct from old.consent_given
     or new.consent_text        is distinct from old.consent_text
     or new.submitted_at        is distinct from old.submitted_at
  then
    raise exception
      'applications are immutable except for status changes'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_immutable on public.applications;
create trigger applications_immutable
  before update on public.applications
  for each row execute function public.applications_enforce_immutable();

-- ----------------------------------------------------------------------------
-- Batch availability functions. Defined here (not in 0003) because they count
-- rows in public.applications, and SQL-language functions validate their bodies
-- eagerly at creation time.
-- ----------------------------------------------------------------------------

-- batch_availability(batch_id): exact seat accounting for a SINGLE batch.
--
-- Returns the exact seats_taken (applications in 'applied' or 'approved') and
-- an is_open boolean (published AND now() within the enrollment window AND
-- seats remain). SECURITY DEFINER because counting applications must bypass the
-- per-user RLS on public.applications. Intended for trusted app code on the
-- apply page (e.g. to show precise remaining seats to a signed-in applicant).
create or replace function public.batch_availability(p_batch_id uuid)
returns table (
  batch_id    uuid,
  capacity    int,
  seats_taken int,
  is_open     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.capacity,
    coalesce(t.taken, 0)::int as seats_taken,
    (
      b.is_published
      and now() >= b.enrollment_start
      and now() <= b.enrollment_end
      and coalesce(t.taken, 0) < b.capacity
    ) as is_open
  from public.batches b
  left join lateral (
    select count(*) as taken
    from public.applications a
    where a.batch_id = b.id
      and a.status in ('applied', 'approved')
  ) t on true
  where b.id = p_batch_id;
$$;

revoke all on function public.batch_availability(uuid) from public;
grant execute on function public.batch_availability(uuid) to anon, authenticated;

-- get_open_batches(): public listing of currently-open batches per course.
--
-- Privacy choice (documented): this listing does NOT expose exact applicant
-- counts. Instead it returns is_open plus a coarse `availability` band:
--   'available'  — plenty of seats
--   'limited'    — few seats left (<= 20% of capacity, min 1)
--   'full'       — no seats left
-- Only published batches of active courses currently within their enrollment
-- window are returned.
create or replace function public.get_open_batches()
returns table (
  batch_id         uuid,
  course_id        uuid,
  course_slug      text,
  course_title     text,
  category_slug    text,
  batch_number     text,
  enrollment_start timestamptz,
  enrollment_end   timestamptz,
  class_start      date,
  is_open          boolean,
  availability     text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    c.id,
    c.slug,
    c.title,
    cat.slug,
    b.batch_number,
    b.enrollment_start,
    b.enrollment_end,
    b.class_start,
    (coalesce(t.taken, 0) < b.capacity) as is_open,
    case
      when coalesce(t.taken, 0) >= b.capacity then 'full'
      when (b.capacity - coalesce(t.taken, 0))
             <= greatest(1, ceil(b.capacity * 0.2)) then 'limited'
      else 'available'
    end as availability
  from public.batches b
  join public.courses c             on c.id = b.course_id
  join public.course_categories cat on cat.id = c.category_id
  left join lateral (
    select count(*) as taken
    from public.applications a
    where a.batch_id = b.id
      and a.status in ('applied', 'approved')
  ) t on true
  where b.is_published
    and c.is_active
    and now() >= b.enrollment_start
    and now() <= b.enrollment_end;
$$;

revoke all on function public.get_open_batches() from public;
grant execute on function public.get_open_batches() to anon, authenticated;
