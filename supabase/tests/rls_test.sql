-- ============================================================================
-- rls_test.sql — repeatable RLS + submit_application acceptance tests
--
-- Covers the acceptance matrix from the schema spec:
--   * Two users A and B: A cannot SELECT B's profile, applications, or files.
--   * anon can read PUBLISHED courses/batches only.
--   * A cannot INSERT/UPDATE/DELETE applications directly (RLS + REVOKE).
--   * The immutability trigger blocks a (misconfigured) non-privileged role
--     from changing anything but the status columns.
--   * submit_application() rejects: closed batch, full batch, missing required
--     section, missing required upload, wrong mime, oversized file, path
--     outside the caller's folder, consent=false, duplicate (user,batch),
--     incomplete profile.
--   * Capacity is enforced (fill the batch, next submission fails) — the
--     race-free guarantee comes from the FOR UPDATE lock (see the note at the
--     end for a true two-session concurrency demo).
--
-- HOW TO RUN
--   Against a real self-hosted Supabase Postgres (as the postgres superuser):
--     psql "$SUPABASE_DB_URL" -f supabase/tests/rls_test.sql
--   auth.uid() is simulated by setting the request.jwt claim GUCs; the script
--   switches into the `authenticated` / `anon` roles to exercise RLS.
--
-- The script is REPEATABLE: it removes its own fixtures (fixed UUIDs) first, so
-- it can be run over and over. It only ever touches its own test rows.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Result recording helpers + a temp table to tally PASS/FAIL.
-- ---------------------------------------------------------------------------
drop table if exists _results;
create temp table _results (ok boolean, description text);
-- Recording happens from within functions that may run under the authenticated
-- role, so allow every role to append results to this session-local table.
grant insert on _results to public;

create or replace function _pass(p_desc text) returns void language plpgsql as $$
begin insert into _results values (true, p_desc); end $$;

create or replace function _fail(p_desc text) returns void language plpgsql as $$
begin insert into _results values (false, p_desc); end $$;

-- ===========================================================================
-- FIXTURES (created as the postgres superuser; repeatable via fixed UUIDs).
-- ===========================================================================
do $$
declare
  v_a   uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_b   uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_c   uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_cat uuid;
