# Data recon — what is actually in the TPW Collective Impact dataset

Snapshot: `data/tpw-collective-impact.csv` + `data/tpw-collective-impact-form.xlsx` as committed
2026-10-24. Glossary: `docs/TPW Data Glossary Instructions.docx` (June 2026, Rick Olesek / Kim
Moore). Grant: `docs/RIGHT 4.0 RFA.pdf`. All figures below were produced with `python3` and the
stdlib `csv` module only (no pandas, no openpyxl — see "Reproduce" at the end). Every number is
recomputable from the two local files.

For teammates who have not opened the sources. Read §1 and §2 before you quote anything; read §3
before you promise anything.

---

## 0. The short version

| | |
|---|---|
| Records in the file | 103 — of which **66 are empty formula residue**, so **37 real rows** |
| Rows defensible for analysis | **31** (30% of the file, 84% of populated rows) |
| Organizations | **3** — Defy Ventures (20 rows), GRIP Training Institute (16), Enneagram Prison Project (1) |
| Facilities | **14** of the 31 names in the Constants tab |
| Programs | **4** org × program pairs: CEO of Your New Life, Guiding Rage Into Power, Standard Course, A Breath of Freedom |
| Program years | 2024 (18 rows), 2025 (17), 2026 (1) |
| Enrolled (I, numeric rows) | **1,469** across 36 rows |
| Completed (J, numeric rows) | **764** across 32 rows |
| Participant-hours (col L) | **104,039** — and L reconciles exactly with J×H in every single row |
| Completion rate | **52.0%** (all rows) · **57.3%** (Completed only) · **58.6%** (31 clean rows) |
| Completion > enrollment | **zero cases.** The rule never fires. The real defect is the opposite one. |
| Individual identifier | none. No name, no CDCR number, no DOB, no release date, no demographic field. |
| Outcome data | none, and none is obtainable at person level from any public source (§3) |
| Detectable effect with 739 completers | **5–10 pp** depending on the comparison arm (§3.6) — and **0** of 31 cycles has a 3-year follow-up window old enough to measure it |

The dataset is a *census of 3 organizations' 2024–25 cohorts*, not a statewide dataset. The README
says "seven organizations' worth of rows"; the snapshot has three. The repo has grown a lot of
hand-written prose about this file — trust the numbers in this doc, they were recomputed.

---

## 1. Profile of the real data

### 1.1 File anatomy

`data/tpw-collective-impact.csv`: 104 lines = 1 header + 103 records. Every record has exactly 13
fields. What the 103 records actually contain:

| Lines in file | Sheet rows | Content |
|---|---|---|
| 1 | 1 | header, 13 columns |
| 2 | 2 | SAMPLE DATA (must exclude) |
| 3–37 | 3–37 | 35 real cycles, keyed by a human into the sheet |
| 38 | 38 | one cycle shell: org + program only, no dates, no hours, no counts |
| 39–104 | 39–104 | **66 empty rows carrying only `K=0`** |

Those 66 are a spreadsheet artifact, not data: `K2` holds the shared formula
`=H2*J2` with `ref="K2:K104"`, so the whole column was dragged to row 104 and every empty row
computes `0*0`. `L` (program year) uses `=IF(ISBLANK(F2),"",YEAR(F2))` over the same range and
correctly stays blank. **64% of the file is scaffolding.** Any denominator that starts with "103
rows" is wrong by 3×.

### 1.2 Volume

Two different answers, depending on the row filter. Both are correct; they answer different
questions.

| Row set | Rows | Enrolled | Completed | Rate | Participant-hours |
|---|---|---|---|---|---|
| All populated | 37 | 1,469 | 764 | 52.0% | 104,039 |
| `E = Completed` | 34 | 1,334 | 764 | 57.3% | 104,039 |
| Completed, not SAMPLE | 33 | 1,306 | 739 | 56.6% | 103,064 |
| Completed, not SAMPLE, J numeric | **31** | **1,261** | **739** | **58.6%** | **103,064** |

The 52.0% → 58.6% spread is the glossary's "Completed only" rule doing real work: three
`In Progress` rows (17, 20, 21) contribute 180 enrollees and zero completions, which drags the
headline rate down 6.6 points. **Anyone who reports a completion rate without stating the filter
is reporting a number they cannot defend.**

### 1.3 Per program

| Org | Program | Rows | Enrolled | Completed | Rate | Participant-hours |
|---|---|---|---|---|---|---|
| Defy Ventures | CEO of Your New Life | 20 | 900 | 364 | 40.4% | 64,064 |
| GRIP Training Institute | Guiding Rage Into Power | 15 | 541 | 375 | 69.3% | 39,000 |
| Enneagram Prison Project | Standard Course | 1 | 28 | 25 | 89.3% | 975 |
| GRIP Training Institute | A Breath of Freedom | 1 | — | — | — | 0 |

Same table restricted to the 31 defensible rows (this is the version to quote):

| Org | Program | Rows | Enrolled | Completed | Rate |
|---|---|---|---|---|---|
| Defy Ventures | CEO of Your New Life | 16 | 720 | 364 | **50.6%** |
| GRIP Training Institute | Guiding Rage Into Power | 15 | 541 | 375 | **69.3%** |

**Defy moves 10 points** (40.4% → 50.6%) when the three In Progress rows are excluded, because
those rows add 180 enrollees whose completions are still `TBD`. GRIP does not move at all.

