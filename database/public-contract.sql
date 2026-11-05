-- OFFLINE ONLY. Synthetic fixtures, isolated local cluster, every row rolled back.
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
INSERT INTO public.organizations VALUES
 ('org-1','Org 1','{"description":"Sample data only","token":"fixture-secret","programCatalog":[{"id":"fictional","name":"Sample course","userId":"fixture-secret"}]}'),
 ('org-2','Org 2','{}');
-- Even inside an allowed organization, real/unmarked/truthy-but-not-boolean
-- documents must NEVER become public. Canonical org/timestamp columns win.
INSERT INTO public.submissions(id,org_id,document,received_at) VALUES
 ('sandbox-synthetic','org-1','{"id":"sample-history","synthetic":true,"orgId":"test-org-b","organization":"Forged","submittedAt":"1900-01-01","token":"fixture-secret","auth":{"userId":"fixture-secret"},"programs":[{"name":"Sample historical course","session":"fixture-secret","sites":[{"code":"ASP","yard":"North","token":"fixture-secret"}]}]}','2024-01-01Z'),
 ('sandbox-testdata','org-2','{"testData":true,"synthetic":false}','2024-01-02Z'),
 ('sandbox-real','org-1','{"synthetic":false,"testData":false,"programs":[{"name":"MUST-NOT-LEAK"}]}','2024-01-03Z'),
 ('sandbox-unmarked','org-2','{"programs":[{"name":"MUST-NOT-LEAK"}]}','2024-01-03Z'),
 ('sandbox-string','org-1','{"synthetic":"true","testData":"true","programs":[{"name":"MUST-NOT-LEAK"}]}','2024-01-03Z'),
 ('sandbox-number','org-2','{"synthetic":1,"testData":1,"programs":[{"name":"MUST-NOT-LEAK"}]}','2024-01-03Z');
SELECT pg_temp.assert((SELECT NOT enabled FROM tpw_private.sandbox_settings WHERE singleton), 'default gate disabled');
-- No owner bypass of the public gate either.
SELECT pg_temp.expect_error('SELECT public.tpw_sandbox_dashboard()', '42501');
SET LOCAL ROLE anonymous;
SELECT set_config('tpw_test.subject','sample-anonymous-jwt-subject',true);
SELECT pg_temp.expect_error('SELECT public.tpw_sandbox_dashboard()', '42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit('{}')$$, '42501');
DO $acl$
DECLARE stmt text;
BEGIN
  FOREACH stmt IN ARRAY ARRAY[
    'SELECT public.tpw_context()', 'SELECT public.tpw_dashboard()',
    'SELECT public.tpw_submit(''{}'')', 'SELECT public.tpw_is_staff()', 'SELECT public.tpw_can_access(''org-1'')',
    'SELECT id FROM public.organizations', 'SELECT profile FROM public.organizations',
    'SELECT id FROM public.submissions', 'SELECT document FROM public.submissions',
    'INSERT INTO public.submissions VALUES (''forged'',''org-1'',''{}'',now())',
    'UPDATE public.submissions SET document = ''{}''', 'DELETE FROM public.submissions',
    'SELECT * FROM tpw_private.memberships', 'SELECT * FROM tpw_private.staff_users',
    'SELECT * FROM tpw_private.submission_requests', 'SELECT * FROM tpw_private.sandbox_settings',
    'UPDATE tpw_private.sandbox_settings SET enabled = true',
    'SELECT tpw_private.require_sandbox()', 'SELECT tpw_private.safe_json(''{}'',''document'')',
    'SELECT tpw_private.save_submission(''{}'',''org-1'',''public-sandbox'')',
    'SELECT tpw_private.submission_request_id(''{}'')'
  ] LOOP PERFORM pg_temp.expect_error(stmt, '42501'); END LOOP;
END $acl$;
RESET ROLE;
SELECT pg_temp.assert((SELECT array_agg(p.proname::text ORDER BY p.proname) = ARRAY['tpw_sandbox_dashboard','tpw_sandbox_submit']
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'tpw_%' AND has_function_privilege('anonymous',p.oid,'EXECUTE')), 'anonymous only two public RPCs');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='tpw_private' AND (has_function_privilege('anonymous',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))), 'no API private helper execute');
UPDATE tpw_private.sandbox_settings SET enabled = true WHERE singleton;
SET LOCAL ROLE anonymous;
SELECT pg_temp.assert(jsonb_array_length(public.tpw_sandbox_dashboard()->'orgs') = 2, 'only fictional public organizations');
SELECT pg_temp.assert(jsonb_array_length(public.tpw_sandbox_dashboard()->'submissions') = 2, 'strict boolean synthetic OR testData, not real docs or other organizations');
SELECT pg_temp.assert(public.tpw_sandbox_dashboard() #>> '{submissions,0,orgId}' = 'org-1', 'canonical org column');
SELECT pg_temp.assert(public.tpw_sandbox_dashboard() #>> '{submissions,0,organization}' = 'Org 1', 'canonical organization name');
SELECT pg_temp.assert(public.tpw_sandbox_dashboard() #>> '{submissions,0,submittedAt}' = '2024-01-01T00:00:00.000Z', 'canonical timestamp');
SELECT pg_temp.assert(public.tpw_sandbox_dashboard()::text NOT LIKE '%fixture-secret%' AND public.tpw_sandbox_dashboard()::text NOT LIKE '%MUST-NOT-LEAK%', 'allowlists nested profile/document and no real data');
SELECT pg_temp.assert(jsonb_array_length(public.tpw_sandbox_dashboard('org-2')->'submissions')=1, 'explicit allowed org filter');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_dashboard('test-org-b')$$, '42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_dashboard('tpw')$$, '42501');
-- Subject and browser claims have no authority, not even an empty subject.
SELECT set_config('tpw_test.subject','',true);
SELECT pg_temp.assert(public.tpw_sandbox_dashboard()->>'ok' = 'true', 'no human identity needed');
SELECT set_config('tpw_test.payload','{"submissionId":"77777777-7777-4777-8777-777777777777","reportingPeriod":{"year":1900,"quarter":99},"synthetic":false,"testData":false,"userId":"fixture-secret","session":{"token":"fixture-secret"},"actor_user_id":"sample-staff","isStaff":true,"account":"tpw","programs":[{"id":"sample-course","name":"Sample course","status":"Completed","startDate":"2024-02-29","endDate":"2024-03-01","courseHours":12.5,"notes":"Made-up context","sites":[{"facilityCode":"ASP","yard":"North","participants":10,"completed":4}]}]}',true);
SELECT set_config('tpw_test.guest_receipt', public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb)::text,true);
SELECT pg_temp.assert(current_setting('tpw_test.guest_receipt')::jsonb @> '{"ok":true,"organization":"Org 1","rows":1,"signedIn":false}', 'default binds Org 1 and legacy receipt');
SELECT pg_temp.assert(public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"org-1","organization":" org  1 ","synthetic":null,"testData":"false","userId":"ignored-changed"}') = current_setting('tpw_test.guest_receipt')::jsonb, 'canonical durable exact retry, metadata ignored');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(jsonb_set(current_setting('tpw_test.payload')::jsonb,'{programs,0,courseHours}','13'))$$,'22023','TPW_RETRY_CONFLICT');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"test-org-b"}')$$,'42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"org-1","organization":"Org 2"}')$$,'42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"organization":"Sample Organization A"}')$$,'42501');
SELECT pg_temp.assert(public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"organization":" org 2 "}') ->> 'organization' = 'Org 2','name-only resolves allowed Org 2');
SELECT pg_temp.assert(public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"org-2"}') ->> 'organization' = 'Org 2','explicit Org 2 same UUID scoped separately');
DO $validation$
DECLARE base jsonb := current_setting('tpw_test.payload')::jsonb || '{"submissionId":"88888888-8888-4888-8888-888888888888"}';
  patch jsonb; path text[]; invalid jsonb;
