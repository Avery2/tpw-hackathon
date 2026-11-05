-- Sandbox Data API migration. Apply ONLY to the existing avery-neon-connection
-- branch, as the owner of public.organizations and public.submissions.
-- No existing answer documents or organization records are modified.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, pg_temp;

-- Fail closed if this is not the expected pre-existing database contract.
DO $check$
DECLARE r text;
BEGIN
  IF to_regcollation('pg_catalog.unicode') IS NULL THEN
    RAISE EXCEPTION 'Expected PostgreSQL 17+ with the root ICU pg_catalog.unicode collation';
  END IF;
  IF to_regprocedure('auth.user_id()') IS NULL THEN
    RAISE EXCEPTION 'Expected auth.user_id() returning the verified JWT subject';
  END IF;
  IF (SELECT prorettype <> 'text'::regtype FROM pg_proc WHERE oid = 'auth.user_id()'::regprocedure) THEN
    RAISE EXCEPTION 'Expected auth.user_id() to return text';
  END IF;
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.submissions') IS NULL THEN
    RAISE EXCEPTION 'Import the existing organizations/submissions tables first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.organizations'::regclass, 'public.submissions'::regclass)
             AND (NOT pg_has_role(current_user, relowner, 'USAGE') OR relforcerowsecurity)) THEN
    RAISE EXCEPTION 'Apply as table owner, with ordinary owner-bypass RLS (not FORCE RLS)';
  END IF;
  FOREACH r IN ARRAY ARRAY['authenticated', 'anonymous'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND NOT rolsuper AND NOT rolbypassrls) THEN
      RAISE EXCEPTION 'Expected a nonprivileged Data API role: %', r;
    END IF;
    IF pg_has_role(r, current_user, 'MEMBER') THEN
      RAISE EXCEPTION 'API role % must not inherit the migration owner', r;
    END IF;
  END LOOP;
END
$check$;

CREATE SCHEMA IF NOT EXISTS tpw_private;
REVOKE ALL ON SCHEMA tpw_private FROM PUBLIC, anonymous, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA tpw_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA tpw_private REVOKE ALL ON TABLES FROM PUBLIC, anonymous, authenticated;

CREATE TABLE IF NOT EXISTS tpw_private.memberships (
  user_id text NOT NULL CHECK (length(user_id) > 0),
  org_id text NOT NULL REFERENCES public.organizations(id),
  PRIMARY KEY (user_id, org_id)
);
CREATE TABLE IF NOT EXISTS tpw_private.staff_users (
  user_id text PRIMARY KEY CHECK (length(user_id) > 0)
);
CREATE TABLE IF NOT EXISTS tpw_private.submission_requests (
  org_id text NOT NULL REFERENCES public.organizations(id),
  request_id uuid NOT NULL,
  hash text NOT NULL,
  submission_id text NOT NULL REFERENCES public.submissions(id),
  receipt jsonb NOT NULL,
  actor_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (org_id, request_id)
);
ALTER TABLE tpw_private.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpw_private.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpw_private.submission_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA tpw_private FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.tpw_is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
  SELECT nullif(auth.user_id(), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM tpw_private.staff_users s WHERE s.user_id = auth.user_id()
  )