By program year (clean rows): GRIP 2024 = 346/223 (64.5%), GRIP 2025 = 195/152 (77.9%);
Defy 2024 = 315/163 (51.7%), Defy 2025 = 405/201 (49.6%).

### 1.4 The Defy denominator is a constant, not a count

`Number of Participants` = **45 in all 20 Defy rows**. Not 44, not 46, not once. `Completed`
varies normally (7–36). GRIP's numbers vary as you'd expect (30–44 enrolled).

The most likely reading is that 45 is Defy's cohort capacity and the field was filled with the
cap rather than with a headcount. Consequence: Defy's "completion rate" is really *fraction of
capacity that finished*, its denominator cannot respond to actual attendance, and the 45 ceiling
is why **no row anywhere has completions > enrollment** — the data is too capped to produce that
error. 16 of the 31 defensible rows (52%) carry this denominator. Do not compare Defy's rate to
GRIP's without saying so.

### 1.5 Completion rate distribution and cohort size

Clean rows, completions per cycle, sorted: 7, 13, 16, 17, 17, 18, 18, 19, 20, 20, 20, 20, 21, 22,
22, 22, 22, 22, 24, 28, 28, 29, 30, 30, 31, 31, 33, 33, 35, 35, 36. Median **22**, mean 23.8,
min 7, max 36. Enrollment per cycle (clean rows): median **45**, range 30–45.

That distribution matters more than the rates do: 22 people per cycle is where statistical power
goes to die (§3.6).

### 1.6 Participant-hours — three definitions, 85% apart

Column L is `J × H`, i.e. completions × course hours, and it is arithmetically clean: **all 37
rows reconcile exactly, zero mismatches**, and `L = 0` only for row 38, which has no inputs.

| Definition | Total | What it means |
|---|---|---|
| `J × H` (as shipped) | **104,039** | hours delivered to people who finished |
| `I × H` (enrollees × course hours) | **191,996** | hours if every enrollee had perfect attendance |
| Neither | — | nobody logs attendance, so the truth is between them and unknowable |

Note that the glossary's proposed rename is the whole issue in one line: column H is currently
labelled "Total Programming Hours" and *is not* a total. H is a property of the curriculum
(Defy 176 h, GRIP 104 h, EPP 39 h — no conflicts across rows), so it belongs in a program table,
not on every cycle row.

### 1.7 Dimensions

Facilities used, with clean-row enrollment: ASP 133, CCI 180, CTF 117, KVSP 135, LAC 135, CIW 90,
SVSP 90, VSP 90, MCSP 80, CMF 72, RJD 45, CCWF 36, SQ 33, SATF 44. So **14 of the 31 institutions
in the Constants dropdown are covered** — 45%, with 17 institutions reported by nobody.
The fact that matters for §3: 1,261 enrollees across two program years is ≈630 per year, i.e.
**2.4% of one year's statewide release flow** (26,812 releases in the 12 months to 2026-09-30).

---

## 2. Data quality inventory

Row numbers below are **sheet rows** (row 1 = header), so they match what Rick or Kim would see if
they opened the Google Sheet.

