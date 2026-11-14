-- A submission remains an immutable-shaped snapshot at the browser boundary.
-- Relational metric groups own counts; assignments only reference a group.
ALTER TABLE submissions ADD COLUMN reporting_year integer;
ALTER TABLE submissions ADD COLUMN reporting_quarter smallint CHECK (reporting_quarter BETWEEN 1 AND 4);
ALTER TABLE submissions ADD COLUMN reporting_period_inferred boolean NOT NULL DEFAULT false;
ALTER TABLE submissions ADD COLUMN submitted_at timestamptz;
ALTER TABLE submissions ADD CONSTRAINT submissions_identity_org UNIQUE(id,org_id);
CREATE INDEX submissions_reporting_idx ON submissions(org_id,reporting_year,reporting_quarter);

CREATE TABLE facilities (
  code text PRIMARY KEY,
  name text NOT NULL CHECK(length(trim(name))>0)
);
CREATE TABLE yards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_code text NOT NULL REFERENCES facilities(code),
  name text NOT NULL CHECK(length(trim(name))>0),
  UNIQUE(facility_code,name), UNIQUE(id,facility_code)
);
CREATE TABLE organization_facilities (
  org_id text NOT NULL REFERENCES organizations(id),
  facility_code text NOT NULL REFERENCES facilities(code),
  PRIMARY KEY(org_id,facility_code)
);
CREATE TABLE programs (
  org_id text NOT NULL REFERENCES organizations(id),
  id text NOT NULL,
  name text NOT NULL CHECK(length(trim(name))>0),
  last_reported_at timestamptz NOT NULL,
  PRIMARY KEY(org_id,id)
);
CREATE TABLE program_locations (
  org_id text NOT NULL,
  program_id text NOT NULL,
  yard_id uuid NOT NULL,
  facility_code text NOT NULL,
  PRIMARY KEY(org_id,program_id,yard_id),
  FOREIGN KEY(org_id,program_id) REFERENCES programs(org_id,id) ON DELETE CASCADE,
  FOREIGN KEY(org_id,facility_code) REFERENCES organization_facilities(org_id,facility_code),
  FOREIGN KEY(yard_id,facility_code) REFERENCES yards(id,facility_code)
);
-- Snapshot labels preserve the history when the directory names change later.
CREATE TABLE submission_facilities (
  submission_id text NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  facility_code text NOT NULL REFERENCES facilities(code),
  name text NOT NULL,
  ordinal integer NOT NULL,
  PRIMARY KEY(submission_id,facility_code)
);
CREATE TABLE submission_yards (
  submission_id text NOT NULL,
  facility_code text NOT NULL,
  yard_id uuid NOT NULL,
  name text NOT NULL,
  ordinal integer NOT NULL,
  PRIMARY KEY(submission_id,yard_id),
  FOREIGN KEY(submission_id,facility_code) REFERENCES submission_facilities(submission_id,facility_code) ON DELETE CASCADE,
  FOREIGN KEY(yard_id,facility_code) REFERENCES yards(id,facility_code)
);
CREATE TABLE submission_programs (
  submission_id text NOT NULL,
  org_id text NOT NULL,
  program_id text NOT NULL,
  name text NOT NULL,
  ordinal integer NOT NULL,
  source jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY(submission_id,program_id),
  FOREIGN KEY(submission_id,org_id) REFERENCES submissions(id,org_id) ON DELETE CASCADE,
  FOREIGN KEY(org_id,program_id) REFERENCES programs(org_id,id)
);
CREATE TABLE program_metric_groups (
  submission_id text NOT NULL,
  program_id text NOT NULL,
  group_key text NOT NULL,
  scope text NOT NULL CHECK(scope IN ('shared','location')),
  status text NOT NULL CHECK(status IN ('Planned','In Progress','Completed')),
  start_date date,
  end_date date,
  course_hours numeric NOT NULL CHECK(course_hours>=0),
  participants integer NOT NULL CHECK(participants>=0),
  participants_completed integer NOT NULL CHECK(participants_completed BETWEEN 0 AND participants),
  PRIMARY KEY(submission_id,program_id,group_key),
  FOREIGN KEY(submission_id,program_id) REFERENCES submission_programs(submission_id,program_id) ON DELETE CASCADE,
  CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date)
);
CREATE TABLE submission_program_locations (
  submission_id text NOT NULL,
  program_id text NOT NULL,
  yard_id uuid NOT NULL,
  group_key text NOT NULL,
  PRIMARY KEY(submission_id,program_id,yard_id),
  FOREIGN KEY(submission_id,program_id,group_key) REFERENCES program_metric_groups(submission_id,program_id,group_key) ON DELETE CASCADE,
  FOREIGN KEY(submission_id,yard_id) REFERENCES submission_yards(submission_id,yard_id)
);
CREATE INDEX program_locations_yard_idx ON program_locations(yard_id);
CREATE INDEX submission_locations_group_idx ON submission_program_locations(submission_id,program_id,group_key);

