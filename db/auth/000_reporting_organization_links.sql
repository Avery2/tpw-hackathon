CREATE TABLE IF NOT EXISTS reporting_auth_organizations (
  reporting_org_id text PRIMARY KEY REFERENCES organizations(id),
  auth_org_id text NOT NULL UNIQUE REFERENCES organization(id)
);