| # | Defect | Where | Size | Effect |
|---|---|---|---|---|
| 1 | Phantom rows | 39–104 | 66 rows | 64% of the file is empty formula residue; `K=0` on all 66 |
| 2 | `SAMPLE DATA` row | **2** (SQ / Enneagram / Standard Course) | 1 row | 28 enrolled, 25 completed, 975 hours that are not real. Also the only row in the file with a note. |
| 3 | `TBD` strings | **13** (J), **17** (G,H,J), **20** (G,H,J), **21** (G,H,J) | 10 cells / 4 rows | breaks arithmetic, blocks any hours or rate |
| 4 | `#VALUE!` | **K13, K17, K20, K21** | 4 cells | the documented "`TBD` in J ⇒ `#VALUE!` in L" bug, live in the delivered file (K here, L in the glossary — see #15) |
| 5 | Completed row with no inputs | **38** (CMF / GRIP / A Breath of Freedom) | 1 row | status says Completed, everything else blank, `L=0`. Silently contributes a 0 to any average. |
| 6 | In Progress rows submitted anyway | **17, 20, 21** | 3 rows | glossary says "Completed rows only"; these add 180 enrollees and 0 completions |
| 7 | Impossible date ranges | none | 0 rows | no end-before-start, no future dates, no unparseable dates. **This check passes.** |
| 8 | Implausible durations | **25, 26, 27** (551 d), **3** (510 d), **30–33** (507–508 d) | 8 rows | a 104-hour course spread over 1.4–1.5 years. Not impossible — GRIP is a 52-week programme — but 25/26/27 exceed the 18-month plausibility limit (551 d) and 3 and 30–33 sit just under it |
| 9 | Duplicate-key rows | **25/26/27**, **30/31**, **34/35** | 7 rows in 3 groups | identical facility+yard+org+program+start+end, differing counts |
| 10 | Missing yard | 2, 11, 13, 14, 17, 18, 22, 23, 25, 26, 27, 34, 35, 36, 38 | **15 of 37 rows (41%)** | cannot tell two concurrent cohorts apart; see #9 |
| 11 | Inconsistent yard spelling | `B` (3) vs `B Yard` (2); `E` (1) vs `E Yard` (1) | 9 non-blank spellings for 7 real yards | grouping by yard under-counts or over-counts depending on spelling |
| 12 | Facility naming | all 14 used values match the Constants tab **verbatim** (0 mismatches) | — | this check passes. Cross-source naming is the problem, not the sheet |
| 13 | Stale facility list | Constants offers **California Rehabilitation Center (CRC)** | 1 of 31 | TPOP1 for 2026-10-21 states CRC **closed on 2026-10-01**. The dropdown invites a cycle at a closed prison. |
| 14 | Column K `Funded by RIGHT 2.0` | absent from **both** the CSV and the workbook | 1 column | already dropped in the data, still documented in the glossary |
| 15 | Glossary/workbook column drift | entire lettering | 13 vs 14 columns | glossary A–N with K = funding; workbook A–M with K = `=H*J`. **Every column letter from K onward is off by one.** Code written against the glossary reads the wrong column. |
| 16 | CSV header typo | column 11 | 1 header | `CALC: Total Participant Programming hours (Participants Completed * Total Programming Hours` — unterminated paren, lowercase "hours". `df['…Total Programming Hours']` is a KeyError. |
| 17 | Form Responses tab is not a data source | xlsx sheet 2 | 1 row | a single **test** submission, timestamp 2026-07-22: Avenal / Yard `Test` / Org `Test` / program `test` / 24 h / 20 started / 15 completed. Zero production submissions. The 37 rows were keyed by hand. |
| 18 | Two label generations in one workbook | sheet 1 vs sheet 2 | — | sheet 2 already says "Course Hours (per Participant)" (the *proposed* rename); sheet 1 still says "Total Programming hours" |

### 2.1 How much is unusable

```
103 records in the file
 −66  empty formula residue (rows 39–104)              → 37
 −1   SAMPLE DATA (row 2)                              → 36
 −3   In Progress, out of scope per glossary (17,20,21) → 33
 −1   empty shell (row 38)                             → 32
 −1   completions unknown, `TBD` (row 13)              → 31 defensible rows
```

**31 / 103 = 30% of the file. 31 / 37 = 84% of populated rows.** Those 31 rows carry 1,261
enrollees, 739 completions, 103,064 participant-hours.

But "defensible" is not "joinable". Within those 31:

- **15 rows (48%) have no yard** — so at multi-yard institutions the cohort is unidentifiable
  even after a person-level join is built.
- **7 rows (23%) sit in duplicate-key groups** — see below.
- **16 rows (52%)** carry Defy's constant-45 denominator (§1.4).
- **0 rows** carry a release date, so **0 rows** have a mature 3-year outcome window (§3.6).

Rows that satisfy all of these at once: **0**. That is the honest starting point.

### 2.2 Duplicate sensitivity — we cannot tell, and it costs 10% of enrollees

The three duplicate groups are all at multi-yard institutions with a **blank or colliding yard** —
which is exactly why they look like duplicates:

| Rows | Facility / program | Dates | Counts (I/J) |
|---|---|---|---|
| 25, 26, 27 | SQ / Guiding Rage Into Power | 12/1/2024 → 6/5/2026 | 33/21, 41/30, 30/20 |
| 30, 31 | ASP B / Guiding Rage Into Power | 9/1/2024 → 1/22/2026 | 33/20, 35/20 |
| 34, 35 | CMF / Guiding Rage Into Power | 10/1/2024 → 11/20/2025 | 41/24, 31/22 |

Per the glossary ("one row per yard"), these are most likely concurrent cohorts at different yards
that nobody labelled — i.e. **legitimate rows**. But if they are re-entries, they double-count.

Collapsing each group to a single row (keeping the max of each count) gives:

| Scenario | Rows | Enrolled | Completed | Rate |
|---|---|---|---|---|
| As shipped | 31 | 1,261 | 739 | 58.6% |
| Duplicates collapsed | 27 | 1,134 | 656 | 57.8% |

**±127 enrollees and ±83 completions — 10% of the headline, and the rate barely moves.** The rate
is robust; the volume claim is not. Do not put "1,261 participants" in a pitch deck without a
footnote. Note also that rows 30 and 31 report *the same* 20 completions with 33 and 35 enrolled,
which reads like a corrected enrollment submitted twice rather than two cohorts.

### 2.3 What is *not* broken (credit where due)

Worth saying out loud, because it shapes what we build:

- `L = J × H` is exact in all 37 rows. The formula works; only the `TBD` inputs break it.
- `M` (program year) = `YEAR(F)` wherever both exist. Zero conflicts with the start date.
- All 14 facility strings match the Constants tab verbatim — one of them with a U+2019 curly
  apostrophe ("Women’s") that survives a spreadsheet but will bite any join done on the string
  instead of the code (§3.5).
- No end-before-start, no future dates, no unparseable dates, no completions > enrollment.
- Course hours are internally consistent per program (176/104/39, no drift in any of the 33 rows that have a value).

The dataset is small and dirty in *known, enumerable* ways. That is much better news than it
sounds: 18 specific defects, each fixable at the point of entry.

---

## 3. The join problem

### 3.1 What is missing, precisely

The form has **13 fields and none of them identify a person or an event after release**. To join
participation to parole or recidivism you need, at minimum:

| Needed | In the form? | Consequence |
|---|---|---|
| A person key that survives custody (CDCR number, or a token derived from it) | **no** | nothing in this file can be matched to any record anywhere, ever |
| Release date | **no** | the outcome clock cannot start; end-of-program ≠ release |
| Release type (parole / PRCS / direct discharge) | **no** | PRCS and parolee cohorts have different base rates |
| Any covariate (age, commitment offence, LOS, risk score) | **no** | no way to know whether a comparison group is comparable |
| Provider/cohort identity on the outcome side | **no** | even a received CDCR extract would need our cohort ID added |

So the join cannot be *recovered* — it has to be *manufactured* going forward, and the only
manufacturable key is one TPW controls. Three realistic routes.

### 3.2 Option A — facility + period aggregate matching (no identifiers)

**Idea.** Compare the 3-year conviction rate for a facility-year in which a programme ran against
the same facility in years when it did not, using only published aggregates.

**Why it fails, in numbers.** A cohort's effect on the facility aggregate is diluted by its share
of the release stream. With the real figures:

- Statewide releases in the 12 months to 2026-09-30: **26,812** (`data.ca.gov`, Monthly Admissions
  and Releases). Per facility ≈ releases × population share; CTF ≈ 1,264/yr, SATF ≈ 1,608/yr,
  SQ ≈ 677/yr (populations from TPOP1, 2026-10-21).
- A 40-enrollee cycle is therefore **2.5–6% of a facility's annual release flow** (SATF ≈ 1,608/yr
  → 2.5%; CTF ≈ 1,264 → 3.2%; SQ ≈ 677 → 5.9%), and a median 22-completer cycle is 1.4–3%. TPW's
  *entire* footprint — 1,261 enrollees over two program years, ≈630/yr — is **2.4% of one year of
  statewide releases** (4.7% if you improperly stack both program years into one).