BEGIN
  FOREACH invalid IN ARRAY ARRAY['null'::jsonb,'[]'::jsonb,'true'::jsonb,'"text"'::jsonb,'{}'::jsonb] LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.tpw_sandbox_submit(%L::jsonb)',invalid::text),'22023');
  END LOOP;
  FOR patch IN SELECT value FROM jsonb_array_elements('[{"submissionId":"not-uuid"},{"orgId":true},{"organization":false},{"previousSubmissionId":"bad.id"},{"programs":[]},{"programs":null}]'::jsonb) LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.tpw_sandbox_submit(%L::jsonb)',(base || patch)::text),'22023');
  END LOOP;
  FOR path, invalid IN SELECT ARRAY['programs','0',v.key], v.value FROM jsonb_each('{
    "status":"Planned","startDate":"2024-02-30","endDate":"2024-01-01","courseHours":true,"notes":null,"id":"bad.id","sites":[],"name":""
  }'::jsonb) v LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.tpw_sandbox_submit(%L::jsonb)',jsonb_set(base,path,invalid)::text),'22023');
  END LOOP;
  FOR patch IN SELECT value FROM jsonb_array_elements('[{"facilityCode":"UNKNOWN"},{"yard":""},{"participants":1.5},{"participants":100001},{"participants":null},{"participants":true},{"participants":"10"},{"completed":11},{"completed":-1}]'::jsonb) LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.tpw_sandbox_submit(%L::jsonb)',jsonb_set(base,'{programs,0,sites,0}',(base #> '{programs,0,sites,0}') || patch)::text),'22023');
  END LOOP;
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_sandbox_submit(%L::jsonb)',(base || jsonb_build_object('ignored',repeat('x',250001)))::text),'22023');
  PERFORM pg_temp.expect_error(format('SELECT public.tpw_sandbox_submit(%L::jsonb)',jsonb_set(base,'{programs,0,sites}',jsonb_build_array(base #> '{programs,0,sites,0}',base #> '{programs,0,sites,0}'))::text),'22023');
END $validation$;
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)=2 FROM tpw_private.submission_requests), 'only two valid org-scoped writes');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM tpw_private.submission_requests WHERE actor_user_id <> 'public-sandbox'), 'fixed private guest actor ignores payload');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.submissions WHERE id LIKE 'neon-api:%' AND (document::text LIKE '%fixture-secret%' OR document::text LIKE '%public-sandbox%' OR document::text LIKE '%sample-staff%')), 'no auth/session/user/actor data in saved public documents');
SELECT pg_temp.assert((SELECT bool_and(document @> '{"synthetic":true,"testData":true}') FROM public.submissions WHERE id LIKE 'neon-api:%'), 'both synthetic flags forced on server');
SELECT pg_temp.assert((SELECT bool_and(document->'reportingPeriod' = jsonb_build_object('year',extract(year FROM clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::int,'quarter',extract(quarter FROM clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::int)) FROM public.submissions WHERE id LIKE 'neon-api:%'), 'current filing quarter, not requested quarter');
-- Seed ONLY private synthetic budget fixtures; no 300 active writes, no real data.
INSERT INTO tpw_private.submission_requests(org_id,request_id,hash,submission_id,receipt,actor_user_id,created_at)
SELECT 'org-2',md5('sample-minute-'||n)::uuid,'sample-hash','sandbox-synthetic','{}','public-sandbox',clock_timestamp() FROM generate_series(1,28) n;
SET LOCAL ROLE anonymous;
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"submissionId":"99999999-9999-4999-8999-999999999999"}')$$,'54000');
SELECT pg_temp.assert(public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb) = current_setting('tpw_test.guest_receipt')::jsonb,'retry exempt at minute cap');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(jsonb_set(current_setting('tpw_test.payload')::jsonb,'{programs,0,courseHours}','14'))$$,'22023','TPW_RETRY_CONFLICT');
RESET ROLE;
UPDATE tpw_private.submission_requests SET created_at=clock_timestamp()-interval '2 minutes';
INSERT INTO tpw_private.submission_requests(org_id,request_id,hash,submission_id,receipt,actor_user_id,created_at)
SELECT 'org-2',md5('sample-day-'||n)::uuid,'sample-hash','sandbox-synthetic','{}','public-sandbox',clock_timestamp()-interval '2 minutes' FROM generate_series(1,270) n;
SET LOCAL ROLE anonymous;
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"submissionId":"99999999-9999-4999-8999-999999999999"}')$$,'54000');
SELECT pg_temp.assert(public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb) = current_setting('tpw_test.guest_receipt')::jsonb,'retry exempt at daily cap');
RESET ROLE;
UPDATE tpw_private.sandbox_settings SET enabled=false WHERE singleton;
SET LOCAL ROLE anonymous;
SELECT pg_temp.expect_error('SELECT public.tpw_sandbox_dashboard()', '42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb)$$, '42501');
RESET ROLE;
-- Auth/RLS scope remains unchanged; even a guest-JWT subject with memberships
-- cannot make guest RPCs use that membership. Auth saves ignore guest quotas/gate.
INSERT INTO tpw_private.memberships VALUES ('sample-owned-member','test-org-a');
SET LOCAL ROLE authenticated;
SELECT set_config('tpw_test.subject','sample-owned-member',true);
SELECT pg_temp.expect_error('SELECT public.tpw_sandbox_dashboard()', '42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_dashboard('org-1')$$,'42501');
SELECT pg_temp.assert(public.tpw_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"test-org-a"}') @> '{"ok":true,"signedIn":true,"organization":"Sample Organization A"}', 'auth saver works while guest disabled and quota full');
SELECT pg_temp.assert(public.tpw_context()->>'accountKey'='test-org-a','auth context scope unchanged');
-- Root size/UUID validation still precedes organization resolution for auth.
SELECT pg_temp.expect_error($$SELECT public.tpw_submit('{"submissionId":"bad","orgId":"org-2"}')$$,'22023');
RESET ROLE;
INSERT INTO tpw_private.memberships VALUES ('sample-owned-member','org-1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(public.tpw_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"org-1","submissionId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}') ->> 'signedIn' = 'true', 'authenticated writes retain their private actor even in allowed sandbox org');
RESET ROLE;
UPDATE tpw_private.sandbox_settings SET enabled=true WHERE singleton;
SET LOCAL ROLE anonymous;
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"test-org-a"}')$$,'42501');
SELECT pg_temp.expect_error($$SELECT public.tpw_sandbox_submit(current_setting('tpw_test.payload')::jsonb || '{"orgId":"org-1","submissionId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}')$$,'42501','not a public sandbox request');
RESET ROLE;
DELETE FROM tpw_private.sandbox_settings;
SELECT pg_temp.expect_error('SELECT public.tpw_sandbox_dashboard()', '42501');
ROLLBACK;
\echo 'Offline public sandbox SQL contract checks passed.'