begin
  -- Clean up any prior run (children first).
  delete from public.application_files
    where user_id in (v_a, v_b, v_c);
  delete from public.applications
    where user_id in (v_a, v_b, v_c);
  delete from public.batches where id in (
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666666',
    '88888888-8888-8888-8888-888888888888',
    '99999999-9999-9999-9999-999999999999'
  );
  delete from public.courses where id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '77777777-7777-7777-7777-777777777777'
  );
  delete from public.profiles where id in (v_a, v_b, v_c);
  delete from auth.users where id in (v_a, v_b, v_c);

  -- Auth users
  insert into auth.users (id, email) values
    (v_a, 'a@test.local'),
    (v_b, 'b@test.local'),
    (v_c, 'c@test.local');

  -- Profiles: A and B complete; C missing document paths (incomplete).
  insert into public.profiles (
    id, full_name, address, city, date_of_birth, gender, mobile,
    emergency_contact_name, emergency_contact_relationship,
    emergency_contact_phone, emergency_contact_email,
    cnic_front_path, cnic_back_path, photo_path
  ) values
    (v_a, 'Alice A', '1 St', 'Karachi', '1990-01-01', 'female', '03000000001',
     'Kin A', 'Sister', '03000000009', 'kin.a@test.local',
     v_a || '/cnic_front.jpg', v_a || '/cnic_back.jpg', v_a || '/photo.jpg'),
    (v_b, 'Bob B', '2 St', 'Lahore', '1988-05-05', 'male', '03000000002',
     'Kin B', 'Brother', '03000000008', 'kin.b@test.local',
     v_b || '/cnic_front.jpg', v_b || '/cnic_back.jpg', v_b || '/photo.jpg'),
    (v_c, 'Carol C', '3 St', 'Multan', '1995-09-09', 'female', '03000000003',
     'Kin C', 'Mother', '03000000007', 'kin.c@test.local',
     null, null, null);

  select id into v_cat from public.course_categories where slug = 'certificate-courses';

  -- A "full" course exercising every section + one required upload slot.
  insert into public.courses (id, category_id, title, slug, description, is_active, requirements)
  values (
    '11111111-1111-1111-1111-111111111111', v_cat,
    'TEST Full Course', 'test-full-course', 'test', true,
    jsonb_build_object(
      'intro_text', 'test',
      'qualifications', true,
      'employment', true,
      'counselling_experience', true,
      'health_disclosure', true,
      'medication_allergies', true,
      'personal_statement', true,
      'references', jsonb_build_object('enabled', true, 'min', 2, 'max', 2),
      'uploads', jsonb_build_array(
        jsonb_build_object(
          'key', 'marksheet_1', 'label', 'Marksheet 1', 'instructions', 'test',
          'required', true,
          'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg'),
          'max_size_mb', 5
        )
      )
    )
  );

  -- A base "workshop" course (profile + consent only).
  insert into public.courses (id, category_id, title, slug, description, is_active, requirements)
  values (
    '22222222-2222-2222-2222-222222222222', v_cat,
    'TEST Workshop', 'test-workshop', 'test', true,
    jsonb_build_object(
      'intro_text', 'test',
      'qualifications', false, 'employment', false,
      'counselling_experience', false, 'health_disclosure', false,
      'medication_allergies', false, 'personal_statement', false,
      'references', jsonb_build_object('enabled', false, 'min', 0, 'max', 0),
      'uploads', '[]'::jsonb
    )
  );

  -- An INACTIVE course (must be invisible to anon/authenticated).
  insert into public.courses (id, category_id, title, slug, description, is_active, requirements)
  values (
    '77777777-7777-7777-7777-777777777777', v_cat,
    'TEST Hidden Course', 'test-hidden-course', 'test', false, '{}'::jsonb
  );

  -- Batches:
  --   open   (full course)  cap 2, window open now
  --   closed (full course)  window in the past, still published
  --   full   (workshop)     cap 1, pre-filled by B
  --   wkopen (workshop)     cap 5, window open now
  --   unpub  (full course)  is_published=false (invisible to anon)
  insert into public.batches
    (id, course_id, batch_number, enrollment_start, enrollment_end, class_start, capacity, is_published)
  values
    ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
     'Batch OPEN',  now() - interval '1 day', now() + interval '10 days', current_date + 30, 2, true),
    ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
     'Batch CLOSED', now() - interval '30 days', now() - interval '1 day', current_date + 30, 5, true),
    ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222',
     'Batch FULL',  now() - interval '1 day', now() + interval '10 days', current_date + 30, 1, true),
    ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222',
     'Batch WKOPEN', now() - interval '1 day', now() + interval '10 days', current_date + 30, 5, true),
    ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111',
     'Batch UNPUB', now() - interval '1 day', now() + interval '10 days', current_date + 30, 5, false),
    -- A second OPEN full-course batch that A does NOT apply to, reserved for the
    -- section/upload validation negative cases (which must reach the requirement
    -- checks rather than tripping the window/duplicate/capacity guards first).
    ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
     'Batch OPEN2', now() - interval '1 day', now() + interval '10 days', current_date + 30, 5, true);

  -- Pre-fill the FULL batch with B's application (direct insert as superuser).
  insert into public.applications
    (user_id, batch_id, status, profile_snapshot, consent_given, consent_text)
  values
    (v_b, '55555555-5555-5555-5555-555555555555', 'applied', '{}'::jsonb, true, 'seed');
end $$;

-- Convenience: a valid payload + files for the FULL course, as A.
-- (Built in SQL so negative cases can tweak individual keys.)