-- No metrics without a location, no location-scoped group applied twice.
-- Deferred checks permit replacing an entire report atomically.
CREATE FUNCTION check_program_metric_groups() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid text; pid text;
BEGIN
  IF TG_OP='DELETE' THEN sid:=OLD.submission_id;pid:=OLD.program_id;
  ELSE sid:=NEW.submission_id;pid:=NEW.program_id;END IF;
  IF NOT EXISTS(SELECT 1 FROM submission_programs WHERE submission_id=sid AND program_id=pid) THEN RETURN NULL;END IF;
  IF NOT EXISTS(SELECT 1 FROM program_metric_groups WHERE submission_id=sid AND program_id=pid)
    OR EXISTS (
      SELECT 1 FROM program_metric_groups g LEFT JOIN submission_program_locations l
        USING(submission_id,program_id,group_key)
      WHERE g.submission_id=sid AND g.program_id=pid
      GROUP BY g.submission_id,g.program_id,g.group_key,g.scope
      HAVING count(l.yard_id)=0 OR (g.scope='location' AND count(l.yard_id)<>1)
    ) THEN RAISE EXCEPTION 'Every metric group needs locations; location metrics must apply to exactly one yard' USING ERRCODE='23514';END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER report_groups_valid AFTER INSERT OR UPDATE ON submission_programs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_program_metric_groups();
CREATE CONSTRAINT TRIGGER metric_groups_valid AFTER INSERT OR UPDATE OR DELETE ON program_metric_groups DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_program_metric_groups();
CREATE CONSTRAINT TRIGGER metric_locations_valid AFTER INSERT OR UPDATE OR DELETE ON submission_program_locations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_program_metric_groups();

-- Compatibility write adapter: the existing form (and document-style clients)
-- writes a snapshot once. Its normalized rows are committed in the same transaction.
CREATE FUNCTION sync_submission_relations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f jsonb; p jsonb; a jsonb; y text; yard uuid; pid text; n integer; yn integer; ts timestamptz; latest boolean;
BEGIN
  ts:=COALESCE(NULLIF(NEW.document->>'submittedAt','')::timestamptz,NEW.received_at);
  UPDATE submissions SET
    reporting_year=COALESCE((NEW.document->'reportingPeriod'->>'year')::integer,extract(year FROM ts AT TIME ZONE 'UTC')::integer),
    reporting_quarter=COALESCE((NEW.document->'reportingPeriod'->>'quarter')::smallint,extract(quarter FROM ts AT TIME ZONE 'UTC')::smallint),
    reporting_period_inferred=NOT(NEW.document ? 'reportingPeriod'),submitted_at=ts WHERE id=NEW.id;
  DELETE FROM submission_programs WHERE submission_id=NEW.id;
  DELETE FROM submission_yards WHERE submission_id=NEW.id;
  DELETE FROM submission_facilities WHERE submission_id=NEW.id;
  n:=0;
  FOR f IN SELECT value FROM jsonb_array_elements(NEW.document->'prisons') LOOP
    INSERT INTO facilities(code,name) VALUES(f->>'code',f->>'name') ON CONFLICT(code) DO NOTHING;
    INSERT INTO organization_facilities(org_id,facility_code) VALUES(NEW.org_id,f->>'code') ON CONFLICT DO NOTHING;
    INSERT INTO submission_facilities VALUES(NEW.id,f->>'code',f->>'name',n);n:=n+1;yn:=0;
    FOR y IN SELECT value FROM jsonb_array_elements_text(f->'yards') LOOP
      INSERT INTO yards(facility_code,name) VALUES(f->>'code',y) ON CONFLICT(facility_code,name) DO NOTHING;
      SELECT id INTO yard FROM yards WHERE facility_code=f->>'code' AND name=y;
      INSERT INTO submission_yards VALUES(NEW.id,f->>'code',yard,y,yn) ON CONFLICT DO NOTHING;yn:=yn+1;
    END LOOP;
  END LOOP;
  n:=0;
  FOR p IN SELECT value FROM jsonb_array_elements(NEW.document->'programs') LOOP
    pid:=COALESCE(NULLIF(p->>'id',''),'legacy-'||md5(lower(trim(p->>'name'))));
    INSERT INTO programs(org_id,id,name,last_reported_at) VALUES(NEW.org_id,pid,p->>'name',ts)
      ON CONFLICT(org_id,id) DO UPDATE SET name=EXCLUDED.name,last_reported_at=EXCLUDED.last_reported_at
      WHERE programs.last_reported_at<=EXCLUDED.last_reported_at;
    SELECT last_reported_at=ts INTO latest FROM programs WHERE org_id=NEW.org_id AND id=pid;
    IF latest THEN DELETE FROM program_locations WHERE org_id=NEW.org_id AND program_id=pid;END IF;
    INSERT INTO submission_programs VALUES(NEW.id,NEW.org_id,pid,p->>'name',n,p);n:=n+1;
    INSERT INTO program_metric_groups VALUES(NEW.id,pid,'shared','shared',p->>'status',NULLIF(p->>'startDate','')::date,NULLIF(p->>'endDate','')::date,(p->>'courseHours')::numeric,(p->>'participants')::integer,(p->>'participantsCompleted')::integer);
    FOR a IN SELECT value FROM jsonb_array_elements(p->'assignments') LOOP
      FOR y IN SELECT value FROM jsonb_array_elements_text(a->'yards') LOOP
        SELECT id INTO yard FROM yards WHERE facility_code=a->>'code' AND name=y;
        INSERT INTO submission_program_locations VALUES(NEW.id,pid,yard,'shared') ON CONFLICT DO NOTHING;
        IF latest THEN INSERT INTO program_locations VALUES(NEW.org_id,pid,yard,a->>'code') ON CONFLICT DO NOTHING;END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER submission_relations AFTER INSERT OR UPDATE OF document ON submissions FOR EACH ROW EXECUTE FUNCTION sync_submission_relations();

