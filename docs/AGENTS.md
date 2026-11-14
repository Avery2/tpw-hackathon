# docs/AGENTS.md

Signpost for the `docs/` folder. For the rest of the repository, see `../AGENTS.md`.

## Start here

| If you need to know… | Read |
|---|---|
| How the whole system works: website, Apps Script, Google Sheet, hosting, tests | `technical-guide.md` |
| What must change before real members submit real numbers | `go-live-checklist.md` |
| What each field on TPW's form means, and the submission rules | `TPW Data Glossary Instructions.docx` |
| What TPW's earlier Google Form asked, question by question | `tpw-google-form.md` |
| What each screen of the tool looks like, step by step (made-up data) | `staff-guide-screenshots/` |
| How prisons, facilities and yards relate | `img/tpw-hierarchy-infographic.png` |

## Files

| File | What it is |
|---|---|
| `technical-guide.md` | How every part works and fits together, with the Google Apps Script back end in detail: its files, settings, requests and replies, the Sheet's columns, setting up a fresh copy, deploying changes, limits, sign-in, hosting and testing. |
| `go-live-checklist.md` | The steps between today's prototype and real member data, in order: TPW's own accounts, real sign-in, closing the open dashboard feed, removing demo data, keeping public figures combined. |
| `TPW Data Glossary Instructions.docx` | TPW's field-by-field definitions and submission rules for its Collective Impact form (June 2026). The Sheet's columns A to M follow it. Read it before changing the form. Convert it to text with, for example, `pandoc -t plain "TPW Data Glossary Instructions.docx"`. |
| `tpw-google-form.md` | TPW's earlier Google Form ("TPW - Collective Impact Data"), question by question. One submission covered one program at one yard at one prison, which is the repetition the new form removes. |
| `TPW Collective Impact Report 2026.pdf` | A report built from TPW's earlier Collective Impact sheet. It names member organizations, so see the go-live checklist, item 6. |
| `RIGHT 4.0 RFA.pdf` | CDCR's request for applications for the RIGHT 4.0 grant. Its reporting requirements (spending, participants, populations served) are the same kind of numbers this tool collects. |
| `public-data-sources.md` | What the state publishes about which providers run which programs at which prisons, and how it was turned into the files in `../data/public/`. |
| `img/tpw-hierarchy-infographic.png` (and `.svg`) | One-page graphic: CDCR → prison (also called a facility) → yard, where programs run. The placements in it are made up. |
| `staff-guide-screenshots/` | Screenshots of each screen, from the demo with made-up data. |

## Adding to this folder

- Give new documents a clear name and add a row to the table above.
- For a binary document (PDF, Word), also write a short Markdown summary, so an agent doesn't have to parse it.
- Never add anything that identifies a program participant.