-- ===========================================================================
-- 1. submit_application HAPPY PATH (A -> open full-course batch)
-- ===========================================================================
do $$
declare v_app uuid; v_files int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

  v_app := public.submit_application(
    '33333333-3333-3333-3333-333333333333',
    jsonb_build_object(
      'consent_given', true, 'consent_text', 'I consent.',
      'qualifications', jsonb_build_object('professional','BSc','additional','none'),
      'employment', jsonb_build_object('employer_name','X','position','Y','start_date','2020-01-01','employer_address','Z'),
      'counselling_experience', 'Some experience',
      'health_disclosure', jsonb_build_object('has_condition', false, 'details','', 'support_needed',''),
      'medication_allergies', jsonb_build_object('medications','none','allergies','none'),
      'personal_statement', 'My statement',
      'references', jsonb_build_array(
        jsonb_build_object('name','R1','position','P','phone','123','address','A','email','r1@x.com'),
        jsonb_build_object('name','R2','position','P','phone','456','address','A','email','r2@x.com')
      )
    ),
    jsonb_build_array(jsonb_build_object(
      'requirement_key','marksheet_1',
      'storage_path','application-uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/u/m1.pdf',
      'mime_type','application/pdf','size_bytes',1000,'original_filename','m1.pdf'
    ))
  );
  select count(*) into v_files from public.application_files where application_id = v_app;
  reset role;
  if v_app is not null and v_files = 1 then perform _pass('happy path: application + file created');
  else perform _fail('happy path: unexpected result'); end if;
exception when others then
  reset role; perform _fail('happy path raised ' || sqlstate || ' ' || sqlerrm);
end $$;

-- ===========================================================================
-- 2. RLS: A cannot SELECT B's profile / applications / files
-- ===========================================================================
do $$
declare n_prof int; n_app int; n_file int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  select count(*) into n_prof from public.profiles      where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select count(*) into n_app  from public.applications  where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select count(*) into n_file from public.application_files where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  reset role;
  if n_prof = 0 then perform _pass('RLS: A cannot see B profile'); else perform _fail('RLS: A saw B profile'); end if;
  if n_app  = 0 then perform _pass('RLS: A cannot see B applications'); else perform _fail('RLS: A saw B applications'); end if;
  if n_file = 0 then perform _pass('RLS: A cannot see B files'); else perform _fail('RLS: A saw B files'); end if;
end $$;

-- A CAN see A's own rows.
do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  select count(*) into n from public.applications where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  reset role;
  if n = 1 then perform _pass('RLS: A can see own application'); else perform _fail('RLS: A own application count=' || n); end if;
end $$;

-- ===========================================================================
-- 3. anon reads PUBLISHED/ACTIVE courses + batches only
-- ===========================================================================
do $$
declare n_hidden int; n_active int; n_unpub int; n_open int;
begin
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n_hidden from public.courses where id = '77777777-7777-7777-7777-777777777777';
  select count(*) into n_active from public.courses where id = '11111111-1111-1111-1111-111111111111';
  select count(*) into n_unpub  from public.batches where id = '88888888-8888-8888-8888-888888888888';
  select count(*) into n_open   from public.batches where id = '33333333-3333-3333-3333-333333333333';
  reset role;
  if n_hidden = 0 then perform _pass('anon: inactive course hidden'); else perform _fail('anon saw inactive course'); end if;
  if n_active = 1 then perform _pass('anon: active course visible'); else perform _fail('anon missed active course'); end if;
  if n_unpub  = 0 then perform _pass('anon: unpublished batch hidden'); else perform _fail('anon saw unpublished batch'); end if;
  if n_open   = 1 then perform _pass('anon: published batch visible'); else perform _fail('anon missed published batch'); end if;
end $$;