- At n ≈ 1,000 releases per facility-year, the standard error on a 40.6% baseline rate is ~1.6 pp,
  so a real aggregate shift needs to be ~4 pp to be visible. An individual-level effect `d` moves
  the aggregate by `d × cohort share`. At a 2% share, you would need an individual effect of
  **~200 pp** to see it. At a 25% share it is still 16 pp.

Aggregate matching is only viable if a programme covers a large fraction of one institution's
release stream. **No CBO programme in this dataset does.** It is still worth *displaying* as a
comparison line (TPW cohort vs the CDCR baseline at the same facility), as long as it is never
labelled as an effect estimate.

### 3.3 Option B — program-level pseudonymous IDs (what the repo already prototypes)

Each organisation derives `token = HMAC-SHA256(org_key, CDCR_number)[0:32]` in the browser and
commits only the hex. The same number always yields the same token, so participation accumulates
across cycles; the key never leaves the CBO (§`intake/js` and README).

**Strengths.** No PII in git; the org can reproduce the mapping, nobody else can; works today with
zero CDCR cooperation; the token is a *person* key, which is the only thing that can beat the
dilution problem in §3.2.

**Honest costs.** (a) It only covers people whose CDCR number the CBO actually records — a new ask
of 120 member organisations, several of which currently cannot count their own cohorts (§1.4).
(b) You still need CDCR to return outcome flags *for tokens* — i.e. a matching service at CDCR
that TPW cannot run. (c) Key rotation breaks continuity; key loss breaks the cohort. (d) A CDCR
number is arguably personal information even hashed at 128 bits, so the org key becomes a
regulated asset with a retention policy.

**Verdict.** Necessary ingredient, not sufficient. Build it so the ask is concrete, but do not
pretend it produces outcomes on its own.

### 3.4 Option C — CDCR-provided cohort lists (the only route to real outcomes)

CDCR already does this join for its own programmes. The **Supplemental Recidivism Rates for
Individuals with Rehabilitative Program Achievements, FY 2020-21** report publishes 1/2/3-year
arrest, conviction, and return-to-prison rates for people who earned an EDU, CTE, or Cognitive
Behavioral Programs achievement, next to the rate for people who earned *no* achievement:

| Group (released FY 2020-21) | n | 3-yr conviction |
|---|---|---|
| Any academic EDU achievement | 1,731 | 22.4% |
| Any CTE achievement | 1,751 | 24.4% |
| Any CBP achievement | 2,788 | 28.6% |
| **No CBP achievement completed in custody** | **27,328** | **40.6%** |

So the machinery — cohort definition, follow-up windows, conviction matching, comparison group —
exists inside CDCR, and the comparison group methodology is already accepted by the Department.
What it covers is CDCR-run programming. **Community-provider programming run under RIGHT is not in
it**, even though some achievement categories rhyme with grant programmes (CDCR's CBP table
includes "Victim Impact" and "Occupational Mentor Certification Program"; MAPIP lists Victim Impact
as a grant programme — I have **not** confirmed these are the same thing).

The legal path is narrow but real:

- **RIGHT 4.0 RFA §16(a)**: annual reports cover "the institution the funds were utilized, the
  number of participants, and populations served". Process data only. Recidivism is not asked for.
- **RFA §15**: "For external publication purposes, grant recipients are not permitted to evaluate
  any programs administered solely or in part by the grant recipient." Outcomes work needs an
  independent third party and CDCR Office of Research approval.
- **CDCR Research Oversight Committee (ROC)**: quarterly meetings (2026: Mar 26, Jun 18, Sep 17,
  Dec 17), application + guidelines, all correspondence via `Data.Requests@cdcr.ca.gov`, operating
  under Title 15 §3488. The ROC's stated 2026 priorities list **"program evaluation/effectiveness
  of programs"** first.

**Verdict.** The only route that yields person-level outcomes, and it costs a research agreement,
not code. The prototype's job is to make that ask one page long.

### 3.5 What the public data can and cannot do — verified sources

All URLs fetched 2026-10-24 and returning 200. The repo's own audit in
`docs/public-data-sources.md` covers the provider/coverage side in more depth.

