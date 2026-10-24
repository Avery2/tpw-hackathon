# Where the public data actually lives

Inventory of every public source we checked while looking for a filled-in version of
RIGHT 4.0 **Attachment A – Institution Locations & Populations** (RFA p. 12) and
**Program Summary** (RFA p. 9, item n). Verified 2026-10-24.

Short version: **who runs what, where** is public and machine-readable. **How many
people, how many hours, at what capacity** is not — for the state's own grantees
either. Which is the point of the hackathon problem.

---

## A. Public and usable today

### A1. CDCR — In Prison Programs Available by Location  ★ the big one

<https://www.cdcr.ca.gov/rehabilitation/inprison/mapip/> (banner: "As of January 1, 2026")

31 institutions. Under each: Educational Programs, CTE, Treatment, Pre-Release, then
**GRANT PROGRAMS** — Victim Impact / CARE / Innovative Programming grants, each listing
the *grantee organization by name* — then Other Programs (Arts in Corrections).

This is the statewide, filled-in equivalent of Attachment A at institution × organization
granularity. It is the only place where the org↔prison mapping is stated by the state
rather than by the org's own marketing.

- Gives: `institution`, `grant_program (VI | CARE | IPG)`, `provider name`
- Doesn't give: population type (GP/EOP/MHCB/RHU), capacity, hours, cohort dates, $$
- Parsed → `data/public/cdcr-grant-programs-by-institution.csv` (113 rows, 64 providers,
  31 institutions). 36 of those 64 providers match a TPW member org — i.e. **56% of the
  orgs the state currently funds in prisons are TPW members**; the other 44% are the
  long tail TPW exists to organize.
