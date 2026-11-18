-- OFFLINE TEST ONLY, after test-bootstrap.sql and 001_data_api.sql twice.
-- No real people or real organizations. test.mjs creates an isolated local cluster.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text, marker text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text; actual_message text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE, actual_message = MESSAGE_TEXT;
    IF actual_state <> expected_state OR (marker IS NOT NULL AND position(marker IN actual_message) = 0)
       OR (expected_state = '22023' AND marker IS NULL AND position('TPW_RETRY_CONFLICT' IN actual_message) > 0) THEN
      RAISE EXCEPTION 'Expected % / %, got % / %', expected_state, marker, actual_state, actual_message;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Expected exception %, but statement succeeded', expected_state;
END $$;
INSERT INTO tpw_private.memberships VALUES ('sample-member-a','test-org-a'), ('sample-member-b','test-org-b'), ('sample-multi','test-org-a'), ('sample-multi','test-org-b');
INSERT INTO tpw_private.staff_users VALUES ('sample-staff');
SELECT pg_temp.assert((SELECT count(*) = 1 FROM public.submissions), 'migration does not rewrite imported records');
SELECT pg_temp.assert((SELECT document ->> 'token' = 'fixture-secret' FROM public.submissions), 'raw history remains unchanged');
SELECT pg_temp.assert((SELECT count(*) = 31 FROM jsonb_object_keys(tpw_private.facilities())), '31 facilities');
SELECT pg_temp.assert(tpw_private.date_field('"2024-02-29"') = '2024-02-29', 'valid leap date');
SELECT pg_temp.expect_error($$SELECT tpw_private.date_field('"2023-02-29"')$$, '22023');
SELECT pg_temp.expect_error($$SELECT tpw_private.date_field('"2100-01-01"')$$, '22023');
SELECT pg_temp.assert(tpw_private.js_length('😀') = 2, 'JavaScript UTF-16 length');
SELECT pg_temp.assert(tpw_private.clean_text(to_jsonb(E' North\t Yard '::text)) = 'North Yard', 'whitespace normalization');
SELECT pg_temp.assert(tpw_private.unicode_lower('ÁİΟΣ') = U&'ái\0307ος', 'Unicode lower independent of C database locale');
SELECT pg_temp.assert(tpw_private.trim_text(U&'\FEFF sample \00A0') = 'sample', 'JavaScript Unicode trim');
SELECT pg_temp.assert(tpw_private.clean_text(to_jsonb(U&'\FEFF North\00A0 Yard \FEFF'::text)) = 'North Yard', 'JavaScript Unicode whitespace');

