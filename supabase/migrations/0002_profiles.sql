-- ============================================================================
-- 0002_profiles.sql — reusable student profile (one row per auth user)
--
-- A profile is maintained independently of any application and is snapshotted
-- into each application at submission time. All the personal/contact fields are
-- NOT NULL and therefore guaranteed present once a profile row exists; the three
-- storage-path columns (CNIC front/back + photo) are nullable because they are
-- filled by a separate upload step, and their presence is what gates a
-- "complete" profile in submit_application().
-- ============================================================================

create table if not exists public.profiles (
  id                             uuid primary key
                                   references auth.users (id) on delete cascade,

  -- Identity & address
  full_name                      text not null,
  address                        text not null,
  city                           text not null,
  date_of_birth                  date not null,
  gender                         text not null,

  -- Contact
  telephone                      text,            -- optional landline
  mobile                         text not null,

  -- Emergency contact
  emergency_contact_name         text not null,
  emergency_contact_relationship text not null,
  emergency_contact_phone        text not null,
  emergency_contact_email        text not null,

  -- Storage object paths (bucket: profile-documents, folder {user_id}/...).
  -- Nullable until uploaded; all three required for a "complete" profile.
  cnic_front_path                text,
  cnic_back_path                 text,
  photo_path                     text,

  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),

  constraint profiles_dob_in_past check (date_of_birth < current_date),
  constraint profiles_gender_valid
    check (gender in ('male', 'female', 'other', 'prefer_not_to_say'))
);

-- Keep updated_at fresh on every write.
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: a user may only ever see and edit THEIR OWN profile row. No DELETE
-- policy exists, so profiles cannot be removed by users (auth.users cascade is
-- the only path, when the account itself is deleted).
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