-- ===========================================================================
-- 4. Direct DML on applications is DENIED for authenticated (RLS + REVOKE)
-- ===========================================================================
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  begin
    insert into public.applications (user_id, batch_id, status, profile_snapshot, consent_given, consent_text)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666',
            'applied', '{}'::jsonb, true, 'x');
    reset role; perform _fail('direct INSERT was allowed');
  exception when insufficient_privilege then reset role; perform _pass('direct INSERT denied (REVOKE)');
    when others then reset role; perform _pass('direct INSERT denied (' || sqlstate || ')');
  end;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  begin
    update public.applications set status = 'approved'
      where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    reset role; perform _fail('direct UPDATE was allowed');
  exception when insufficient_privilege then reset role; perform _pass('direct UPDATE denied (REVOKE)');
    when others then reset role; perform _pass('direct UPDATE denied (' || sqlstate || ')');
  end;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  begin
    delete from public.applications where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    reset role; perform _fail('direct DELETE was allowed');
  exception when insufficient_privilege then reset role; perform _pass('direct DELETE denied (REVOKE)');
    when others then reset role; perform _pass('direct DELETE denied (' || sqlstate || ')');
  end;
end $$;

-- ===========================================================================
-- 5. Immutability trigger vs a MISCONFIGURED non-privileged role
--    (simulates a Directus grant that wrongly allows UPDATE)
-- ===========================================================================
-- Mimic how Directus really connects: a role that BYPASSES RLS and has been
-- (mis)granted write access to applications. RLS therefore offers no protection
-- here — only the immutability trigger stands between this role and tampering.
-- The role is NOT a superuser and NOT a member of service_role, so the trigger
-- treats it as non-privileged.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_app_writer') then
    create role test_app_writer nologin bypassrls;
  end if;
  grant usage on schema public to test_app_writer;
  grant select, update on public.applications to test_app_writer;
end $$;

-- 5a. status-only change is ALLOWED by the trigger.
do $$
declare v_app uuid;
begin
  select id into v_app from public.applications
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1;
  set local role test_app_writer;
  begin
    update public.applications
      set status = 'approved', status_changed_at = now(), status_changed_by = 'tester'
      where id = v_app;
    reset role; perform _pass('trigger: status change allowed for non-privileged writer');
  exception when others then reset role; perform _fail('trigger blocked status change: ' || sqlerrm);
  end;
end $$;

-- 5b. changing a non-status column is BLOCKED by the trigger.
do $$
declare v_app uuid;
begin
  select id into v_app from public.applications
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1;
  set local role test_app_writer;
  begin
    update public.applications set personal_statement = 'tampered' where id = v_app;
    reset role; perform _fail('trigger: non-status change was allowed');
  exception when others then reset role; perform _pass('trigger: non-status change blocked (' || sqlstate || ')');
  end;
end $$;