| Source | URL | Gives | Cannot give |
|---|---|---|---|
| CDCR Recidivism Reports + dashboard | `cdcr.ca.gov/research/recidivism-reports/` and `…/offender-outcomes-characteristics/offender-recidivism/` | 3-yr conviction/arrest/return rates by release FY, demographics, county, from FY 2008-09 | any program participation flag; it is a Power BI dashboard + PDFs, no person rows |
| Rehabilitative Program Achievements briefing (FY 2020-21) | `cdcr.ca.gov/research/wp-content/uploads/sites/174/2026/09/Recidivism-Rates-for-Rehabilitative-Program-Achievements-FY-2020-21.pdf` | achievement-category outcome rates + no-achievement comparison group (§3.4) | CBO attribution; CDCR programs only |
| SB601 institutional statistical reports | `data.ca.gov/dataset/sb601-reporting` + per-institution pages linked from `cdcr.ca.gov/research/statistical-reports-sb601/` | institution × quarter, with a "Rehabilitative Programs" category | I downloaded the data file (`sb601_data_2024_06.xlsx`, 4.2 MB): its 13 `FieldName` values are **Academic Education, CTE, CBI-Sex Offender, and Transitions** — enrollment and capacity only. **Zero rows for GRIP, Defy, or any grant programme.** Also: the file is named `…2024_06`, so it lags by ~2 years despite a 2026 metadata date. |
| TPOP1 / TPOP4 weekly population | `cdcr.ca.gov/research/population-reports-2/` | per-institution population as of 2026-10-21 (total in-custody 87,437; parole 32,829) | any program or person data; denominators only |
| Monthly Admissions and Releases | `data.ca.gov/dataset/monthly-admissions-and-releases` | statewide monthly admissions/releases to 2026-09-30 (CSV) | institution breakdown |
| CDCR MAPIP — In Prison Programs by Location | `cdcr.ca.gov/rehabilitation/inprison/mapip/` | institution × grant programme × **provider name** | counts, hours, cohorts |
| RIGHT 1.0 recipient list | `cdcr.ca.gov/rehabilitation/right-grant-01-recipients/` | 72 grantee org names | amounts, participants |
| CA DOJ OpenJustice | `openjustice.doj.ca.gov/` | statewide arrests, filings, dispositions | any custody or program link |
| CDCR ROC / research requests | `cdcr.ca.gov/research/research-requests/` · `Data.Requests@cdcr.ca.gov` | the process in §3.4 | a dataset |

**Where I am not confident, stated plainly:**

- I found **no** public person-level parole or recidivism microdata from CDCR, and I do not believe
  one exists. Treat "we will find it on data.ca.gov" as false.
- Whether the ROC would approve a TPW cohort-matching request, and on what timeline, is untested.
  It is a quarterly committee with a research agreement, not a data portal.
- Whether SB601's `Actual Enrollment` figures for Academic Education/CTE can serve as any kind of
  denominator for CBO programmes — I checked the field names and they cannot; I did not attempt to
  reconcile them per institution.
- I have not verified whether RIGHT annual reports are published anywhere. The RFA sends them to a
  mailbox; nothing suggests they are released.

### 3.6 The maturity problem, which no architecture fixes

Take the generous assumption that release ≈ cycle end date, and measure as of 2026-10-24:

| Window | Cycles with a matured window | Enrollees | Completers |
|---|---|---|---|
| 12 months | 9 / 31 | 405 | 221 |
| 24 months | 1 / 31 | 45 | 18 |
| **36 months** | **0 / 31** | **0** | **0** |

The cohort end dates in this dataset run 2026-01-21 → 2026-06-25. Under CDCR's own primary measure
(3-year conviction rate) **not one cohort in the file can be evaluated before 2029.** Any prototype
that shows a 3-year outcome rate today is showing synthetic or borrowed numbers, and must say so.

And when the windows do mature, 739 completers buys you this (two-proportion test, α=.05 two-sided,
80% power, baseline 40.6% from the no-CBP comparison group). Two designs, because the comparison
arm matters more than anything TPW controls:

| Effect to detect | 1:1 matched comparison (n=739 would need) | Against CDCR's full comparison group (27,328) | Available today |
|---|---|---|---|
| 5 pp | 1,477 | **777** | 739 — just short |
| 7.5 pp | 645 | 345 | 739 ✔ |
| **10 pp** | **356** | **194** | 739 ✔ |
| 15 pp | 151 | 86 | 739 ✔ |
| 20 pp | 79 | 48 | 739 ✔ |

The honest claim: **against CDCR's full no-achievement comparison group, 739 completers lands just
under the 777 needed for a 5-point claim; against a 1:1 matched comparison it is about half of the
1,477 needed.** So "one more program year, tokenised, gets TPW to a defensible 5-point claim" is
supportable; "TPW can prove a 5-point effect today" is not. Both statements assume every one of
those 739 people is tokenised, released, matched, and poolable — across 31 cycles, 14 facilities,
2 organisations with analysis-ready rows and different definitions of "completed", and 0 rows with
a mature 3-year window.

That arithmetic is the single most useful thing in this document. It converts "we need better data"
into a specific, fundable ask: **~777 completers with real release dates, measured against CDCR's
comparison group, buys a 5-point claim; 1,477 buy it against a 1:1 matched group.**

---

## 4. Schema proposal

Design constraints, in priority order: (1) the existing A–N sheet keeps working for CBO entry —
nobody relearns data entry; (2) no PII in anything committed; (3) cohort-level outcome rates are
computable without ever materialising a person; (4) every quality rule in §2 is enforced at entry,
not discovered later.

