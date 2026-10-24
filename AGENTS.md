# AGENTS.md

Signpost for AI agents working in this repo. Read this first, then `README.md` for the full design write-up.

## What this repo is

The team repo for **Transformative Programming Works (TPW)** at Hack for Social Impact 2026. TPW is a coalition of about 120 community-based organizations (CBOs) that run rehabilitation programs inside California state prisons.

The hackathon brief: TPW can only track *process* data (who enrolled, how many hours). Join that to parole and recidivism data so TPW can track *impact*.

What we've built is a static site with no server. It has a form-intake system that stores every submission as a file in this repo ("git is the database"), an impact view on top, and a printable report prototype. It is hosted on GitHub Pages at <https://www.averychan.site/tpw-hackathon/>.

## Read these first

1. `README.md`: problem statement, the intake design, the join spine, how to run everything, honest limits.
2. `docs/AGENTS.md`: what every source document is and when to read it.
3. `NOTES-data-recon.md`: deep profile of the real Collective Impact data, its quality problems, three ways to do the join, a schema proposal and open questions for TPW.
4. `docs/TPW Data Glossary Instructions.docx`: TPW's own field definitions for its current form. The intake schema is built from it.

## Map

| Path | What it is | Edit it? |
|---|---|---|
| `index.html` | Landing page for the hackathon: the gap, what we're building, source links. Served at the site root. | Yes |
| `assets/` | Fonts and images for `index.html`. | Rarely |
| `intake/` | The forms. `index.html` is the full cycle intake (hash routes like `#/submit`, `#/orgs`, `#/impact`, `#/guide`). `simple.html` holds the three quick forms (weekly, totals, follow-up). Plain JS modules in `intake/js/`, no build step. | Yes |
| `intake/js/views/` | One file per screen: form, guide, impact, ledger, orgs. | Yes |
| `data/intake/schema.json` | **Single source of truth** for the cycle form. The browser (`intake/js/schema.js`) and CI (`scripts/intake_validate.py`) both read it. Change the contract here, not in either reader. | Yes, carefully |
| `data/intake/simple_forms.json` | Same idea for the three quick forms. | Yes, carefully |
| `data/intake/facilities.json`, `config.json` | Facility list and site config the forms read. | Yes |
| `data/intake/seed.json` | The 2026 Collective Impact sheet imported as cycles, with problems flagged, not fixed. | No: rebuild with `intake_build_seed.py` |
| `data/intake/demo/join.json` | **Synthetic** participant spine and outcomes, for the demo only. Says so in its own first lines. | No: rebuild with `intake_build_seed.py` |
| `data/intake/cycles/`, `data/intake/records/` | Submitted cycles and quick-form records, one JSON file each, plus an `index.json` manifest the site reads. | No: written by the form, the CI workflow or the scripts |
| `data/intake/orgs/index.json` | Organization registry, derived from the ledger. | No: rebuild with `intake_profiles.py` |
| `data/intake/example/` | Example cycle file. | Yes |
| `data/public/` | Public data layer: CDCR programs by prison, RIGHT 4.0 Attachment A grid, a facility-name crosswalk, the TPW member list. `raw/` caches the source page. | No: rebuild with `build_public_data.py` |
| `data/tpw-collective-impact.csv` | The real TPW form data (Data Entry Sheet tab) as CSV. Input to the seed and the report. | Only when re-pulling the live sheet |
| `data/tpw-collective-impact-form.xlsx`, `data/snapshots/` | Dated snapshots of TPW's live Google Sheet. | No: add a new dated snapshot instead |
| `scripts/` | Python, standard library only. Seed builder, validators, issue ingester, reindexer, registry builder, public-data builder. Each file's docstring explains it. | Yes |
| `report/build.py` | Builds a print-ready "Collective Impact Report 2026" HTML and PDF from the CSV. Needs headless Chrome for the PDF. Working files go in `report/work/`, which is gitignored. | Yes |
| `report/assets/` | TPW logos and preview images for the report. | Rarely |
| `docs/` | Source documents from TPW, CDCR and the hackathon, plus our write-ups. See `docs/AGENTS.md`. | Add, don't rewrite sources |
| `site/` | Offline mirror of thetpw.org (HTML plus all assets). Linked from `index.html`. | No: it's a copy of TPW's site. For the text, read `docs/tpw-website-text/` |
| `.github/workflows/intake.yml` | The "server": turns a labelled GitHub issue into a validated cycle commit, and re-validates and re-indexes on every push to `main` that touches `data/intake/`. | Carefully |
| `NOTES-data-recon.md` | Analysis notes (see above). | Yes |

## Rules

- **No personal data, ever.** This repo is public. Never commit participant names, CDCR numbers, dates of birth or anything else that identifies a person. The join uses an HMAC token made in the browser from an organization key. The key never leaves the browser and must never be committed.
- **Keep synthetic and real apart.** The participant spine and outcomes in `data/intake/demo/join.json` are made up. The activity figures from the Collective Impact sheet are real. Label synthetic numbers wherever they appear, and never present them as evidence of impact.
- **Protect member organizations.** Members may fear retaliation from CDCR. Anything aimed at TPW or the public that shows numbers should show combined figures, not one organization's, unless TPW says otherwise. Cohorts under five are aggregated before release, per `schema.json`.
- **Don't hand-edit derived files.** Manifests, the registry, the seed and the public CSVs are all rebuilt by scripts. Fix the input or the script, then rebuild.
- **Pull before you push.** The CI workflow commits to `main` as `tpw-intake-bot` after pushes that touch `data/intake/`, and teammates are pushing during the hackathon.
- **Keep it buildless and dependency-free.** No npm, no bundler, no third-party Python packages. TPW staff have to be able to keep this running after the hackathon.
- **Check numbers before they reach TPW or the judges.** Some headline figures disagree between sources. `NOTES-data-recon.md` lists the known problems in the data.

## Commands

```bash
python3 -m http.server 8080                 # from the repo root, then open http://localhost:8080/intake/
python3 scripts/intake_reindex.py           # validate everything, rebuild manifests and registry (what CI runs)
python3 scripts/intake_validate.py          # validate every committed cycle
python3 scripts/intake_build_seed.py        # rebuild seed.json and the synthetic spine from the CSV
python3 scripts/intake_profiles.py          # rebuild the organization registry
python3 scripts/build_public_data.py        # re-fetch and rebuild data/public/
python3 report/build.py                     # build the report HTML and PDF
```

## Outside the repo

- TPW's live Collective Impact Google Sheet and the hackathon pack are linked in the Resources table in `README.md`.
- Judging: impact 30%, live demo 35%, innovation 20%, storytelling 15%. Devpost deadline is 3pm on Sunday 25 October 2026.
