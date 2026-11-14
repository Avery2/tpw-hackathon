-- Keep the demo's document contract while moving persistence to Postgres.
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT organization_name_present CHECK (length(trim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_key ON organizations (lower(name));
CREATE TABLE IF NOT EXISTS submissions (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id),
  document jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submissions_org_idx ON submissions(org_id);
CREATE INDEX IF NOT EXISTS submissions_period_idx ON submissions ((document->'reportingPeriod'->>'year'), (document->'reportingPeriod'->>'quarter'));