### 4.1 Tables

```
dim_facility
  facility_code      PK   'SATF'                     ← the only facility key anywhere
  tpw_form_name           exactly the Constants string the dropdown submits
  mapip_name, attachment_a_name, sb601_name, tpop1_name
  opened_date, closed_date        CRC → 2026-10-01
  underserved_right4      bool   (Attachment A, +0.5 pt institutions)
  pop_types_absent        ['EOP','MHCB','RHU']

dim_org
  org_id             PK   slug: 'grip-training-institute'
  legal_name, aliases[]
  ein                    nullable — for 990 lookups (ProPublica)
  tpw_member             bool, member_since

dim_program
  program_id         PK   slug: 'grip.guiding-rage-into-power'
  org_id             FK → dim_org
  program_name
  default_course_hours   the curriculum length, replaces per-row H
  UNIQUE (org_id, program_name)

fact_cycle                       ← 1:1 with today's sheet row, A–N preserved
  cycle_id           PK   deterministic slug of (facility_code, org_id, program_id,
                          start_date) — stable, human-readable, already the repo's convention
  org_id             FK, program_id FK, facility_code FK
  yard_raw, yard_norm     keep raw; normalise 'B' / 'B Yard' → 'B'
  status                  Planned | In Progress | Completed
  start_date, end_date
  course_hours            defaulted from dim_program, overridable per cycle
  participants_started, participants_completed
  funding_source          generalises the dropped column K (6 values, incl. 'Unknown')
  notes
  source                  sheet_import | form | issue
  source_row              sheet row number — the audit trail back to §2
  submitted_by, submitted_at
  flags[]                 quality-rule ids that fired
  -- derived, never stored: total_participant_hours = completed * course_hours
  --                         program_year = year(start_date); duration_days = end - start

fact_participation               ← the spine; the ONLY person-level table
  cycle_id           PK(1)
  token              PK(2)   HMAC-SHA256(org_key, cdcr_number)[0:32]
  event                   enrolled | completed | withdrew
  event_date
  source_batch
  -- no name, no CDCR number, no DOB, no yard-of-housing, nothing else

dim_release                      ← one row per release episode, not per person
  release_id         PK
  token              FK → fact_participation
  release_date
  release_type            parole | prcs | discharge | other
  release_facility_code   FK → dim_facility
  source                  cdcr_cohort | roc_agreement | cbo_reported
  as_of
  UNIQUE (token, release_date)   -- a person can be released more than once

fact_outcome                     ← one row per release episode x window
  release_id         PK(1) FK → dim_release
  window_days        PK(2) 365 | 730 | 1095
  convicted              0/1, plus conviction_date
  arrested               0/1
  returned_to_prison     0/1
  offense_class          felony | misdemeanor
  source_batch, as_of     ← every number is stamped with where and when it came from
```

### 4.2 Views — this is what the app reads

```
vw_cycle_outcome(cycle_id, window_days)
  n_enrolled, n_tokens, n_released, n_matured, n_convicted, conviction_rate
  suppression: n_matured < 5 → row withheld entirely (repo rule)
               n_matured < 50 → is_interpretable = false (dimmed, not interpreted)

vw_facility_year(facility_code, program_year)
  cycles, enrolled, completed, participant_hours, completion_rate,
  matured_12mo/24mo/36mo, outcome_rate_by_window

vw_cycle_integrity(cycle_id)
  the §2 rules as SQL: sample_row, unknown_completions, end_before_start,
  completions_exceed_starts, implausible_duration, duplicate_key, missing_yard,
  capacity_denominator, facility_closed
```

### 4.3 How the join actually runs

```
dim_org ──1:N── dim_program
   │                 │
   └──1:N──► fact_cycle ──N:1──► dim_facility        (join on facility_code — never on a name)
                  │
                  └──1:N──► fact_participation ──token──► dim_release ──release_id──► fact_outcome
                                                                                        │
                                                             vw_cycle_outcome ◄─────────┘
```

| Join | Key | Cardinality | Notes |
|---|---|---|---|
| cycle → facility | `facility_code` | N:1 | resolved at entry from the dropdown; name variants live in dim_facility |
| cycle → program | `(org_id, program_id)` | N:1 | course hours ride along, so H stops being retyped |
| cycle → participants | `cycle_id` | 1:N | only exists once a CBO adopts the spine |
| participant → release | `token` | 1:N | one row per release episode; a person can be released twice |
| release → outcome | `(release_id, window_days)` | 1:0..3 | 1/2/3-year windows evaluated separately, never blended |
| **cohort rate** | `(cycle_id, window_days)` | 1:1 | computed, never a stored person |

### 4.4 What CBOs actually see changing

Nothing, mostly. The 13 columns stay; three things are added and one becomes derived:

1. **Program becomes a chosen thing, not a typed string** — picking "Guiding Rage Into Power" fixes
   104 course hours, so H stops being entered and can never disagree with itself.
2. **Yard becomes a closed list per facility** — kills §2.11 and makes §2.9 duplicates impossible,
   because a duplicate (same facility + yard + program + start) is now rejected, not discovered.
3. **Funding source replaces the deleted column K** with six options, one of which is "Unknown".
4. **Optional: the participant spine** — paste CDCR numbers, they are hashed locally, and only
   tokens leave the browser. A CBO that cannot do this yet still submits a valid process row.

