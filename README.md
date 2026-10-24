# TPW × Hack for Social Impact 2026

Working repo for **Transformative Programming Works (TPW)** at [Hack for Social Impact 2026](https://www.thetpw.org/?utm_source=luma).

TPW is a unified voice for the community-based organizations (CBOs) delivering rehabilitative programs inside California state prisons. This repo holds the source material, a local copy of their site, and (soon) our prototype.

---

## The problem statement

> **⚖️ Justice Reform:** California's corrections department spends under one percent of its budget on rehabilitation. Transformative Programming Works advocates for them across 120 organizations, but so far can only track **process data** — such as who enrolled and how long a class ran. **Join disjoint records such as parole and recidivism data into a framework TPW, and nonprofits generally, can use to track impact.**

The crux: TPW can prove *activity* (enrollment, hours, completions). It cannot yet prove *outcomes* (did people stay out of prison?). The outcome data exists — in CDCR, parole, and recidivism datasets — but it lives in separate systems that have never been joined to program participation.

## Resources

| What | Link |
|---|---|
| TPW website | https://www.thetpw.org/ |
| Hackathon pack (schedule, judging, submission) | https://hackforsocialimpact.notion.site/HSI-Hack-Pack-2026-3eb2cb772f1e802890d1d4b7769c311a |
| Kickoff / briefing video | https://www.loom.com/share/32d61ecd9c764a16803ea4701650396d |
| **TPW Collective Impact data form** (Google Sheet, live) | https://docs.google.com/spreadsheets/d/1icSY90fNL_tF94yN9XKP4W-fGxRFbIp9R11__YHHiuM/edit?gid=0#gid=0 |
| CDCR RIGHT 4.0 grant — RFA (PDF) | https://www.cdcr.ca.gov/rehabilitation/wp-content/uploads/sites/173/2026/09/RIGHT-4.0-RFA.pdf |
| CDCR Rehabilitation grants page | https://www.cdcr.ca.gov/rehabilitation/grants/ |
| CDCR grant application (Qualtrics) | https://cdcrca.sjc1.qualtrics.com/jfe/form/SV_4Z8isIprw8f0RL0 |

### Official CDCR facts worth knowing (from RIGHT 4.0 RFA)

- **$19.4M** available to community-based nonprofits for trauma-informed / restorative programming in CDCR institutions.
- Funding period **Jul 1, 2027 – Dec 1, 2029**; applications due **Nov 30, 2026**.
- Eligibility: 501(c)(3) (or fiscally sponsored), plus a record of providing programming in a CDCR institution in **2 of the last 5 years**.
- **Reporting requirement is process-level only.** Annual reports must cover expenditures, the institution funds were used at, *number of participants*, and *populations served* — a template from DRP. Nothing about recidivism.
- Grantees may **not** self-evaluate for external publication; outcomes research needs an independent third party and CDCR Office of Research approval.

That last pair is the gap in the problem statement, in the state's own words.

## Local materials

Bundled so collaborators don't need Downloads access:

- `docs/TPW Data Glossary Instructions.docx` — field-by-field definitions and submission rules for the Collective Impact form (June 2026, Rick Olesek & Kim Moore). **Read this first.**
- `docs/RIGHT 4.0 RFA.pdf` — the state grant that funds these programs, incl. reporting obligations.
- `data/tpw-collective-impact-form.xlsx` — snapshot of the live Google Sheet (3 tabs: Data Entry Sheet, Form Responses, Constants).
- `data/tpw-collective-impact.csv` — the Data Entry Sheet tab as CSV, for quick loading in pandas/Sheets.

### What the form actually captures

One row per **program cycle** = one run of one program at one facility (one row per yard).

| Col | Field | Note |
|---|---|---|
| A | CDCR Facility | standardized names, dropdown reference |
| B | Yard | e.g. North, South, Reception, Ad Seg |
| C | Organization Name | member CBO |
| D | Program Name | specific curriculum |
| E | Schedule Status | Planned / In Progress / Completed |
| F–G | Start / End Date | `MM/DD/YYYY` |
| H | Course Hours (per Participant) | *proposed rename* from "Total Programming Hours" |
| I | Number of Participants | began the cycle |
| J | Number of Participants Completed | finished the cycle |
| K | Funded by RIGHT 2.0 | flagged in the doc as possibly removable |
| L | CALC: Total Participant Hours Delivered | `J × H`, auto |
| M | CALC: Program Year | from start date, auto |
| N | Notes | free-text escape hatch |

Seven organizations' worth of rows are in there already, and the sheet has known warts we should handle in any prototype: `TBD` strings, `#VALUE!` errors when J is unknown, sample rows marked `SAMPLE DATA`, and one cycle whose end date (3/26/2026) is far past its start (11/1/2024).

**No demographic, no individual-identifier, and no outcome field exists.** That is the whole design problem: the join key to parole/recidivism data isn't in this form.

## Repo layout

```
docs/     TPW + CDCR source documents
data/     snapshots of the Collective Impact form
site/     local mirror of thetpw.org (offline copy, for reference and extension)
```

## Status

- [x] Source materials collected and summarized
- [x] `thetpw.org` mirrored locally → `site/`
- [ ] Read the glossary + RFA end to end
- [ ] Decide the prototype: data model for the join, or an impact dashboard for TPW
- [ ] Build + demo

## Local site

`site/` is a static mirror of thetpw.org (all assets local, works offline):

```bash
cd site && python3 -m http.server 8787   # → http://localhost:8787
```
