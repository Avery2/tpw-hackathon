-- Account-free, SYNTHETIC-ONLY sandbox RPCs. Historical 001 is unchanged.
-- Operator applies ONLY to avery-neon-connection. Disabled until the separately
-- host-pinned admin command explicitly enables it; migration reruns preserve it.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.tpw_submit(jsonb)'::regprocedure
                 AND proowner = current_user::regrole) OR EXISTS (
    SELECT 1 FROM pg_class WHERE oid IN ('public.organizations'::regclass, 'public.submissions'::regclass)
      AND (relowner <> current_user::regrole OR relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'Apply 002 as the same trusted owner of 001 and the answer tables';
  END IF;
  IF pg_has_role('anonymous', current_user, 'MEMBER') OR pg_has_role('authenticated', current_user, 'MEMBER') THEN
    RAISE EXCEPTION 'API roles must not inherit the migration owner';
  END IF;
END
$check$;

CREATE TABLE IF NOT EXISTS tpw_private.sandbox_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO tpw_private.sandbox_settings(singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE tpw_private.sandbox_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tpw_private.sandbox_settings FROM PUBLIC, anonymous, authenticated;
CREATE INDEX IF NOT EXISTS tpw_sandbox_request_budget
  ON tpw_private.submission_requests(created_at) WHERE actor_user_id = 'public-sandbox';

-- One active root/size/UUID validator, invoked before either wrapper resolves
-- an organization, and defensively again by the private canonical saver.
CREATE OR REPLACE FUNCTION tpw_private.submission_request_id(p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE request_uuid uuid;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The submission was not readable. Your answers have not been saved.';
  END IF;
  -- Data API has already parsed JSON: bound its complete canonical representation,
  -- including ignored extensions. This byte cap is deliberately conservative.
  IF octet_length(convert_to(p_payload::text, 'UTF8')) > 250000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The submission is too large. Your answers have not been saved.';
  END IF;
  IF jsonb_typeof(p_payload -> 'submissionId') IS DISTINCT FROM 'string' OR
     (p_payload ->> 'submissionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The submission needs a UUID retry ID.';
  END IF;
  request_uuid := (p_payload ->> 'submissionId')::uuid;
  RETURN request_uuid;
END
$fn$;

-- Canonical validation and append-only saving from 001. No API role can call
-- this function or choose its trusted org/actor arguments. Never call auth here.
CREATE OR REPLACE FUNCTION tpw_private.save_submission(p_payload jsonb, p_org_id text, p_actor_user_id text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
DECLARE
  org public.organizations%ROWTYPE; request_uuid uuid; previous_id text;
  p jsonb; site jsonb; program_name text; program_id text; status text; start_day text; end_day text; notes text;
  hours numeric; participants numeric; completed numeric; code text; yard text; site_key text; seen text[];
  clean_sites jsonb; clean_programs jsonb := '[]'; assignments jsonb; prisons jsonb;
  total_participants numeric; total_completed numeric; row_count integer := 0;
  answer jsonb; answer_hash text; record_hash text; record_id text; reference text;
  saved tpw_private.submission_requests%ROWTYPE; receipt jsonb; doc jsonb;
  received timestamptz; budget_now timestamptz; local_day date; facilities jsonb := tpw_private.facilities();
BEGIN
  request_uuid := tpw_private.submission_request_id(p_payload);
  SELECT o.* INTO STRICT org FROM public.organizations o WHERE o.id = p_org_id;
  previous_id := tpw_private.optional_id(p_payload -> 'previousSubmissionId', '^[A-Za-z0-9_-]{1,64}$', 'The previous submission ID');
  -- The requested period is intentionally ignored, like buildFormRows_ in Code.gs.
  IF jsonb_typeof(p_payload -> 'programs') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The submission has no programs.';
  END IF;
  IF jsonb_array_length(p_payload -> 'programs') NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Submit between 1 and 60 programs.';
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(p_payload -> 'programs') LOOP
    IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each program must contain program answers.';
    END IF;
    program_name := tpw_private.clean_text(p -> 'name');
    IF program_name = '' OR tpw_private.js_length(program_name) > 120 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each program needs a name of at most 120 characters.';
    END IF;
    status := p ->> 'status';
    IF status IS NULL OR status NOT IN ('In Progress', 'Completed') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose In Progress or Completed for each program.';
    END IF;
    start_day := tpw_private.date_field(p -> 'startDate'); end_day := tpw_private.date_field(p -> 'endDate');
    IF start_day = '' OR (status = 'Completed' AND end_day = '') OR (end_day <> '' AND end_day < start_day) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A start date is required, Completed programs need an end date, and the end cannot precede the start.';
    END IF;
    hours := tpw_private.number_field(p -> 'courseHours', 5000, false, 'Course hours');
    program_id := tpw_private.optional_id(p -> 'id', '^[A-Za-z0-9_-]{1,80}$', 'The program ID');
    IF p ? 'notes' AND jsonb_typeof(p -> 'notes') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Optional context must be text.';
    END IF;
    notes := coalesce(p ->> 'notes', '');
    IF tpw_private.js_length(notes) > 2000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Use no more than 2,000 characters for optional context.';
    END IF;
    -- Trim only the ends, preserving line breaks and spacing inside context.
    notes := tpw_private.trim_text(notes);
    IF jsonb_typeof(p -> 'sites') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each program needs a prison and yard.';
    END IF;
    IF jsonb_array_length(p -> 'sites') NOT BETWEEN 1 AND 130 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each program needs between 1 and 130 prison/yard sites.';
    END IF;
    seen := '{}'; clean_sites := '[]'; total_participants := 0; total_completed := 0;
    FOR site IN SELECT value FROM jsonb_array_elements(p -> 'sites') LOOP
      IF jsonb_typeof(site) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each site needs a known prison and yard.';
      END IF;
      code := site ->> 'facilityCode'; yard := tpw_private.clean_text(site -> 'yard');
      IF code IS NULL OR NOT facilities ? code THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose a known California prison.';
      END IF;
      IF yard = '' OR tpw_private.js_length(yard) > 40 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The yard name is missing or longer than 40 characters.';
      END IF;
      site_key := code || '|' || tpw_private.unicode_lower(yard);
      IF site_key = ANY(seen) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A program lists the same prison and yard twice.';
      END IF;
      seen := array_append(seen, site_key);
      participants := tpw_private.number_field(site -> 'participants', 100000, true, 'Participants');
      completed := tpw_private.number_field(site -> 'completed', 100000, true, 'Completed participants');
      IF completed > participants THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Completed participants cannot be more than participants.';
      END IF;
      clean_sites := clean_sites || jsonb_build_array(jsonb_build_object('code', code, 'yard', yard, 'participants', participants, 'completed', completed));
      total_participants := total_participants + participants; total_completed := total_completed + completed;
      row_count := row_count + 1;
    END LOOP;
    SELECT jsonb_agg(jsonb_build_object('code', a.code, 'yards', a.yards) ORDER BY a.first_n) INTO assignments
      FROM (SELECT e.value ->> 'code' AS code, jsonb_agg(e.value -> 'yard' ORDER BY e.n) AS yards, min(e.n) AS first_n
            FROM jsonb_array_elements(clean_sites) WITH ORDINALITY e(value,n) GROUP BY e.value ->> 'code') a;
    clean_programs := clean_programs || jsonb_build_array(jsonb_build_object(
      'id', program_id, 'name', program_name, 'status', status, 'startDate', start_day, 'endDate', end_day,
      'courseHours', hours, 'notes', notes, 'sites', clean_sites, 'assignments', assignments,
      'participants', total_participants, 'participantsCompleted', total_completed));
  END LOOP;
  -- Canonical answer fields only: no time, filing quarter, identity, retry ID,
  -- browser totals, arbitrary extensions or server-derived organization name.
  answer := jsonb_build_object('orgId', org.id, 'previousSubmissionId', previous_id, 'programs', clean_programs);
  answer_hash := encode(sha256(convert_to(answer::text, 'UTF8')), 'hex');
  -- Serialize the global guest budget before the per-org request lock, always
  -- in this order. A changing JWT subject cannot evade the shared write budget.
  IF p_actor_user_id = 'public-sandbox' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tpw-public-sandbox-global', 0));
  END IF;
  -- Serialize concurrent attempts BEFORE the durable existing-request lookup.
  -- A 64-bit collision only serializes unrelated requests; the PK remains authoritative.
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(org.id, request_uuid::text)::text, 0));
  SELECT * INTO saved FROM tpw_private.submission_requests WHERE org_id = org.id AND request_id = request_uuid;
  IF FOUND THEN
    IF p_actor_user_id = 'public-sandbox' AND saved.actor_user_id <> 'public-sandbox' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This retry ID is not a public sandbox request. Your answers have not been saved.';
    END IF;
    IF saved.hash <> answer_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TPW_RETRY_CONFLICT: This retry ID was already used for different answers. Nothing was changed. Keep your answers and contact TPW.';
    END IF;
    RETURN saved.receipt;
  END IF;
  -- The global guest lock is held through commit/rollback. Check
  -- only NEW requests: exact durable retries remain recoverable at either cap.
  budget_now := clock_timestamp();
  IF p_actor_user_id = 'public-sandbox' AND (
    (SELECT count(*) FROM tpw_private.submission_requests
      WHERE actor_user_id = 'public-sandbox' AND created_at > budget_now - interval '1 minute') >= 30 OR
    (SELECT count(*) FROM tpw_private.submission_requests
      WHERE actor_user_id = 'public-sandbox' AND created_at > budget_now - interval '1 day') >= 300
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'The sample workspace is busy. Your answers are still on the page. Please retry later or contact TPW.';
  END IF;
  record_hash := encode(sha256(convert_to(jsonb_build_array(org.id, request_uuid::text)::text, 'UTF8')), 'hex');
  record_id := 'neon-api:' || record_hash; reference := upper(right(record_hash, 12));
  received := clock_timestamp(); local_day := (received AT TIME ZONE 'America/Los_Angeles')::date;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', facilities ->> a.code, 'yards', a.yards) ORDER BY a.code), '[]'::jsonb)
    INTO prisons FROM (
      SELECT d.code, jsonb_agg(to_jsonb(d.yard) ORDER BY d.yard) AS yards FROM (
        SELECT DISTINCT s.value ->> 'code' AS code, s.value ->> 'yard' AS yard
        FROM jsonb_array_elements(clean_programs) p CROSS JOIN LATERAL jsonb_array_elements(p.value -> 'sites') s
      ) d GROUP BY d.code
    ) a;
  receipt := jsonb_build_object('ok', true, 'submissionId', reference, 'reference', reference,
    'rows', row_count, 'organization', org.name, 'signedIn', p_actor_user_id <> 'public-sandbox');
  doc := jsonb_build_object('id', record_hash, 'schemaVersion', 1, 'orgId', org.id, 'organization', org.name,
    'submittedAt', to_char(received AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reportingPeriod', jsonb_build_object('quarter', extract(quarter FROM local_day)::integer, 'year', extract(year FROM local_day)::integer),
    'previousSubmissionId', previous_id, 'synthetic', true, 'testData', true, 'prisons', prisons, 'programs', clean_programs);
  INSERT INTO public.submissions(id, org_id, document, received_at) VALUES (record_id, org.id, doc, received);
  INSERT INTO tpw_private.submission_requests(org_id, request_id, hash, submission_id, receipt, actor_user_id, created_at)
    VALUES (org.id, request_uuid, answer_hash, record_id, receipt, p_actor_user_id, CASE WHEN p_actor_user_id = 'public-sandbox' THEN received ELSE transaction_timestamp() END);
  -- The two inserts and receipt are one Data API RPC transaction. Any error rolls both back.
  RETURN receipt;
END
$fn$;

-- Original authenticated identity, membership and organization resolution.
CREATE OR REPLACE FUNCTION public.tpw_submit(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
DECLARE
  uid text := nullif(auth.user_id(), ''); staff boolean; org public.organizations%ROWTYPE;
  supplied_id text; supplied_name text; candidates integer; request_uuid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Please sign in again. Your answers are still on the page.'; END IF;
  staff := public.tpw_is_staff();
  IF NOT staff AND NOT EXISTS (SELECT 1 FROM tpw_private.memberships m WHERE m.user_id = uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Your account is not assigned to an organization. Contact TPW. Your answers are still on the page.';
  END IF;
  request_uuid := tpw_private.submission_request_id(p_payload);
  supplied_id := tpw_private.optional_id(p_payload -> 'orgId', '^[a-z0-9][a-z0-9-]{0,63}$', 'The organization ID');
  supplied_name := tpw_private.clean_text(p_payload -> 'organization');
  IF p_payload ? 'organization' AND p_payload -> 'organization' <> 'null'::jsonb AND
     jsonb_typeof(p_payload -> 'organization') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The organization name must be text.';
  END IF;
  IF supplied_id = '' AND NOT staff THEN
    SELECT count(*), min(m.org_id) INTO candidates, supplied_id FROM tpw_private.memberships m WHERE m.user_id = uid;
    IF candidates <> 1 THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Select one of your assigned organizations.'; END IF;
  END IF;
  -- Staff can resolve a name, but it must identify exactly one existing organization.
  SELECT count(*) INTO candidates FROM public.organizations o
    WHERE public.tpw_can_access(o.id)
      AND (CASE WHEN coalesce(supplied_id, '') <> '' THEN o.id = supplied_id
                ELSE supplied_name <> '' AND tpw_private.unicode_lower(tpw_private.clean_text(to_jsonb(o.name))) = tpw_private.unicode_lower(supplied_name) END)
      AND (supplied_name = '' OR tpw_private.unicode_lower(tpw_private.clean_text(to_jsonb(o.name))) = tpw_private.unicode_lower(supplied_name));
  IF candidates <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Select one existing organization that matches your account and organization name. Your answers have not been saved.';
  END IF;
  SELECT o.* INTO STRICT org FROM public.organizations o
    WHERE public.tpw_can_access(o.id)
      AND (CASE WHEN coalesce(supplied_id, '') <> '' THEN o.id = supplied_id
                ELSE tpw_private.unicode_lower(tpw_private.clean_text(to_jsonb(o.name))) = tpw_private.unicode_lower(supplied_name) END)
      AND (supplied_name = '' OR tpw_private.unicode_lower(tpw_private.clean_text(to_jsonb(o.name))) = tpw_private.unicode_lower(supplied_name));
  RETURN tpw_private.save_submission(p_payload, org.id, uid);
END
$fn$;

-- Both RPCs fail closed, including retries when the operator disables access.
CREATE OR REPLACE FUNCTION tpw_private.require_sandbox() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tpw_private.sandbox_settings WHERE singleton AND enabled) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The sample workspace is unavailable. Your answers are still on the page. Contact TPW.';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tpw_sandbox_dashboard(p_org_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
DECLARE orgs jsonb; docs jsonb;
BEGIN
  PERFORM tpw_private.require_sandbox();
  IF p_org_id IS NOT NULL AND p_org_id NOT IN ('org-1', 'org-2') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Select Org 1 or Org 2 in the sample workspace.';
  END IF;
  SELECT coalesce(jsonb_agg(tpw_private.safe_json(o.profile, 'profile') || jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.id), '[]'::jsonb)
    INTO orgs FROM public.organizations o
    WHERE o.id IN ('org-1', 'org-2') AND (p_org_id IS NULL OR o.id = p_org_id);
  SELECT coalesce(jsonb_agg(tpw_private.safe_json(s.document, 'document') || jsonb_build_object(
      'id', coalesce(nullif(CASE WHEN jsonb_typeof(s.document -> 'id') = 'string' THEN s.document ->> 'id' END, ''), s.id),
      'orgId', s.org_id, 'organization', o.name,
      'submittedAt', to_char(s.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) ORDER BY s.received_at, s.id), '[]'::jsonb)
    INTO docs FROM public.submissions s JOIN public.organizations o ON o.id = s.org_id
    WHERE s.org_id IN ('org-1', 'org-2') AND (p_org_id IS NULL OR s.org_id = p_org_id)
      -- Strict JSON booleans: strings/numbers/truthy values are NOT synthetic.
      AND (s.document -> 'synthetic' = 'true'::jsonb OR s.document -> 'testData' = 'true'::jsonb);
  RETURN jsonb_build_object('ok', true, 'orgs', orgs, 'submissions', docs);
END
$fn$;

CREATE OR REPLACE FUNCTION public.tpw_sandbox_submit(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
DECLARE supplied_id text; supplied_name text; request_uuid uuid; candidates integer; org_id text;
BEGIN
  PERFORM tpw_private.require_sandbox();
  request_uuid := tpw_private.submission_request_id(p_payload);
  supplied_id := tpw_private.optional_id(p_payload -> 'orgId', '^[a-z0-9][a-z0-9-]{0,63}$', 'The organization ID');
  supplied_name := tpw_private.clean_text(p_payload -> 'organization');
  IF p_payload ? 'organization' AND p_payload -> 'organization' <> 'null'::jsonb AND
     jsonb_typeof(p_payload -> 'organization') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The organization name must be text.';
  END IF;
  IF supplied_id <> '' AND supplied_id NOT IN ('org-1', 'org-2') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Select Org 1 or Org 2 in the sample workspace.';
  END IF;
  -- Fixed server scope, NEVER auth subject, memberships, browser demo account,
  -- staff claims or arbitrary existing organization records. A name alone may
  -- resolve only one of these two fictional organizations. Empty means Org 1.
  IF supplied_id = '' AND supplied_name = '' THEN supplied_id := 'org-1'; END IF;
  SELECT count(*), min(o.id) INTO candidates, org_id FROM public.organizations o
    WHERE o.id IN ('org-1', 'org-2')
      AND (supplied_id = '' OR o.id = supplied_id)
      AND (supplied_name = '' OR tpw_private.unicode_lower(tpw_private.clean_text(to_jsonb(o.name))) = tpw_private.unicode_lower(supplied_name));
  IF candidates <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Select Org 1 or Org 2 with its matching name. Your answers have not been saved.';
  END IF;
  -- Saver forces both sample flags, filing quarter, canonical data, durable
  -- retry receipts and private-only actor metadata. No human identity is read.
  RETURN tpw_private.save_submission(p_payload, org_id, 'public-sandbox');
END
$fn$;

-- Preserve authenticated privileges. Anonymous has just these TWO entry points;
-- no raw table, profile/document, membership, auth RPC or private helper access.
REVOKE ALL ON FUNCTION public.tpw_sandbox_dashboard(text), public.tpw_sandbox_submit(jsonb) FROM PUBLIC, anonymous, authenticated;
GRANT USAGE ON SCHEMA public TO anonymous;
GRANT EXECUTE ON FUNCTION public.tpw_sandbox_dashboard(text), public.tpw_sandbox_submit(jsonb) TO anonymous;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tpw_private FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON SCHEMA tpw_private FROM PUBLIC, anonymous, authenticated;

-- Inherited grants cannot be undone by a direct REVOKE. Refuse an unsafe role
-- setup rather than silently claim the narrowly scoped RPC boundary is secure.
DO $acl$
DECLARE t text; c record; f record;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','submissions'] LOOP
    IF has_table_privilege('anonymous', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Anonymous has inherited raw-table privileges on %', t;
    END IF;
    FOR c IN SELECT attname FROM pg_attribute WHERE attrelid = format('public.%I', t)::regclass AND attnum > 0 AND NOT attisdropped LOOP
      IF has_column_privilege('anonymous', 'public.' || t, c.attname, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Anonymous has inherited column privileges on %.%', t, c.attname;
      END IF;
    END LOOP;
  END LOOP;
  IF has_schema_privilege('anonymous', 'tpw_private', 'USAGE,CREATE') THEN
    RAISE EXCEPTION 'Anonymous has inherited private schema access';
  END IF;
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'tpw_private' OR (n.nspname = 'public' AND p.proname IN ('tpw_submit','tpw_context','tpw_dashboard','tpw_can_access','tpw_is_staff')) LOOP
    IF has_function_privilege('anonymous', f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous has inherited access to a private/authenticated helper';
    END IF;
  END LOOP;
END
$acl$;
-- PostgREST must refresh its function/argument cache after new RPCs are added.
NOTIFY pgrst, 'reload schema';
COMMIT;
