CREATE UNIQUE INDEX IF NOT EXISTS member_org_user_unique ON member ("organizationId", "userId");