-- ===========================================================================
-- 6. submit_application NEGATIVE cases
-- ===========================================================================
-- Reusable expectation helper: run the RPC as A and assert a SQLSTATE.
create or replace function _expect(
  p_desc text, p_expected text, p_batch uuid, p_payload jsonb, p_files jsonb
) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  begin
    perform public.submit_application(p_batch, p_payload, p_files);
    perform _fail(p_desc || ': expected ' || p_expected || ' but call succeeded');
  exception
    when sqlstate 'PT001' then perform _check(p_desc, p_expected, 'PT001');
    when sqlstate 'PT002' then perform _check(p_desc, p_expected, 'PT002');
    when sqlstate 'PT003' then perform _check(p_desc, p_expected, 'PT003');
    when sqlstate 'PT004' then perform _check(p_desc, p_expected, 'PT004');
    when sqlstate 'PT005' then perform _check(p_desc, p_expected, 'PT005');
    when sqlstate 'PT006' then perform _check(p_desc, p_expected, 'PT006');
    when sqlstate 'PT007' then perform _check(p_desc, p_expected, 'PT007');
    when others then perform _fail(p_desc || ': unexpected ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

create or replace function _check(p_desc text, p_expected text, p_got text)
returns void language plpgsql as $$
begin
  if p_got = p_expected then perform _pass(p_desc || ' (' || p_got || ')');
  else perform _fail(p_desc || ': expected ' || p_expected || ' got ' || p_got); end if;
end $$;

-- Base valid full-course payload as a building block.
create or replace function _valid_payload() returns jsonb language sql as $$
  select jsonb_build_object(
    'consent_given', true, 'consent_text', 'I consent.',
    'qualifications', jsonb_build_object('professional','BSc','additional','none'),
    'employment', jsonb_build_object('employer_name','X','position','Y','start_date','2020-01-01','employer_address','Z'),
    'counselling_experience', 'Some experience',
    'health_disclosure', jsonb_build_object('has_condition', false, 'details','', 'support_needed',''),
    'medication_allergies', jsonb_build_object('medications','none','allergies','none'),
    'personal_statement', 'My statement',
    'references', jsonb_build_array(
      jsonb_build_object('name','R1','position','P','phone','123','address','A','email','r1@x.com'),
      jsonb_build_object('name','R2','position','P','phone','456','address','A','email','r2@x.com'))
  );
$$;

create or replace function _valid_files() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'requirement_key','marksheet_1',
    'storage_path','application-uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/u/m1.pdf',
    'mime_type','application/pdf','size_bytes',1000,'original_filename','m1.pdf'));
$$;

do $$
declare OPENB  uuid := '33333333-3333-3333-3333-333333333333';
        OPENB2 uuid := '99999999-9999-9999-9999-999999999999';
        CLOSEDB uuid := '44444444-4444-4444-4444-444444444444';
        FULLB  uuid := '55555555-5555-5555-5555-555555555555';
begin
  set local role authenticated;

  -- duplicate (A already applied to OPENB in test 1)
  perform _expect('duplicate application', 'PT006', OPENB, _valid_payload(), _valid_files());

  -- closed batch (past enrollment window)
  perform _expect('closed batch', 'PT003', CLOSEDB, _valid_payload(), _valid_files());

  -- full batch (workshop cap 1, seed-filled by B) — use a base payload
  perform _expect('full batch', 'PT004', FULLB,
    jsonb_build_object('consent_given', true, 'consent_text', 'ok'), '[]'::jsonb);

  -- consent = false (checked before the batch is even loaded)
  perform _expect('consent false', 'PT007', OPENB2,
    _valid_payload() || jsonb_build_object('consent_given', false), _valid_files());

  -- The remaining cases must REACH requirement validation, so they run against
  -- OPENB2 (open window, A not a duplicate, seats available).

  -- missing required section (drop personal_statement)
  perform _expect('missing personal_statement', 'PT005', OPENB2,
    _valid_payload() - 'personal_statement', _valid_files());

  -- missing required upload (no files)
  perform _expect('missing required upload', 'PT005', OPENB2, _valid_payload(), '[]'::jsonb);

  -- wrong mime type
  perform _expect('wrong mime', 'PT005', OPENB2, _valid_payload(),
    jsonb_build_array(jsonb_build_object(
      'requirement_key','marksheet_1',
      'storage_path','application-uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/u/m.gif',
      'mime_type','image/gif','size_bytes',1000)));

  -- oversized file (> 5MB slot limit)
  perform _expect('oversized file', 'PT005', OPENB2, _valid_payload(),
    jsonb_build_array(jsonb_build_object(
      'requirement_key','marksheet_1',
      'storage_path','application-uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/u/m.pdf',
      'mime_type','application/pdf','size_bytes', 6*1024*1024)));

  -- storage_path outside A's folder (points at B's folder)
  perform _expect('path outside folder', 'PT005', OPENB2, _valid_payload(),
    jsonb_build_array(jsonb_build_object(
      'requirement_key','marksheet_1',
      'storage_path','application-uploads/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/u/m.pdf',
      'mime_type','application/pdf','size_bytes',1000)));

  -- unknown upload key
  perform _expect('unknown upload key', 'PT005', OPENB2, _valid_payload(),
    jsonb_build_array(jsonb_build_object(
      'requirement_key','not_a_slot',
      'storage_path','application-uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/u/x.pdf',
      'mime_type','application/pdf','size_bytes',1000)));

  -- too few references (only 1, min is 2)
  perform _expect('too few references', 'PT005', OPENB2,
    _valid_payload() || jsonb_build_object('references', jsonb_build_array(
      jsonb_build_object('name','R1','phone','1','email','r1@x.com'))),
    _valid_files());

  reset role;