- Caveats: provider names are whatever the eligible entity registered as ("Marin Shakespeare
  Co", "Victims of Injustice DBA Life Support Alliance"), so string matching to TPW member
  names is lossy. Facility names omit codes — see the crosswalk below.

### A2. RIGHT 4.0 RFA, Attachment A grid (PDF p. 30 of `docs/RIGHT 4.0 RFA.pdf`)

The blank template, but it carries three things worth extracting:

1. The authoritative **list of 30 institutions** in scope for RIGHT 4.0.
2. Which institutions are flagged **underserved** (red font, `*`): ASP, CCWF, CIW, CTF,
   KVSP, NKSP, SAC — i.e. the +0.5-point institutions.
3. Which population types an institution does **not** house. Counterintuitive but the
   legend is explicit: `x` = *"Location does not house Population Type."* The GP column is
   blank on every row because every institution has general population.

- Parsed → `data/public/cdcr-attachment-a-institutions.csv`
- Reading: Avenal `EOP=no, MHCB=no, RHU=no`; Centinela the same; CIM `RHU=no`;
  SQ and VSP `RHU=no`. Most others house all three.
- Sanity caveat: 4 underserved institutions (CCWF, CIW, KVSP, SAC) carry no `x` at all,
  i.e. the RFA says they house every population type. Worth a cross-check against the
  CCHCS MHSDS map the RFA cites as its source before anyone quotes these as facts.

### A3. Facility crosswalk (three naming conventions, one key)

`data/public/facility-crosswalk.csv` — `facility_code` (ASP, SATF, …) plus the name as it
appears in (a) the TPW Collective Impact form's Constants tab, (b) Attachment A,
(c) MAPIP. Needed because MAPIP says "CA State Prison, Sacramento" for SAC and the TPW
form says "Substance Abuse Treatment Facility and State Prison, Corcoran (SATF-CSP, Corcoran)".

### A4. thetpw.org/our-members

125 member orgs with websites (`data/public/tpw-members.csv`, scraped from the local
mirror at `work/raw/our-members/index.html`). Names + URLs only — no program, facility, or
capacity fields. Useful as the org dimension, nothing more. Matching member names to CDCR's
provider strings needs normalisation (smart quotes, `dba` aliases, `Inc.`);
`normalize_org()` in `scripts/build_public_data.py` does it and the 36 matches it produced
were checked by hand.

### A5. CDCR — grantee name lists

- RIGHT 1.0 recipients (07/01/2022–06/30/2025), 72 orgs, **names only, no amounts**:
  <https://www.cdcr.ca.gov/rehabilitation/right-grant-01-recipients/>
- Grant program index: <https://www.cdcr.ca.gov/rehabilitation/grants/>
- RIGHT 3.0 / 4.0 applicant Q&A PDFs — the closest thing to a public statement of how
  participant counts get reported: *"Each grant recipient shall submit an annual report to
  CDCR that details the expenditures of their grant, to include the institution the funds
  were utilized, the number of participants, and populations served."*
  (RFA §16a; RIGHT 4.0 FAQ item 32)

### A6. Outcomes side (aggregate only, never program-linked)

- Recidivism reports + dashboard, by release cohort and demographics, primary measure =
  3-year conviction rate: <https://www.cdcr.ca.gov/research/recidivism-reports/>
  Latest: FY 2019-20 releases, 39.1% (Apr 2025).
- SB601 statistical reports per institution (quarterly, structured XLSX on data.ca.gov):
  <https://www.cdcr.ca.gov/research/statistical-reports-sb601/> ·
  <https://data.ca.gov/dataset/sb601-reporting>
- Weekly population (TPOP1/TPOP4) — denominators per institution:
  <https://www.cdcr.ca.gov/research/population-reports-2/>
- Monthly admissions and releases: <https://data.ca.gov/dataset/monthly-admissions-and-releases>

None of these have a participation flag. This is exactly why the join has to be built by
TPW, and why CDCR's rule that grant recipients "are not permitted to evaluate any
programs" for external publication without an independent third party (RFA §15) matters.

### A7. Nonprofit financials (the budget points in RFA §9a)

ProPublica Nonprofit Explorer / IRS 990s give annual expenditures per org — the input to
the 1 / 2 / 3 qualifying points and the "proof of annual budget" document (RFA item c).
Per-org, not per-program.

---

## B. What is *not* public, anywhere

| RFA field | Status | Where it would have to come from |
|---|---|---|
| Program Summary item V (schedule / frequency) | not published | TPW form, org interview |
| Program Summary item VI (current capacity) | not published | TPW form, org interview |
| Cohort start/end dates | not published | TPW form |
| Course hours per participant | not published (except scattered marketing) | TPW form |
| Per-grantee dollar amounts | not published | CDCR contract records / PRA request |
| Participants served per program per year | occasionally in org annual reports | see §C |
| Population type served (GP/EOP/RHU) per program | not published | org |
| Any program→recidivism linkage | does not exist publicly | CDCR Office of Research, PRA |

---

## C. Scattered capacity/hours evidence that *does* exist (org-published)

Useful as calibration, not as a dataset — each org reports a different metric on a
different basis.

| Org | Number | Basis | Source |
|---|---|---|---|
| GRIP Training Institute | 774 students, 238 graduates, 89 inside facilitators, 7 prisons (2024) | program year, all sites | GRIP 2024 Annual Report; 2025 *Peacemaker* p. 5 |
| GRIP per site | ASP 264 · CTF 137 · CMF 100 · SQ 95 · SATF 75 · MCSP 70 · CCWF 33 students | program year | 2025 *Peacemaker* p. 5 (also inside-facilitator counts per site) |
| GRIP | 52-week curriculum; monthly GRIP sessions + inside facilitators between them; Spanish cohort at Avenal (21 grads 2024) | course length | grip-traininginstitute.org/grip/ · 2024 annual report |
| Land Together (fka Insight Garden) | 450+ participants/yr, 12 garden sites, 9 prisons | annual | landtogether.org/in-prison-programs |
| Land Together | 48-week curriculum, 4 arcs | course length | same |
| Ten Toes In | 3,500+ served "total", 10 years, 90% no-return | since inception | tentoosin.org |
| 10P Program | 2,200 reached inside, 30 original cohort | since inception | 10pprogram.org |
| Enneagram Prison Project | 97% would recommend, 90% gained insight | survey %, no counts | enneagramprisonproject.org |

Note the mismatch with the TPW form: GRIP's "students served" is a program-year headcount,
the form wants per-cycle `Number of Participants` and `Participants Completed` — and
"52 weeks" is a course length, not `Course Hours (per Participant)`.

---

## D. Dead ends (checked so nobody re-checks them)

- **FI$Cal vendor payments** (`open.fiscal.ca.gov/dept_vendor_transaction.html`, files
  behind `DepartmentVendorTransactionPointer.csv`): CDCR is *not* among the departments
  publishing vendor-level transaction files — only State & Community Corrections (5227)
  and Department of Rehabilitation. So no public per-grantee payments for CDCR.
- **data.ca.gov "Purchase Order Data"** (DGS/SCPRS): coverage is 2012–2015 only.
- **data.ca.gov** has no SCPRS/state-contracts dataset for recent years; DGS's SCPRS page
  is a search UI, not a bulk download.
- **RIGHT 1.0 recipients page**: zero `$` amounts in the HTML.
- **Grants.gov / grants.ca.gov**: opportunity metadata only (deadlines, purpose), no awards.
- **Org websites generally**: the four TPW members checked in depth (GRIP, Land Together,
  Ten Toes In, Enneagram Prison Project) publish mission + a headline number. None publish
  schedule, capacity, or per-facility hours. Prison Yoga + Meditation publishes neither
  facilities nor counts.

---

## E. Precedent worth citing in the pitch

California Arts Council's **Arts in Corrections** (administered with CDCR, 33 facilities,
21 contracts) publishes annual reports and a third-party evaluation of the same kind of
community-provider program, including participation and hours:
<https://arts.ca.gov/learning-center/cac-publications-reports/> ·
<https://artsincorrections.org/>. It shows the state *can* publish provider-level
participation data when a partner agency asks for it — a concrete ask for TPW's 1% campaign.

---

## F. How this joins the Collective Impact form

```
TPW form (one row per program cycle)          public layer
  A CDCR Facility  ──────────────► facility_code  ◄── A3 crosswalk
  C Organization Name ───────────► provider       ◄── A1 MAPIP / A5 RIGHT 1.0
  H Course Hours / I Participants / J Completed   (no public source)
                                                  ── A2 underserved flag + population types
                                                  ── A6 SB601/TPOP1 denominators, recidivism cohorts
```

Rebuild all of it with:

```bash
python3 scripts/build_public_data.py     # writes data/public/*.csv, caches raw HTML in data/public/raw/
```