-- Backfill without editing the original document snapshots.
DO $$ DECLARE row record; BEGIN
  FOR row IN SELECT id FROM submissions ORDER BY COALESCE(document->>'submittedAt',''),id LOOP
    UPDATE submissions SET document=document WHERE id=row.id;
  END LOOP;
END $$;

-- Aggregate facts BEFORE joining locations. One shared group = one contribution.
CREATE VIEW submission_report_totals AS
SELECT s.id AS submission_id,
  (SELECT count(*)::integer FROM submission_programs p WHERE p.submission_id=s.id) AS programs,
  COALESCE(sum(g.course_hours),0) AS course_hours,
  COALESCE(sum(g.participants),0)::integer AS participants,
  COALESCE(sum(g.participants_completed),0)::integer AS participants_completed,
  COALESCE(sum(g.course_hours*g.participants_completed),0) AS participant_hours_delivered
FROM submissions s LEFT JOIN program_metric_groups g ON g.submission_id=s.id GROUP BY s.id;

-- The current browser only edits a single shared group per program. Do not
-- flatten future location-specific reports back into the shared-count UI.
CREATE VIEW submission_requires_location_ui AS
SELECT DISTINCT submission_id FROM program_metric_groups
GROUP BY submission_id,program_id HAVING count(*)<>1 OR bool_or(scope<>'shared');

CREATE VIEW submission_read_models AS
SELECT s.id,s.org_id,s.received_at,
  (s.document - 'prisons' - 'programs' - 'totals') || jsonb_build_object(
    'prisons',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',f.facility_code,'name',f.name,'yards',COALESCE((SELECT jsonb_agg(y.name ORDER BY y.ordinal) FROM submission_yards y WHERE y.submission_id=f.submission_id AND y.facility_code=f.facility_code),'[]'::jsonb)) ORDER BY f.ordinal) FROM submission_facilities f WHERE f.submission_id=s.id),'[]'::jsonb),
    'programs',COALESCE((SELECT jsonb_agg(
      (p.source - 'assignments' - 'courseHours' - 'participants' - 'participantsCompleted' - 'status' - 'startDate' - 'endDate') || jsonb_build_object(
        'name',p.name,'status',g.status,'startDate',COALESCE(g.start_date::text,''),'endDate',COALESCE(g.end_date::text,''),
        'courseHours',g.course_hours,'participants',g.participants,'participantsCompleted',g.participants_completed,
        'assignments',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',loc.facility_code,'yards',loc.yard_names) ORDER BY loc.facility_ordinal) FROM (
          SELECT y.facility_code,f.ordinal AS facility_ordinal,jsonb_agg(y.name ORDER BY y.ordinal) AS yard_names
          FROM submission_program_locations l JOIN submission_yards y USING(submission_id,yard_id)
          JOIN submission_facilities f USING(submission_id,facility_code)
          WHERE l.submission_id=p.submission_id AND l.program_id=p.program_id
          GROUP BY y.facility_code,f.ordinal
        ) loc),'[]'::jsonb)
      ) ORDER BY p.ordinal) FROM submission_programs p JOIN program_metric_groups g USING(submission_id,program_id)
      WHERE p.submission_id=s.id),'[]'::jsonb),
    'totals',jsonb_build_object('programs',t.programs,'courseHours',t.course_hours,'participants',t.participants,'participantsCompleted',t.participants_completed,'participantHoursDelivered',t.participant_hours_delivered)
  ) AS document
FROM submissions s JOIN submission_report_totals t ON t.submission_id=s.id
WHERE NOT EXISTS(SELECT 1 FROM submission_requires_location_ui x WHERE x.submission_id=s.id);
