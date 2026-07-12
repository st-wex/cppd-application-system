-- ============================================================================
-- 0005_submit_application.sql — the ONLY write path for applications
--
-- submit_application(p_batch_id, p_payload, p_files) is SECURITY DEFINER (owned
-- by postgres) with a pinned search_path and EXECUTE granted to authenticated
-- only. It performs the entire submission in a single transaction:
--   1. authenticate the caller
--   2. lock the batch row (serializes concurrent submissions -> race-free
--      capacity) and enforce the enrollment window / capacity / no-duplicate
--   3. validate the payload against the course's dynamic requirements
--   4. verify the caller's profile exists and is complete
--   5. snapshot the profile
--   6. insert the application + its file rows
--   7. return the new application id
--
-- Error codes (custom SQLSTATEs, mirrored in src/lib/types/application.ts) let
-- the frontend branch on failures — notably PT002 to redirect to the profile
-- page:
--   PT001  not authenticated
--   PT002  profile incomplete
--   PT003  batch not open (unpublished / outside enrollment window / not found)
--   PT004  batch full
--   PT005  payload validation failed
--   PT006  duplicate application (user already applied to this batch)
--   PT007  consent not given
--
-- p_payload shape mirrors ApplicationPayload; p_files is a JSON array of
--   { requirement_key, storage_path, original_filename, mime_type, size_bytes }.
-- ============================================================================

