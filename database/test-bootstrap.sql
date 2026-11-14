-- OFFLINE TEST FIXTURE ONLY. Never apply this file to Neon or another existing DB.
-- All organizations, programs, counts and user subjects below are made up.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anonymous NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.user_id() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('tpw_test.subject', true), '') $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anonymous;
CREATE TABLE public.organizations(id text PRIMARY KEY, name text NOT NULL, profile jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.submissions(id text PRIMARY KEY, org_id text NOT NULL REFERENCES public.organizations(id), document jsonb NOT NULL, received_at timestamptz NOT NULL);
INSERT INTO public.organizations VALUES
 ('test-org-a','Sample Organization A','{"description":"Made-up test data","programCatalog":[{"id":"sample-course","name":"Sample course","accessToken":"fixture-secret"}],"email":"fixture-secret","_internal":"fixture-secret"}'),
 ('test-org-b','Sample Organization B','{}');
INSERT INTO public.submissions VALUES ('imported-sample','test-org-b',
 '{"id":"sample-history","orgId":"forged-org","organization":"Forged","submittedAt":"1900-01-01","synthetic":true,"testData":true,"_retry":{"hash":"fixture-secret"},"token":"fixture-secret","programs":[{"id":"sample-course","name":"Sample course","courseHours":24,"participants":20,"participantsCompleted":10,"assignments":[{"code":"ASP","yards":["North",{"token":"fixture-secret"}],"token":"fixture-secret"}],"sites":null,"notes":"Made-up historical aggregate only","email":"fixture-secret"}],"prisons":[{"code":"ASP","name":"Avenal State Prison (ASP)","yards":["North"],"accessToken":"fixture-secret"}],"totals":{"participants":20,"token":"fixture-secret"},"reportingPeriod":{"year":2024,"quarter":1,"token":"fixture-secret"}}',
 '2024-02-01T12:00:00Z');
-- Simulate broad Data API defaults, including permissive pre-existing policies
-- and independent column ACLs which a table-only REVOKE would leave behind.
GRANT ALL ON public.organizations, public.submissions TO PUBLIC, authenticated, anonymous;
GRANT SELECT (profile) ON public.organizations TO authenticated, anonymous;
GRANT SELECT (document), UPDATE (document) ON public.submissions TO authenticated, anonymous;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_broad_org ON public.organizations FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY legacy_broad_submission ON public.submissions FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
