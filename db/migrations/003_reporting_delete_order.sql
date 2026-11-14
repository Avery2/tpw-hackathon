-- A submission cascades through both its selected yards and program reports.
-- Removing a selected yard must also remove its assignments, independent of
-- PostgreSQL's order of cascading deletes. Deferred metric checks still reject
-- orphaned groups on reports that remain.
ALTER TABLE submission_program_locations
  DROP CONSTRAINT submission_program_locations_submission_id_yard_id_fkey;
ALTER TABLE submission_program_locations
  ADD CONSTRAINT submission_program_locations_submission_id_yard_id_fkey
  FOREIGN KEY(submission_id,yard_id) REFERENCES submission_yards(submission_id,yard_id) ON DELETE CASCADE;