Plus, at the source: `TBD` becomes a nullable field with a required `status` (there is no
"Completed with unknown completions" — that combination is now `In Progress`), which structurally
eliminates the `#VALUE!` class rather than flagging it.

### 4.5 Privacy rules the schema must carry

- No table above stores a name, a CDCR number, a DOB, or a housing unit. `token` is the only
  person-level value that is ever committed.
- The org key lives in the CBO's browser or its own records; losing it breaks continuity and is the
  documented failure mode.
- Suppression at n < 5 matured, "not yet" at n < 50 — and **a cycle whose window has not matured
  must render as "not yet measurable", never as 0%.**
- Comparison is observational. Completers differ from non-completers before they walk in the room;
  the schema has no covariate table, so nothing here can support a causal claim.

---

## 5. Three prototype directions

Assumed 36-hour hackathon, team of 3–4, this repo as the base.

### A. Outcome feasibility simulator — "what can TPW actually prove, and when?"

**Pitch.** A single screen: pick a facility, pick a cohort size, watch the detectable-effect curve
move. It answers the question the problem statement really asks — *what would it take to know?* —
using the real 739 completers, the real 26,812 annual releases, and CDCR's own published baseline
(40.6% no-CBP 3-year conviction) as the comparison line. It computes, for aggregate matching, token
matching, and CDCR-cohort matching, the minimum effect each can detect, and marks where TPW sits
today. Output: one page TPW can hand to CDCR's Office of Research saying *"give us cohort lists for
these 14 institutions and we can claim a 5-point difference by 2030; here is the arithmetic."*

**Effort.** Medium — 1 day. All arithmetic, no ML. Data needed is already local plus three
published figures.

**Demo appeal.** High, but cerebral. The moment that lands: dragging the cohort-size slider and
watching the aggregate-matching line become "not detectable at any effect size". It makes the
judges' own scepticism the demo.

**Risk.** It shows a limitation rather than an outcome. Mitigate by shipping the *ask* as an
artifact (a drafted ROC request + a facility list), so the limitation converts into a next step.

### B. Coverage and 1% campaign map

**Pitch.** Facility × programme coverage from the three real organisations, layered on CDCR's
MAPIP list of 113 institution × provider rows and the RIGHT 4.0 underserved flags (both from the
repo's own audit in `docs/public-data-sources.md`). Shows: which of the state's 30 institutions have
zero TPW presence, which grant programmes exist where, how many hours TPW members delivered
(103,064), and — the killer chart — that 56% of the organisations CDCR currently funds in prisons
are already TPW members (36 of 64, per that audit).

**Effort.** Low — half a day, most of the public layer already exists in `data/public/`.

**Demo appeal.** Highest per hour spent. It is a chart of a real thing that looks like a campaign.

**Risk.** It is exactly the process data TPW already has. It concedes the premise of the problem
statement. Best used as the *opening* two minutes of a demo, not the prototype.

### C. The join-ready intake (already in this repo)

**Pitch.** Schema-driven form, git-as-database, pseudonymous HMAC spine, impact view with 12/24/36
month windows. It is the only thing here that changes what data can be collected *next year*.

**Effort.** Already spent. Remaining work is the real-outcome path, which is a data agreement, not
code.

**Demo appeal.** Good — a form that writes a git commit is a nice moment, and the impact view has
the right honesty guards (dimmed under 50, "not yet" not "clean"). But the spine is synthetic, and
a judge will ask "where are the outcomes?" The answer — "we built the socket, not the plug" — is
true and unsatisfying on its own.

**Risk.** Being a *submission mechanism* is not what TPW is short of. They are short of an argument
that survives a legislator's staffer.

### Recommendation: **A, wrapped around C, opened with B's map**

Build **A** as the prototype and present it *as the reason C exists*:

1. **0:00–2:00 — B's map.** 3 organisations, 14 facilities, 103,064 participant-hours, 739
   completions, 56% of CDCR's funded providers are TPW members. Real, and it earns the room.
2. **2:00–7:00 — the wall.** Put the numbers from §3.6 on screen: 0 of 31 cycles has a mature
   3-year window; 739 completers lands *just under* the 777 needed to claim a 5-point difference;
   facility-level aggregate matching would need a 200-point individual effect. That is the problem
   statement, quantified for the first time.
3. **7:00–12:00 — A.** The simulator. Slider moves, the answer changes, and one setting produces a
   printable ask: *14 institutions, CDCR-provided cohort lists, ~777 tokenised completers with real
   release dates (1,477 if the comparison group is 1:1), ROC submission by December 17.*
4. **12:00–14:00 — C.** Show the intake that would generate those cohorts with tokens, so the ask
   is answerable if CDCR says yes.

Why A: it is the only direction that (i) uses the real dataset, (ii) does not need PII to be
credible, (iii) cannot be accused of inventing outcomes, and (iv) produces a number TPW can carry
into a funding conversation. B alone is the status quo dressed up; C alone is infrastructure with
no argument attached. A is the argument.

If the team has only 6 hours: skip the slider, ship a static page with the three scenarios and the
power table from §3.6, and spend the remaining time on the drafted ROC ask. The table *is* the
product.

---

## 6. Open questions for Rick and Kim

Ranked by how much they change the analysis. All are cheap for them to answer and expensive for us
to guess.

1. **Is Defy's `Number of Participants = 45` a headcount or a capacity?** (It is 45 in 20 of 20
   rows.) If capacity, half the analysis-ready dataset has a non-responsive denominator.
