ALTER TABLE member ADD COLUMN IF NOT EXISTS can_submit_reports boolean NOT NULL DEFAULT false;