$fn$;
CREATE OR REPLACE FUNCTION public.tpw_can_access(orgid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
  SELECT nullif(auth.user_id(), '') IS NOT NULL AND (
    public.tpw_is_staff() OR EXISTS (
      SELECT 1 FROM tpw_private.memberships m WHERE m.user_id = auth.user_id() AND m.org_id = orgid
    )
  )
$fn$;
REVOKE ALL ON FUNCTION public.tpw_is_staff(), public.tpw_can_access(text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.tpw_is_staff(), public.tpw_can_access(text) TO authenticated;

-- Closed, typed, recursive allowlists. Never return an arbitrary JSON subtree,
-- including inside profiles, sites, assignments, totals or programCatalog.
-- Historical aggregate-only programs keep their totals and missing detail stays missing.
CREATE OR REPLACE FUNCTION tpw_private.safe_json(v jsonb, kind text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  strings text[] := '{}'; numbers text[] := '{}'; booleans text[] := '{}';
  objects jsonb := '{}'; arrays jsonb := '{}';
  result jsonb := '{}'; k text; subkind text; items jsonb;
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RETURN result; END IF;
  CASE kind
    WHEN 'profile' THEN strings := ARRAY['description']; arrays := '{"programCatalog":"catalog"}';
    WHEN 'catalog' THEN strings := ARRAY['id','name'];
    WHEN 'document' THEN
      strings := ARRAY['id','orgId','organization','submittedAt','previousSubmissionId'];
      numbers := ARRAY['schemaVersion']; booleans := ARRAY['synthetic','testData'];
      objects := '{"reportingPeriod":"period","totals":"totals"}';
      arrays := '{"prisons":"prison","programs":"program"}';
    WHEN 'period' THEN numbers := ARRAY['quarter','year'];
    WHEN 'totals' THEN numbers := ARRAY['participants','participantsCompleted','courseHours','programs','facilities','hours','completed'];
    WHEN 'program' THEN
      strings := ARRAY['id','name','status','startDate','endDate','notes'];
      numbers := ARRAY['courseHours','participants','participantsCompleted'];
      arrays := '{"sites":"site","assignments":"assignment"}';
    WHEN 'site' THEN strings := ARRAY['code','yard']; numbers := ARRAY['participants','completed'];
    WHEN 'assignment' THEN strings := ARRAY['code']; arrays := '{"yards":"string"}';
    WHEN 'prison' THEN strings := ARRAY['code','name']; arrays := '{"yards":"string"}';
    ELSE RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown safe JSON shape';
  END CASE;
  FOREACH k IN ARRAY strings LOOP
    IF jsonb_typeof(v -> k) = 'string' THEN result := result || jsonb_build_object(k, v -> k); END IF;
  END LOOP;
  FOREACH k IN ARRAY numbers LOOP
    IF jsonb_typeof(v -> k) = 'number' THEN result := result || jsonb_build_object(k, v -> k); END IF;
  END LOOP;
  FOREACH k IN ARRAY booleans LOOP
    IF jsonb_typeof(v -> k) = 'boolean' THEN result := result || jsonb_build_object(k, v -> k); END IF;
  END LOOP;
  FOR k, subkind IN SELECT key, value FROM jsonb_each_text(objects) LOOP
    IF jsonb_typeof(v -> k) = 'object' THEN
      result := result || jsonb_build_object(k, tpw_private.safe_json(v -> k, subkind));
    END IF;
  END LOOP;
  FOR k, subkind IN SELECT key, value FROM jsonb_each_text(arrays) LOOP
    IF jsonb_typeof(v -> k) = 'array' THEN
      SELECT coalesce(jsonb_agg(CASE WHEN subkind = 'string' THEN e.value
             ELSE tpw_private.safe_json(e.value, subkind) END ORDER BY e.n), '[]'::jsonb)
        INTO items FROM jsonb_array_elements(v -> k) WITH ORDINALITY e(value,n)
        WHERE jsonb_typeof(e.value) = CASE WHEN subkind = 'string' THEN 'string' ELSE 'object' END;
      result := result || jsonb_build_object(k, items);
    END IF;
  END LOOP;
  RETURN result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tpw_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
DECLARE uid text := nullif(auth.user_id(), ''); staff boolean; orgs jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Please sign in again.'; END IF;
  staff := public.tpw_is_staff();
  SELECT coalesce(jsonb_agg(tpw_private.safe_json(o.profile, 'profile') || jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.id), '[]'::jsonb)
    INTO orgs FROM public.organizations o WHERE public.tpw_can_access(o.id);
  RETURN jsonb_build_object('ok', true, 'userId', uid, 'isStaff', staff, 'orgs', orgs,
    'accountKey', CASE WHEN staff THEN 'tpw' WHEN jsonb_array_length(orgs) = 1 THEN orgs -> 0 ->> 'id' ELSE NULL END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.tpw_dashboard(p_org_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
DECLARE orgs jsonb; docs jsonb;
BEGIN
  IF nullif(auth.user_id(), '') IS NULL OR NOT (public.tpw_is_staff() OR EXISTS (
    SELECT 1 FROM tpw_private.memberships m WHERE m.user_id = auth.user_id()
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Your account is not assigned to an organization. Contact TPW.';
  END IF;
  IF p_org_id IS NOT NULL AND (NOT public.tpw_can_access(p_org_id) OR NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = p_org_id
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You do not have access to that organization.';
  END IF;
  SELECT coalesce(jsonb_agg(tpw_private.safe_json(o.profile, 'profile') || jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.id), '[]'::jsonb)
    INTO orgs FROM public.organizations o WHERE public.tpw_can_access(o.id) AND (p_org_id IS NULL OR o.id = p_org_id);
  SELECT coalesce(jsonb_agg(tpw_private.safe_json(s.document, 'document') || jsonb_build_object(
      'id', coalesce(nullif(CASE WHEN jsonb_typeof(s.document -> 'id') = 'string' THEN s.document ->> 'id' END, ''), s.id),
      'orgId', s.org_id, 'organization', o.name,
      'submittedAt', to_char(s.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) ORDER BY s.received_at, s.id), '[]'::jsonb)
    INTO docs FROM public.submissions s JOIN public.organizations o ON o.id = s.org_id
    WHERE public.tpw_can_access(s.org_id) AND (p_org_id IS NULL OR s.org_id = p_org_id);
  RETURN jsonb_build_object('ok', true, 'orgs', orgs, 'submissions', docs);
END
$fn$;
REVOKE ALL ON FUNCTION public.tpw_context(), public.tpw_dashboard(text) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.tpw_context(), public.tpw_dashboard(text) TO authenticated;

-- Pure validation helpers. No helper is exposed to API roles.
-- Explicit pg_temp LAST also prevents temporary domains shadowing built-in types.
CREATE OR REPLACE FUNCTION tpw_private.js_whitespace() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
$fn$;
CREATE OR REPLACE FUNCTION tpw_private.trim_text(v text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT regexp_replace(v, '^' || tpw_private.js_whitespace() || '+|' || tpw_private.js_whitespace() || '+$', '', 'g')
$fn$;
CREATE OR REPLACE FUNCTION tpw_private.unicode_lower(v text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  -- PostgreSQL 17's root ICU collation, independent of database/libc locale.
  SELECT lower(v COLLATE pg_catalog."unicode")
$fn$;
CREATE OR REPLACE FUNCTION tpw_private.clean_text(v jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT CASE WHEN jsonb_typeof(v) = 'string' THEN btrim(regexp_replace(
    v #>> '{}', tpw_private.js_whitespace() || '+', ' ', 'g')) ELSE '' END
$fn$;
CREATE OR REPLACE FUNCTION tpw_private.js_length(v text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT coalesce(sum(CASE WHEN ascii(c) > 65535 THEN 2 ELSE 1 END), 0)::integer
  FROM regexp_split_to_table(v, '') AS chars(c)
$fn$;
CREATE OR REPLACE FUNCTION tpw_private.optional_id(v jsonb, pattern text, label text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  IF v IS NULL OR v = 'null'::jsonb OR v = '""'::jsonb THEN RETURN ''; END IF;
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR (v #>> '{}') !~ pattern THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = label || ' is not valid. Your answers have not been saved.';
  END IF;
  RETURN v #>> '{}';
END
$fn$;
CREATE OR REPLACE FUNCTION tpw_private.date_field(v jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE t text; d date;
BEGIN
  IF v IS NULL OR v = 'null'::jsonb OR v = '""'::jsonb THEN RETURN ''; END IF;
  t := v #>> '{}';
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR t !~ '^(20[0-9]{2})-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Use a real date from 2000 through 2099.';
  END IF;
  BEGIN
    d := make_date(substring(t,1,4)::integer, substring(t,6,2)::integer, substring(t,9,2)::integer);
  EXCEPTION WHEN datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The start or end date is not a real date.';
  END;
  RETURN t;
END
$fn$;
CREATE OR REPLACE FUNCTION tpw_private.number_field(v jsonb, upper_limit numeric, whole boolean, label text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE n numeric;
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = label || ' must be a number, not text, blank or true/false.';
  END IF;
  n := (v #>> '{}')::numeric;
  IF n < 0 OR n > upper_limit OR (whole AND n <> trunc(n)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = label || ' is outside the allowed range or is not a whole count.';
  END IF;
  RETURN trim_scale(n);
END
$fn$;
CREATE OR REPLACE FUNCTION tpw_private.facilities() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $fn$
SELECT '{
  "ASP":"Avenal State Prison (ASP)",
  "CCI":"California Correctional Institution (CCI)",
  "CHCF":"California Health Care Facility (CHCF), Stockton",
  "CIM":"California Institution for Men (CIM)",
  "CIW":"California Institution for Women (CIW)",
  "CMC":"California Men’s Colony (CMC)",
  "CMF":"California Medical Facility (CMF)",
  "CRC":"California Rehabilitation Center (CRC)",
  "COR":"California State Prison, Corcoran (COR)",
  "LAC":"California State Prison, Los Angeles County (LAC)",
  "SAC":"California State Prison, Sacramento (SAC)",
  "SOL":"California State Prison, Solano (SOL)",
  "CAL":"Calipatria State Prison (CAL)",
  "CEN":"California State Prison, Centinela (CEN)",
  "CCWF":"Central California Women’s Facility (CCWF)",
  "CTF":"Correctional Training Facility (CTF)",
  "FSP":"Folsom State Prison (FSP)",
  "HDSP":"High Desert State Prison (HDSP)",
  "ISP":"Ironwood State Prison (ISP)",
  "KVSP":"Kern Valley State Prison (KVSP)",
  "MCSP":"Mule Creek State Prison (MCSP)",
  "NKSP":"North Kern State Prison (NKSP)",
  "PBSP":"Pelican Bay State Prison (PBSP)",
  "PVSP":"Pleasant Valley State Prison (PVSP)",
  "RJD":"Richard J. Donovan Correctional Facility (RJD)",
  "SVSP":"Salinas Valley State Prison (SVSP)",
  "SQ":"San Quentin Rehabilitation Center (SQ)",
  "SCC":"Sierra Conservation Center (SCC)",
  "SATF":"Substance Abuse Treatment Facility and State Prison, Corcoran (SATF-CSP, Corcoran)",
  "VSP":"Valley State Prison (VSP)",
  "WSP":"Wasco State Prison (WSP)"
}'::jsonb
$fn$;

CREATE OR REPLACE FUNCTION public.tpw_submit(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = off
AS $fn$
DECLARE
  uid text := nullif(auth.user_id(), ''); staff boolean; org public.organizations%ROWTYPE;
  supplied_id text; supplied_name text; candidates integer; request_uuid uuid; previous_id text;
  p jsonb; site jsonb; program_name text; program_id text; status text; start_day text; end_day text; notes text;
  hours numeric; participants numeric; completed numeric; code text; yard text; site_key text; seen text[];
  clean_sites jsonb; clean_programs jsonb := '[]'; assignments jsonb; prisons jsonb;
  total_participants numeric; total_completed numeric; row_count integer := 0;
  answer jsonb; answer_hash text; record_hash text; record_id text; reference text;
  saved tpw_private.submission_requests%ROWTYPE; receipt jsonb; doc jsonb;
  received timestamptz; local_day date; facilities jsonb := tpw_private.facilities();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Please sign in again. Your answers are still on the page.'; END IF;
  staff := public.tpw_is_staff();
  IF NOT staff AND NOT EXISTS (SELECT 1 FROM tpw_private.memberships m WHERE m.user_id = uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Your account is not assigned to an organization. Contact TPW. Your answers are still on the page.';
  END IF;
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
  -- Serialize concurrent attempts BEFORE the durable existing-request lookup.
  -- A 64-bit collision only serializes unrelated requests; the PK remains authoritative.
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(org.id, request_uuid::text)::text, 0));
  SELECT * INTO saved FROM tpw_private.submission_requests WHERE org_id = org.id AND request_id = request_uuid;
  IF FOUND THEN
    IF saved.hash <> answer_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TPW_RETRY_CONFLICT: This retry ID was already used for different answers. Nothing was changed. Keep your answers and contact TPW.';
    END IF;
    RETURN saved.receipt;
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
    'rows', row_count, 'organization', org.name, 'signedIn', true);
  doc := jsonb_build_object('id', record_hash, 'schemaVersion', 1, 'orgId', org.id, 'organization', org.name,
    'submittedAt', to_char(received AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reportingPeriod', jsonb_build_object('quarter', extract(quarter FROM local_day)::integer, 'year', extract(year FROM local_day)::integer),
    'previousSubmissionId', previous_id, 'synthetic', true, 'testData', true, 'prisons', prisons, 'programs', clean_programs);
  INSERT INTO public.submissions(id, org_id, document, received_at) VALUES (record_id, org.id, doc, received);
  INSERT INTO tpw_private.submission_requests(org_id, request_id, hash, submission_id, receipt, actor_user_id)
    VALUES (org.id, request_uuid, answer_hash, record_id, receipt, uid);
  -- The two inserts and receipt are one Data API RPC transaction. Any error rolls both back.
  RETURN receipt;
END
$fn$;
REVOKE ALL ON FUNCTION public.tpw_submit(jsonb) FROM PUBLIC, anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.tpw_submit(jsonb) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tpw_private FROM PUBLIC, anonymous, authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
-- Restrictive guards also constrain any pre-existing permissive SELECT/ALL policy.
-- Policies are created once; reruns do not remove or replace unrelated policies.
DO $policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.organizations'::regclass AND polname = 'tpw_org_select') THEN
    CREATE POLICY tpw_org_select ON public.organizations FOR SELECT TO authenticated USING (public.tpw_can_access(id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.organizations'::regclass AND polname = 'tpw_org_guard') THEN
    CREATE POLICY tpw_org_guard ON public.organizations AS RESTRICTIVE FOR SELECT TO authenticated USING (public.tpw_can_access(id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.submissions'::regclass AND polname = 'tpw_submission_select') THEN
    CREATE POLICY tpw_submission_select ON public.submissions FOR SELECT TO authenticated USING (public.tpw_can_access(org_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.submissions'::regclass AND polname = 'tpw_submission_guard') THEN
    CREATE POLICY tpw_submission_guard ON public.submissions AS RESTRICTIVE FOR SELECT TO authenticated USING (public.tpw_can_access(org_id));
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy p WHERE
      ((p.polrelid = 'public.organizations'::regclass AND p.polname = 'tpw_org_guard') OR
       (p.polrelid = 'public.submissions'::regclass AND p.polname = 'tpw_submission_guard'))
      AND (p.polpermissive OR p.polcmd <> 'r' OR p.polroles <> ARRAY['authenticated'::regrole]::oid[] OR
           pg_get_expr(p.polqual, p.polrelid) IS DISTINCT FROM
             CASE WHEN p.polrelid = 'public.organizations'::regclass THEN 'public.tpw_can_access(id)'
                  ELSE 'public.tpw_can_access(org_id)' END)
  ) THEN
    RAISE EXCEPTION 'An existing TPW guard policy has an unexpected definition; admin review required';
  END IF;
END
$policies$;

-- Undo Neon broad table AND column grants, then expose only safe index columns.
-- A table-level REVOKE alone does not remove existing column-level grants.
REVOKE ALL ON public.organizations, public.submissions FROM PUBLIC, anonymous, authenticated;
DO $columns$
DECLARE t text; cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','submissions'] LOOP
    SELECT string_agg(quote_ident(attname), ', ') INTO cols FROM pg_attribute
      WHERE attrelid = format('public.%I', t)::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.%I FROM PUBLIC, anonymous, authenticated', cols, t);
  END LOOP;
END
$columns$;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT (id, name) ON public.organizations TO authenticated;
GRANT SELECT (id, org_id, received_at) ON public.submissions TO authenticated;

-- Detect inherited grants: revoking only a role's direct ACL cannot undo an
-- inherited role's broad privileges. Abort instead of claiming this is secured.
DO $acl$
DECLARE r text; t text; c record;
BEGIN
  FOREACH r IN ARRAY ARRAY['anonymous', 'authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['organizations','submissions'] LOOP
      IF has_table_privilege(r, 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'Inherited write privilege remains for % on %; audit role memberships first', r, t;
      END IF;
      FOR c IN SELECT attname FROM pg_attribute WHERE attrelid = format('public.%I', t)::regclass AND attnum > 0 AND NOT attisdropped LOOP
        IF has_column_privilege(r, 'public.' || t, c.attname, 'INSERT,UPDATE,REFERENCES') OR
          (has_column_privilege(r, 'public.' || t, c.attname, 'SELECT') AND NOT
            (r = 'authenticated' AND ((t = 'organizations' AND c.attname IN ('id','name')) OR
                                     (t = 'submissions' AND c.attname IN ('id','org_id','received_at'))))) THEN
          RAISE EXCEPTION 'Unsafe inherited column privilege remains for % on %.%', r, t, c.attname;
        END IF;
      END LOOP;
    END LOOP;
    IF has_schema_privilege(r, 'tpw_private', 'USAGE,CREATE') THEN
      RAISE EXCEPTION 'Inherited access to tpw_private remains for %', r;
    END IF;
  END LOOP;
END
$acl$;
COMMIT;