2. **Rows 25/26/27, 30/31, 34/35 — concurrent cohorts at different yards, or re-entries?** It moves
   the headline by 127 enrollees.
3. **Does "A Breath of Freedom" (row 38) exist as a cycle?** Status says Completed, every input is
   blank. Either it ran and nobody filled it in, or it is a placeholder.
4. **Was `Funded by RIGHT 2.0` dropped on purpose?** The column is gone from the workbook and the
   glossary still documents it — which is one of the two columns where the letters diverge.
5. **Does TPW want the funding source at all?** If the 1% campaign is the point, RIGHT vs other
   funding is the interesting cut. If it is not tracked, four of the six options in the repo schema
   are speculative.
6. **Did anyone actually use the Google Form?** The Form Responses tab has one test row from
   2026-07-22. If the 37 rows were hand-keyed, "make the form easier" is a different problem from
   "make the form exist".

---

## Reproduce

```bash
cd "$(git rev-parse --show-toplevel)"

# 1. anatomy: 103 records, 37 populated, 66 phantom, 13 columns
python3 - <<'PY'
import csv
rows = list(csv.reader(open('data/tpw-collective-impact.csv', newline='')))
body = rows[1:]
pop  = [r for r in body if any(c.strip() for c in r[:10]) or (r[12:13] and r[12].strip())]
print(len(rows[0]), 'columns |', len(body), 'records |', len(pop), 'populated |',
      len(body) - len(pop), 'phantom')
PY

# 2. volume and rates
python3 - <<'PY'
import csv, re
rows = list(csv.reader(open('data/tpw-collective-impact.csv', newline='')))[1:]
def n(v): v = v.strip(); return int(v) if re.fullmatch(r'\d+', v) else None
pop = [r for r in rows if any(c.strip() for c in r[:10]) or (r[12:13] and r[12].strip())]
e = sum(n(r[8]) or 0 for r in pop); c = sum(n(r[9]) or 0 for r in pop)
h = sum(int(r[10]) for r in pop if r[10].strip().isdigit())
print('enrolled', e, 'completed', c, 'rate %.1f%%' % (100*c/e), 'hours', h)
PY

# 3. the duplicates
python3 - <<'PY'
import csv, collections
rows = list(csv.reader(open('data/tpw-collective-impact.csv', newline='')))
k = collections.defaultdict(list)
for i, r in enumerate(rows[1:], start=2):
    if any(c.strip() for c in r[:10]): k[(r[0], r[1], r[2], r[3], r[5], r[6])].append(i)
for key, v in k.items():
    if len(v) > 1: print(v, key[0][:30], key[3][:24], key[4], '->', key[5])
PY

# 4. the xlsx: 13 columns, column K is =H*J under a shared formula to row 104
python3 - <<'PY'
import zipfile, re
x = zipfile.ZipFile('data/tpw-collective-impact-form.xlsx').read('xl/worksheets/sheet1.xml').decode()
print(re.search(r'<c r="K2"[^>]*>.*?</c>', x, re.S).group(0))
print(re.search(r'<c r="L2"[^>]*>.*?</c>', x, re.S).group(0))
PY

# 5. glossary field list
textutil -convert txt -stdout "docs/TPW Data Glossary Instructions.docx" | head -60

# 6. RFA §15 (research) and §16 (reporting)
pdftotext -layout "docs/RIGHT 4.0 RFA.pdf" - | sed -n '/^16. REPORTING/,/^17. CLOSING/p'
```

### External figures cited above, and where they came from

| Figure | Value | Source (fetched 2026-10-24) |
|---|---|---|
| Statewide releases, 12 mo to 2026-09-30 | 26,812 | `data.ca.gov/dataset/monthly-admissions-and-releases`, CSV `monthlyreleases2014-20260930.csv` |
| In-custody / parole population, 2026-10-21 | 87,437 / 32,829 | TPOP1, `cdcr.ca.gov/research/population-reports-2/` (PDF `Tpop1d261021.pdf`) |
| Per-facility populations (ASP 3,863 · CTF 4,121 · SATF 5,244 · SQ 2,209 · CCI 2,331 …) | — | same TPOP1, institution detail page |
| CRC closed | 2026-10-01 | note on the same TPOP1 |
| 3-yr conviction: no CBP achievement | 40.6% (n = 27,328) | Rehabilitative Program Achievements FY 2020-21 briefing, p. 5 Table 4 |
| 3-yr conviction: EDU / CTE / CBP achievements | 22.4% / 24.4% / 28.6% | same, p. 3 Table 1 |
| SB601 rehabilitative fields | 13 `FieldName` values, CDCR-run programmes only | `sb601_data_2024_06.xlsx` from `data.ca.gov/dataset/sb601-reporting` |
| ROC schedule + contact + 2026 priorities | quarterly; `Data.Requests@cdcr.ca.gov` | `cdcr.ca.gov/research/research-requests/` |

Power calculations are two-proportion, two-sided α = .05, 80% power, baseline 40.6%; the per-facility
release-flow numbers are releases × population share and are estimates, not published per-institution
counts. Everything else is a direct count from the two local files.

### Two corrections to existing repo prose

- `README.md` says "Seven organizations' worth of rows are in there already." The snapshot has
  **three** (Defy, GRIP, Enneagram).
- `README.md` cites "one cycle whose end date (3/26/2026) is far past its start (11/1/2024)" as the
  odd date. There are three worse ones — rows 25/26/27 at 551 days. Row 3 is 510.

Not modified here, per instruction; flagged for whoever edits the README next.