SET LOCAL ROLE anonymous;
SELECT pg_temp.expect_error('SELECT public.tpw_context()', '42501');
SELECT pg_temp.expect_error('SELECT public.tpw_dashboard()', '42501');
SELECT pg_temp.expect_error('SELECT id FROM public.organizations', '42501');
SELECT pg_temp.expect_error('SELECT document FROM public.submissions', '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('tpw_test.subject', '', true);
SELECT pg_temp.expect_error('SELECT public.tpw_context()', '42501');
SELECT set_config('tpw_test.subject', 'sample-unassigned', true);
SELECT pg_temp.assert(public.tpw_context() = '{"ok":true,"userId":"sample-unassigned","isStaff":false,"orgs":[],"accountKey":null}', 'unassigned context');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM public.organizations), 'unassigned no org rows');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM public.submissions), 'unassigned no submission rows');
SELECT pg_temp.expect_error('SELECT public.tpw_dashboard()', '42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_submit('{}')$$, '42501');
SELECT pg_temp.expect_error($$INSERT INTO tpw_private.memberships VALUES ('sample-unassigned','test-org-a')$$, '42501');
SELECT pg_temp.expect_error($$SELECT tpw_private.safe_json('{}','document')$$, '42501');

SELECT set_config('tpw_test.subject', 'sample-member-a', true);
SELECT pg_temp.assert(public.tpw_context() ->> 'accountKey' = 'test-org-a', 'sole member account key');
SELECT pg_temp.assert(public.tpw_context()::text NOT LIKE '%fixture-secret%', 'safe profile including catalog');
SELECT pg_temp.assert((SELECT array_agg(id) = ARRAY['test-org-a'] FROM public.organizations), 'RLS defeats legacy broad org policy');
SELECT pg_temp.assert((SELECT count(*) = 0 FROM public.submissions), 'RLS defeats legacy broad submission policy');
SELECT pg_temp.expect_error('SELECT profile FROM public.organizations', '42501');
SELECT pg_temp.expect_error('SELECT document FROM public.submissions', '42501');
SELECT pg_temp.expect_error($$INSERT INTO public.organizations VALUES ('forged','Forged','{}')$$, '42501');
SELECT pg_temp.expect_error($$UPDATE public.submissions SET document = '{}'$$, '42501');
SELECT pg_temp.expect_error('DELETE FROM public.submissions', '42501');
SELECT pg_temp.expect_error('TRUNCATE public.submissions', '42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_dashboard('test-org-b')$$, '42501');
SELECT pg_temp.assert(public.tpw_dashboard() -> 'submissions' = '[]', 'member no cross-org read');

-- One canonical valid answer fixture, retained only in transaction-local test settings.
SELECT set_config('tpw_test.payload', '{"submissionId":"11111111-1111-4111-8111-111111111111","organization":" sample  ORGANIZATION a ","reportingPeriod":{"year":1900,"quarter":99},"isStaff":true,"userId":"sample-staff","token":"fixture-secret","programs":[{"id":"sample-course","name":" Sample   course ","status":"Completed","startDate":"2024-02-29","endDate":"2024-03-01","courseHours":12.50,"notes":" Made-up sample context ","email":"fixture-secret","sites":[{"facilityCode":"ASP","yard":"North  Yard","participants":10,"completed":4,"token":"fixture-secret"},{"facilityCode":"SQ","yard":"South","participants":6,"completed":2}]}]}', true);
SELECT set_config('tpw_test.receipt', public.tpw_submit(current_setting('tpw_test.payload')::jsonb)::text, true);
SELECT pg_temp.assert(current_setting('tpw_test.receipt')::jsonb @> '{"ok":true,"signedIn":true,"rows":2,"organization":"Sample Organization A"}', 'legacy receipt shape');
SELECT pg_temp.assert(length(current_setting('tpw_test.receipt')::jsonb ->> 'submissionId') <= 64, 'receipt ID fits legacy field');
SELECT pg_temp.assert(current_setting('tpw_test.receipt')::jsonb ->> 'reference' = current_setting('tpw_test.receipt')::jsonb ->> 'submissionId', 'reference alias');
SELECT pg_temp.assert(public.tpw_submit(current_setting('tpw_test.payload')::jsonb) = current_setting('tpw_test.receipt')::jsonb, 'durable retry exact receipt');
-- Clock/quarter, browser identity and unknown private extensions do not enter the hash.
SELECT pg_temp.assert(public.tpw_submit(current_setting('tpw_test.payload')::jsonb || '{"reportingPeriod":{"year":2099,"quarter":4},"token":"changed-fixture-secret","userId":"another-subject"}') = current_setting('tpw_test.receipt')::jsonb, 'retry ignores server metadata and extensions');
SELECT pg_temp.expect_error($$SELECT public.tpw_submit(jsonb_set(current_setting('tpw_test.payload')::jsonb, '{programs,0,sites,0,participants}', '11'))$$, '22023', 'TPW_RETRY_CONFLICT');
SELECT pg_temp.assert((public.tpw_dashboard() #>> '{submissions,0,programs,0,participants}')::int = 16, 'conflict does not overwrite answers');
SELECT pg_temp.assert(public.tpw_dashboard()::text NOT LIKE '%fixture-secret%', 'nested extensions never returned');
SELECT pg_temp.assert(public.tpw_dashboard() #> '{submissions,0,programs,0,sites,0}' = '{"code":"ASP","yard":"North Yard","participants":10,"completed":4}', 'canonical sites');
SELECT pg_temp.assert(public.tpw_dashboard() #> '{submissions,0,programs,0,assignments,0}' = '{"code":"ASP","yards":["North Yard"]}', 'assignments');
SELECT pg_temp.assert(public.tpw_dashboard() #> '{submissions,0,prisons,0}' = '{"code":"ASP","name":"Avenal State Prison (ASP)","yards":["North Yard"]}', 'prison summary');
SELECT pg_temp.assert(length(public.tpw_dashboard() #>> '{submissions,0,id}') = 64, 'document ID fits previousSubmissionId');
SELECT pg_temp.assert(public.tpw_dashboard() #> '{submissions,0,synthetic}' = 'true', 'sandbox sample flag');
SELECT pg_temp.assert(public.tpw_dashboard() #> '{submissions,0,reportingPeriod}' = jsonb_build_object('year',extract(year FROM current_timestamp AT TIME ZONE 'America/Los_Angeles')::int,'quarter',extract(quarter FROM current_timestamp AT TIME ZONE 'America/Los_Angeles')::int), 'server quarter in California time');
SELECT pg_temp.expect_error($$SELECT public.tpw_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"test-org-b"}')$$, '42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_submit(current_setting('tpw_test.payload')::jsonb || '{"organization":"Sample Organization B"}')$$, '42501');

-- Every invalid attempt is a caught subtransaction; none can add a request/record.
DO $tests$
DECLARE patch jsonb; path text[]; invalid jsonb;
  -- A never-successfully-filed UUID prevents retry conflicts masking broken validation.
  base jsonb := current_setting('tpw_test.payload')::jsonb || '{"submissionId":"33333333-3333-4333-8333-333333333333"}';
BEGIN
  FOR path, invalid IN SELECT ARRAY['programs','0',v.key], v.value FROM jsonb_each('{
    "status":"Planned","startDate":"2024-02-30","endDate":"2024-01-01","courseHours":true,"notes":null,"id":"bad.id","sites":[]
  }'::jsonb) v LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', jsonb_set(base,path,invalid)::text), '22023');
  END LOOP;
  FOR patch IN SELECT value FROM jsonb_array_elements('[
    {"courseHours":-1},{"courseHours":5000.1},{"courseHours":"12"},{"courseHours":null},
    {"startDate":"1999-01-01"},{"startDate":""},{"endDate":""},{"name":""},{"notes":false}
  ]'::jsonb) LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', jsonb_set(base,'{programs,0}',(base #> '{programs,0}') || patch)::text), '22023');
  END LOOP;
  FOR patch IN SELECT value FROM jsonb_array_elements('[
    {"facilityCode":"UNKNOWN"},{"yard":""},{"participants":1.5},{"participants":100001},
    {"participants":null},{"participants":true},{"participants":"10"},{"completed":11},{"completed":-1}
  ]'::jsonb) LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', jsonb_set(base,'{programs,0,sites,0}',(base #> '{programs,0,sites,0}') || patch)::text), '22023');
  END LOOP;
  -- Unicode case, ASCII case and repeated whitespace cannot disguise duplicate yards.
  invalid := jsonb_set(jsonb_set(base,'{programs,0,sites,0,yard}','"Á"'),'{programs,0,sites,1}',(base #> '{programs,0,sites,0}') || '{"yard":"á"}');
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', invalid::text), '22023');
  invalid := jsonb_set(base,'{programs,0,sites,1}',(base #> '{programs,0,sites,0}') || '{"yard":" north   YARD "}');
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', invalid::text), '22023');
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', jsonb_set(base,'{programs,0,name}',to_jsonb(repeat('x',121)))::text), '22023');
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', jsonb_set(base,'{programs,0,notes}',to_jsonb(repeat('x',2001)))::text), '22023');
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', jsonb_set(base,'{programs,0,sites,0,yard}',to_jsonb(repeat('x',41)))::text), '22023');
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', (base || jsonb_build_object('ignored',repeat('x',250001)))::text), '22023');
  SELECT jsonb_agg(base #> '{programs,0}') INTO invalid FROM generate_series(1,61);
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', jsonb_set(base,'{programs}',invalid)::text), '22023');
  SELECT jsonb_agg(base #> '{programs,0,sites,0}') INTO invalid FROM generate_series(1,131);
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_submit(%L::jsonb)', jsonb_set(base,'{programs,0,sites}',invalid)::text), '22023');
END
$tests$;

SELECT set_config('tpw_test.subject', 'sample-multi', true);
SELECT pg_temp.assert(public.tpw_context() -> 'accountKey' = 'null', 'multiple memberships require selection');
SELECT pg_temp.assert(jsonb_array_length(public.tpw_context() -> 'orgs') = 2, 'all assigned organizations');
SELECT pg_temp.expect_error($$SELECT public.tpw_submit(current_setting('tpw_test.payload')::jsonb)$$, '42501');
SELECT pg_temp.assert(public.tpw_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"test-org-a"}') = current_setting('tpw_test.receipt')::jsonb, 'shared org-level retry across assigned users');

SELECT set_config('tpw_test.subject', 'sample-member-b', true);
SELECT pg_temp.assert(jsonb_array_length(public.tpw_dashboard() -> 'submissions') = 1, 'member B only history');
SELECT pg_temp.assert(public.tpw_dashboard() #>> '{submissions,0,orgId}' = 'test-org-b', 'column org ID authoritative');
SELECT pg_temp.assert(public.tpw_dashboard() #>> '{submissions,0,organization}' = 'Sample Organization B', 'column organization authoritative');
SELECT pg_temp.assert(public.tpw_dashboard() #>> '{submissions,0,submittedAt}' = '2024-02-01T12:00:00.000Z', 'column timestamp authoritative');
SELECT pg_temp.assert(public.tpw_dashboard()::text NOT LIKE '%fixture-secret%', 'history allowlists every subtree');
SELECT pg_temp.assert(NOT (public.tpw_dashboard() #> '{submissions,0,programs,0}') ? 'sites', 'do not invent detail for aggregate imports');
SELECT pg_temp.assert(public.tpw_dashboard() #> '{submissions,0,programs,0,participants}' = '20', 'historical totals preserved');

SELECT set_config('tpw_test.subject', 'sample-staff', true);
SELECT pg_temp.assert(public.tpw_context() ->> 'accountKey' = 'tpw', 'staff context');
SELECT pg_temp.assert(jsonb_array_length(public.tpw_dashboard() -> 'submissions') = 2, 'staff full scope');
SELECT pg_temp.assert(jsonb_array_length(public.tpw_dashboard('test-org-a') -> 'submissions') = 1, 'staff narrowed scope');
SELECT pg_temp.expect_error($$SELECT public.tpw_submit(current_setting('tpw_test.payload')::jsonb || '{"organization":"Nonexistent sample organization"}')$$, '42501');
SELECT pg_temp.assert(public.tpw_submit(current_setting('tpw_test.payload')::jsonb) = current_setting('tpw_test.receipt')::jsonb, 'staff resolve existing organization by normalized name');
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*) = 2 FROM public.submissions), 'invalid/conflict/retry attempts add no rows');
SELECT pg_temp.assert((SELECT count(*) = 1 FROM tpw_private.submission_requests), 'one durable retry request');
SELECT pg_temp.assert((SELECT actor_user_id = 'sample-member-a' FROM tpw_private.submission_requests), 'actor retained privately and not overwritten');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.submissions WHERE id LIKE 'neon-api:%' AND document::text LIKE '%sample-member%'), 'no identity in public documents');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tpw_private' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')), 'all private helper execute revoked');
-- Cause the second insert to fail after the answer insert, proving RPC atomicity.
CREATE FUNCTION pg_temp.reject_test_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='test-request-failure'; END $$;
CREATE TRIGGER offline_fail_request BEFORE INSERT ON tpw_private.submission_requests FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_request();
SET LOCAL ROLE authenticated;
SELECT set_config('tpw_test.subject', 'sample-member-a', true);
SELECT pg_temp.expect_error($$SELECT public.tpw_submit(current_setting('tpw_test.payload')::jsonb || '{"submissionId":"22222222-2222-4222-8222-222222222222"}')$$, '23514', 'test-request-failure');
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*) = 2 FROM public.submissions), 'failed request insert rolls answer back');
SELECT pg_temp.assert((SELECT count(*) = 1 FROM tpw_private.submission_requests), 'failed request insert leaves no request');
ROLLBACK;
\echo 'Offline Data API SQL contract checks passed.'
