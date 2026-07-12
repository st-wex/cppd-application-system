-- ============================================================================
-- 0006_seed.sql — reference data: categories + the 7 current courses
--
-- Idempotent (on conflict do nothing on the unique slugs) so the migration can
-- be re-applied safely. Requirement configs follow the shape documented in
-- 0003_courses.sql and src/lib/types/requirements.ts:
--   * Workshops           — base profile + consent only.
--   * Certificates        — qualifications, counselling experience, health
--                           disclosure, medication/allergies, personal
--                           statement, 2 references.
--   * Diplomas / Advanced — the certificate set PLUS employment PLUS document
--                           upload slots (3 marksheets + approval to commence).
-- ============================================================================

insert into public.course_categories (name, slug, sort_order) values
  ('Certificate Courses',      'certificate-courses',      1),
  ('Diploma Courses',          'diploma-courses',          2),
  ('Advanced Diploma Courses', 'advanced-diploma-courses', 3),
  ('Workshops',                'workshops',                4)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Certificate in Humanistic Integrative Counselling
-- ----------------------------------------------------------------------------
insert into public.courses (category_id, title, slug, description, is_active, requirements)
values (
  (select id from public.course_categories where slug = 'certificate-courses'),
  'Certificate in Humanistic Integrative Counselling',
  'certificate-humanistic-integrative-counselling',
  'An introductory certificate grounding you in the core theory and skills of humanistic integrative counselling.',
  true,
  jsonb_build_object(
    'intro_text', 'Please complete every section below. Your answers help us understand your background and readiness for the certificate.',
    'qualifications', true,
    'employment', false,
    'counselling_experience', true,
    'health_disclosure', true,
    'medication_allergies', true,
    'personal_statement', true,
    'references', jsonb_build_object('enabled', true, 'min', 2, 'max', 2),
    'uploads', '[]'::jsonb
  )
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Certificate in Self Development
-- ----------------------------------------------------------------------------
insert into public.courses (category_id, title, slug, description, is_active, requirements)
values (
  (select id from public.course_categories where slug = 'certificate-courses'),
  'Certificate in Self Development',
  'certificate-self-development',
  'A reflective certificate focused on personal growth, self-awareness and emotional resilience.',
  true,
  jsonb_build_object(
    'intro_text', 'This certificate is a personal journey. Please share your background honestly so we can support you well.',
    'qualifications', true,
    'employment', false,
    'counselling_experience', true,
    'health_disclosure', true,
    'medication_allergies', true,
    'personal_statement', true,
    'references', jsonb_build_object('enabled', true, 'min', 2, 'max', 2),
    'uploads', '[]'::jsonb
  )
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Diploma in Humanistic Integrative Counselling
-- ----------------------------------------------------------------------------
insert into public.courses (category_id, title, slug, description, is_active, requirements)
values (
  (select id from public.course_categories where slug = 'diploma-courses'),
  'Diploma in Humanistic Integrative Counselling',
  'diploma-humanistic-integrative-counselling',
  'A professional diploma developing you into a competent, ethical humanistic integrative counsellor.',
  true,
  jsonb_build_object(
    'intro_text', 'This professional diploma requires evidence of your prior study. Please complete every section and upload the requested documents.',
    'qualifications', true,
    'employment', true,
    'counselling_experience', true,
    'health_disclosure', true,
    'medication_allergies', true,
    'personal_statement', true,
    'references', jsonb_build_object('enabled', true, 'min', 2, 'max', 2),
    'uploads', jsonb_build_array(
      jsonb_build_object(
        'key', 'marksheet_1', 'label', 'Marksheet 1',
        'instructions', 'Upload your first-year Certificate-level marksheet / academic transcript.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'marksheet_2', 'label', 'Marksheet 2',
        'instructions', 'Upload your second-year marksheet / academic transcript.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'marksheet_3', 'label', 'Marksheet 3',
        'instructions', 'Upload your final-year marksheet / academic transcript.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'approval_to_commence', 'label', 'Approval to Commence Diploma',
        'instructions', 'Upload the signed "Approval to Commence Diploma" document provided by your certificate tutor.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      )
    )
  )
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Diploma in Clinical Supervision
-- ----------------------------------------------------------------------------
insert into public.courses (category_id, title, slug, description, is_active, requirements)
values (
  (select id from public.course_categories where slug = 'diploma-courses'),
  'Diploma in Clinical Supervision',
  'diploma-clinical-supervision',
  'A diploma preparing experienced practitioners to supervise counsellors and psychotherapists.',
  true,
  jsonb_build_object(
    'intro_text', 'This diploma is for practising counsellors. Please evidence your qualifications and current practice, and upload the requested documents.',
    'qualifications', true,
    'employment', true,
    'counselling_experience', true,
    'health_disclosure', true,
    'medication_allergies', true,
    'personal_statement', true,
    'references', jsonb_build_object('enabled', true, 'min', 2, 'max', 2),
    'uploads', jsonb_build_array(
      jsonb_build_object(
        'key', 'marksheet_1', 'label', 'Marksheet 1',
        'instructions', 'Upload the marksheet / transcript for your core counselling diploma.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'marksheet_2', 'label', 'Marksheet 2',
        'instructions', 'Upload a marksheet / transcript for any further counselling qualification.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'marksheet_3', 'label', 'Marksheet 3',
        'instructions', 'Upload a marksheet / transcript for your most recent relevant qualification.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'approval_to_commence', 'label', 'Approval to Commence Diploma',
        'instructions', 'Upload the signed "Approval to Commence Diploma" document confirming your readiness to train as a supervisor.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      )
    )
  )
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Advanced Diploma in Humanistic Integrative Counselling
-- ----------------------------------------------------------------------------
insert into public.courses (category_id, title, slug, description, is_active, requirements)
values (
  (select id from public.course_categories where slug = 'advanced-diploma-courses'),
  'Advanced Diploma in Humanistic Integrative Counselling',
  'advanced-diploma-humanistic-integrative-counselling',
  'An advanced diploma deepening your clinical practice and extending your theoretical range.',
  true,
  jsonb_build_object(
    'intro_text', 'This advanced diploma builds on completed Diploma-level study. Please evidence your Diploma-level results and upload the requested documents.',
    'qualifications', true,
    'employment', true,
    'counselling_experience', true,
    'health_disclosure', true,
    'medication_allergies', true,
    'personal_statement', true,
    'references', jsonb_build_object('enabled', true, 'min', 2, 'max', 2),
    'uploads', jsonb_build_array(
      jsonb_build_object(
        'key', 'marksheet_1', 'label', 'Marksheet 1',
        'instructions', 'Upload your first Diploma-level marksheet / academic transcript.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'marksheet_2', 'label', 'Marksheet 2',
        'instructions', 'Upload your second Diploma-level marksheet / academic transcript.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'marksheet_3', 'label', 'Marksheet 3',
        'instructions', 'Upload your final Diploma-level marksheet / academic transcript.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      ),
      jsonb_build_object(
        'key', 'approval_to_commence', 'label', 'Approval to Commence Diploma',
        'instructions', 'Upload the signed "Approval to Commence Diploma" document provided by your Diploma tutor.',
        'required', true,
        'accepted_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'),
        'max_size_mb', 10
      )
    )
  )
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Understanding Your Relationship With Food (Workshop)
-- ----------------------------------------------------------------------------
insert into public.courses (category_id, title, slug, description, is_active, requirements)
values (
  (select id from public.course_categories where slug = 'workshops'),
  'Understanding Your Relationship With Food Workshop',
  'understanding-your-relationship-with-food-workshop',
  'A short workshop exploring the emotional and psychological dimensions of our relationship with food.',
  true,
  jsonb_build_object(
    'intro_text', 'This workshop only needs your basic profile and consent to book a place.',
    'qualifications', false,
    'employment', false,
    'counselling_experience', false,
    'health_disclosure', false,
    'medication_allergies', false,
    'personal_statement', false,
    'references', jsonb_build_object('enabled', false, 'min', 0, 'max', 0),
    'uploads', '[]'::jsonb
  )
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Nourish 2: Your Best Self (Workshop)
-- ----------------------------------------------------------------------------
insert into public.courses (category_id, title, slug, description, is_active, requirements)
values (
  (select id from public.course_categories where slug = 'workshops'),
  'Nourish 2: Your Best Self',
  'nourish-2-your-best-self',
  'A follow-on workshop building practical habits for sustained emotional and physical wellbeing.',
  true,
  jsonb_build_object(
    'intro_text', 'This workshop only needs your basic profile and consent to book a place.',
    'qualifications', false,
    'employment', false,
    'counselling_experience', false,
    'health_disclosure', false,
    'medication_allergies', false,
    'personal_statement', false,
    'references', jsonb_build_object('enabled', false, 'min', 0, 'max', 0),
    'uploads', '[]'::jsonb
  )
)
on conflict (slug) do nothing;
