CREATE TABLE IF NOT EXISTS tpw_staff (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);