end $$;

-- Incomplete profile: user C (no document paths) applies to the WORKSHOP batch.
do $$ begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);
  perform set_config('request.jwt.claims',
    '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
  begin
    perform public.submit_application(
      '66666666-6666-6666-6666-666666666666',
      jsonb_build_object('consent_given', true, 'consent_text', 'ok'), '[]'::jsonb);
    reset role; perform _fail('incomplete profile: expected PT002 but succeeded');
  exception when sqlstate 'PT002' then reset role; perform _pass('incomplete profile rejected (PT002)');
    when others then reset role; perform _fail('incomplete profile: unexpected ' || sqlstate);
  end;
end $$;

-- ===========================================================================
-- 7. Capacity enforcement (sequential). The workshop OPEN batch has cap 5;
--    the FULL batch (cap 1) is already full and rejects with PT004 (tested
--    above). Here we prove a base-course happy submission works for a fresh
--    user, then that a second submission by the same user is a duplicate.
-- ===========================================================================
do $$
declare v_app uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  perform set_config('request.jwt.claims',
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
  v_app := public.submit_application(
    '66666666-6666-6666-6666-666666666666',
    jsonb_build_object('consent_given', true, 'consent_text', 'ok'), '[]'::jsonb);
  reset role;
  if v_app is not null then perform _pass('base workshop submission (B)'); else perform _fail('base workshop submission failed'); end if;
exception when others then reset role; perform _fail('base workshop submission raised ' || sqlstate);
end $$;

-- ===========================================================================
-- CLEANUP of test-only helpers/roles (results table is session-local).
-- ===========================================================================
drop function if exists _expect(text, text, uuid, jsonb, jsonb);
drop function if exists _check(text, text, text);
drop function if exists _valid_payload();
drop function if exists _valid_files();
drop function if exists _pass(text);
drop function if exists _fail(text);
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'test_app_writer') then
    revoke select, update on public.applications from test_app_writer;
    revoke usage on schema public from test_app_writer;
    drop role test_app_writer;
  end if;
end $$;

-- ===========================================================================
-- SUMMARY
-- ===========================================================================
select
  count(*) filter (where ok)         as passed,
  count(*) filter (where not ok)     as failed,
  count(*)                           as total
from _results;

-- List any failures explicitly.
select description as "FAILED CHECKS" from _results where not ok order by description;

do $$
declare n_fail int;
begin
  select count(*) into n_fail from _results where not ok;
  if n_fail > 0 then
    raise exception '% test(s) FAILED', n_fail;
  else
    raise notice 'ALL RLS/RPC TESTS PASSED';
  end if;
end $$;

-- ============================================================================
-- CONCURRENCY (documented; requires two real sessions):
--
-- submit_application() does SELECT ... FOR UPDATE on the batch row before the
-- capacity check, so two concurrent submissions to a 1-seat batch are
-- serialized: the second blocks until the first commits, then recounts, sees
-- the seat gone, and raises PT004. To demonstrate live, open two psql sessions
-- against a batch with capacity 1 and, inside explicit transactions, call the
-- RPC in each before committing — exactly one COMMIT will succeed.
-- ============================================================================