create or replace function public.submit_application(
  p_batch_id uuid,
  p_payload  jsonb,
  p_files    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := auth.uid();
  v_batch       public.batches%rowtype;
  v_course      public.courses%rowtype;
  v_profile     public.profiles%rowtype;
  v_req         jsonb;
  v_seats_taken int;
  v_app_id      uuid;
  v_prefix      text;

  -- references config / validation
  v_ref_min   int;
  v_ref_max   int;
  v_ref_count int;

  -- uploads validation
  v_upload     jsonb;
  v_elem       jsonb;
  v_key        text;
  v_mime       text;
  v_size       bigint;
  v_max_bytes  bigint;
  v_slot       jsonb;
  v_allowed    text[] := '{}';
  v_seen_keys  text[] := '{}';
begin
  -- 1. AUTHENTICATE ----------------------------------------------------------
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'PT001';
  end if;

  -- Consent is mandatory and its exact wording must be recorded.
  if coalesce((p_payload ->> 'consent_given')::boolean, false) is not true then
    raise exception 'consent is required' using errcode = 'PT007';
  end if;
  if nullif(btrim(p_payload ->> 'consent_text'), '') is null then
    raise exception 'consent text is required' using errcode = 'PT005';
  end if;

  -- 2. LOCK BATCH + ENROLLMENT/CAPACITY -------------------------------------
  -- FOR UPDATE serializes concurrent submissions to the same batch so the
  -- capacity check below cannot race.
  select * into v_batch
  from public.batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'batch not found' using errcode = 'PT003';
  end if;
  if not v_batch.is_published then
    raise exception 'batch is not open for applications' using errcode = 'PT003';
  end if;
  if now() < v_batch.enrollment_start or now() > v_batch.enrollment_end then
    raise exception 'batch enrollment window is closed' using errcode = 'PT003';
  end if;

  -- One application per user per batch (checked under the batch lock; the
  -- UNIQUE(user_id, batch_id) constraint is the ultimate backstop).
  if exists (
    select 1 from public.applications
    where user_id = v_user and batch_id = p_batch_id
  ) then
    raise exception 'you have already applied to this batch' using errcode = 'PT006';
  end if;

  select count(*) into v_seats_taken
  from public.applications
  where batch_id = p_batch_id
    and status in ('applied', 'approved');

  if v_seats_taken >= v_batch.capacity then
    raise exception 'batch is full' using errcode = 'PT004';
  end if;

  -- 3. LOAD REQUIREMENTS + VALIDATE PAYLOAD ---------------------------------
  select * into v_course from public.courses where id = v_batch.course_id;
  if not found then
    raise exception 'course not found' using errcode = 'PT003';
  end if;
  if not v_course.is_active then
    raise exception 'course is not active' using errcode = 'PT003';
  end if;
  v_req := coalesce(v_course.requirements, '{}'::jsonb);

  -- qualifications: { professional (required), additional (optional) }
  if coalesce((v_req ->> 'qualifications')::boolean, false) then
    if jsonb_typeof(p_payload -> 'qualifications') is distinct from 'object'
       or nullif(btrim(p_payload #>> '{qualifications,professional}'), '') is null
    then
      raise exception 'qualifications are required' using errcode = 'PT005';
    end if;
  end if;

  -- employment: employer_name, position, start_date, employer_address
  if coalesce((v_req ->> 'employment')::boolean, false) then
    if jsonb_typeof(p_payload -> 'employment') is distinct from 'object'
       or nullif(btrim(p_payload #>> '{employment,employer_name}'), '') is null
       or nullif(btrim(p_payload #>> '{employment,position}'), '') is null
       or nullif(btrim(p_payload #>> '{employment,start_date}'), '') is null
       or nullif(btrim(p_payload #>> '{employment,employer_address}'), '') is null
    then
      raise exception 'employment details are required' using errcode = 'PT005';
    end if;
  end if;

  -- counselling_experience: free text
  if coalesce((v_req ->> 'counselling_experience')::boolean, false) then
    if nullif(btrim(p_payload ->> 'counselling_experience'), '') is null then
      raise exception 'counselling experience is required' using errcode = 'PT005';
    end if;
  end if;

  -- health_disclosure: { has_condition (bool, required), details, support_needed }
  if coalesce((v_req ->> 'health_disclosure')::boolean, false) then
    if jsonb_typeof(p_payload -> 'health_disclosure') is distinct from 'object'
       or jsonb_typeof(p_payload #> '{health_disclosure,has_condition}')
            is distinct from 'boolean'
    then
      raise exception 'health disclosure is required' using errcode = 'PT005';
    end if;
    -- If a condition is declared, its details are required.
    if (p_payload #>> '{health_disclosure,has_condition}')::boolean
       and nullif(btrim(p_payload #>> '{health_disclosure,details}'), '') is null
    then
      raise exception 'health disclosure details are required' using errcode = 'PT005';
    end if;
  end if;

  -- medication_allergies: { medications, allergies } — object must be present
  -- (either field may legitimately be "none"), so we only require the object.
  if coalesce((v_req ->> 'medication_allergies')::boolean, false) then
    if jsonb_typeof(p_payload -> 'medication_allergies') is distinct from 'object' then
      raise exception 'medication/allergy information is required' using errcode = 'PT005';
    end if;
  end if;

  -- personal_statement: free text
  if coalesce((v_req ->> 'personal_statement')::boolean, false) then
    if nullif(btrim(p_payload ->> 'personal_statement'), '') is null then
      raise exception 'personal statement is required' using errcode = 'PT005';
    end if;
  end if;

  -- references: array within [min, min(max, 2)]; each needs name, phone, email
  if coalesce((v_req #>> '{references,enabled}')::boolean, false) then
    v_ref_min := coalesce((v_req #>> '{references,min}')::int, 0);
    v_ref_max := least(coalesce((v_req #>> '{references,max}')::int, 2), 2);

    if jsonb_typeof(p_payload -> 'references') is distinct from 'array' then
      raise exception 'references are required' using errcode = 'PT005';
    end if;

    v_ref_count := jsonb_array_length(p_payload -> 'references');
    if v_ref_count < v_ref_min or v_ref_count > v_ref_max then
      raise exception 'between % and % references are required', v_ref_min, v_ref_max
        using errcode = 'PT005';
    end if;

    for v_elem in select * from jsonb_array_elements(p_payload -> 'references') loop
      if nullif(btrim(v_elem ->> 'name'), '') is null
         or nullif(btrim(v_elem ->> 'phone'), '') is null
         or nullif(btrim(v_elem ->> 'email'), '') is null
      then
        raise exception 'each reference requires a name, phone and email'
          using errcode = 'PT005';
      end if;
    end loop;
  end if;

  -- uploads: build the set of valid keys from the course config
  if jsonb_typeof(v_req -> 'uploads') = 'array' then
    for v_upload in select * from jsonb_array_elements(v_req -> 'uploads') loop
      v_allowed := array_append(v_allowed, v_upload ->> 'key');
    end loop;
  end if;

  v_prefix := 'application-uploads/' || v_user::text || '/';

  -- Validate every provided file against its slot.
  if p_files is not null then
    if jsonb_typeof(p_files) is distinct from 'array' then
      raise exception 'files payload must be an array' using errcode = 'PT005';
    end if;

    for v_elem in select * from jsonb_array_elements(p_files) loop
      v_key := v_elem ->> 'requirement_key';

      if v_key is null then
        raise exception 'file is missing its requirement_key' using errcode = 'PT005';
      end if;
      if not (v_key = any (v_allowed)) then
        raise exception 'unknown upload key: %', v_key using errcode = 'PT005';
      end if;
      if v_key = any (v_seen_keys) then
        raise exception 'duplicate upload for key: %', v_key using errcode = 'PT005';
      end if;
      v_seen_keys := array_append(v_seen_keys, v_key);

      -- Path ownership: users can only link files from their own folder.
      if nullif(btrim(v_elem ->> 'storage_path'), '') is null
         or left(v_elem ->> 'storage_path', length(v_prefix)) <> v_prefix
      then
        raise exception 'file storage_path is outside your folder'
          using errcode = 'PT005';
      end if;

      -- Locate the matching slot config.
      select u into v_slot
      from jsonb_array_elements(v_req -> 'uploads') u
      where u ->> 'key' = v_key
      limit 1;

      -- Mime type must be in the slot's accepted_types.
      v_mime := v_elem ->> 'mime_type';
      if jsonb_typeof(v_slot -> 'accepted_types') is distinct from 'array'
         or v_mime is null
         or not ((v_slot -> 'accepted_types') ? v_mime)
      then
        raise exception 'file type not accepted for %', v_key using errcode = 'PT005';
      end if;

      -- Size must be positive and within the slot's max_size_mb.
      v_size := nullif(v_elem ->> 'size_bytes', '')::bigint;
      v_max_bytes := (coalesce((v_slot ->> 'max_size_mb')::numeric, 10)
                      * 1024 * 1024)::bigint;
      if v_size is null or v_size <= 0 or v_size > v_max_bytes then
        raise exception 'file too large or missing size for %', v_key
          using errcode = 'PT005';
      end if;
    end loop;
  end if;

  -- Every REQUIRED upload slot must be present in p_files.
  if jsonb_typeof(v_req -> 'uploads') = 'array' then
    for v_upload in select * from jsonb_array_elements(v_req -> 'uploads') loop
      if coalesce((v_upload ->> 'required')::boolean, false)
         and not ((v_upload ->> 'key') = any (v_seen_keys))
      then
        raise exception 'missing required upload: %', v_upload ->> 'key'
          using errcode = 'PT005';
      end if;
    end loop;
  end if;

  -- 4. PROFILE MUST EXIST + BE COMPLETE -------------------------------------
  select * into v_profile from public.profiles where id = v_user;
  if not found then
    raise exception 'profile is incomplete' using errcode = 'PT002';
  end if;
  -- All personal/contact fields are NOT NULL by table constraint; the three
  -- document paths are the remaining gate on completeness.
  if v_profile.cnic_front_path is null
     or v_profile.cnic_back_path is null
     or v_profile.photo_path is null
  then
    raise exception 'profile is incomplete' using errcode = 'PT002';
  end if;

  -- 5 + 6. SNAPSHOT + INSERT -------------------------------------------------
  insert into public.applications (
    user_id, batch_id, status, profile_snapshot,
    qualifications, employment, counselling_experience,
    health_disclosure, medication_allergies, personal_statement,
    "references", consent_given, consent_text
  )
  values (
    v_user,
    p_batch_id,
    'applied',
    to_jsonb(v_profile),
    case when coalesce((v_req ->> 'qualifications')::boolean, false)
         then p_payload -> 'qualifications' end,
    case when coalesce((v_req ->> 'employment')::boolean, false)
         then p_payload -> 'employment' end,
    case when coalesce((v_req ->> 'counselling_experience')::boolean, false)
         then nullif(btrim(p_payload ->> 'counselling_experience'), '') end,
    case when coalesce((v_req ->> 'health_disclosure')::boolean, false)
         then p_payload -> 'health_disclosure' end,
    case when coalesce((v_req ->> 'medication_allergies')::boolean, false)
         then p_payload -> 'medication_allergies' end,
    case when coalesce((v_req ->> 'personal_statement')::boolean, false)
         then nullif(btrim(p_payload ->> 'personal_statement'), '') end,
    case when coalesce((v_req #>> '{references,enabled}')::boolean, false)
         then p_payload -> 'references' end,
    true,
    p_payload ->> 'consent_text'
  )
  returning id into v_app_id;

  if p_files is not null then
    insert into public.application_files (
      application_id, user_id, requirement_key, storage_path,
      original_filename, mime_type, size_bytes
    )
    select
      v_app_id,
      v_user,
      f ->> 'requirement_key',
      f ->> 'storage_path',
      f ->> 'original_filename',
      f ->> 'mime_type',
      nullif(f ->> 'size_bytes', '')::bigint
    from jsonb_array_elements(p_files) f;
  end if;

  -- 7. RETURN ----------------------------------------------------------------
  return v_app_id;
end;
$$;

-- Only authenticated users may call the RPC. It runs as its owner (postgres),
-- so it can insert despite the REVOKEs and missing insert policy.
revoke all on function public.submit_application(uuid, jsonb, jsonb) from public;
grant execute on function public.submit_application(uuid, jsonb, jsonb) to authenticated;
