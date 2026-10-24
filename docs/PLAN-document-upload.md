# Reading an application packet instead of asking again

**What this is.** `intake/upload.html` takes a member organization's RIGHT 4.0
application packet and fills the ledger from it: legal name, who signs, what the
program is, which institutions and populations it serves, and which grant round
the packet answers. The contract lives in `data/intake/documents.json`, the
parsing in `intake/js/extract.js`, the validator in `scripts/intake_documents.py`.

**Why.** An applying organization answers the same twenty questions four or five
times, on forms it already signed: STD 204, STD 205, the supplement vendor form,
OBS 1000, OBS 1500, OBS 1510, the CCC, Attachment A, plus the program summary.
Then TPW asks for most of them again, in `intake/simple.html`, and the
organization types its own legal name a sixth time — differently, and now the
registry has two organizations. The packet is the answer sheet. Reading it back
is cheaper than asking, and the ledger then agrees with what CDCR was told.

## The two decisions everything else follows from

**Nothing is uploaded.** The repository is public and these are a member
organization's tax forms, budgets and insurance certificates. They are read with
pdf.js in the page and dropped; what gets filed is a record of facts, roughly
sixty lines of JSON. That is also why the parsing is deterministic and not a
model call: a hosted model would mean posting the packet somewhere.

**Read the printed page, not the field names.** Acrobat's auto-generated field
names on the state's forms are wrong often enough to be dangerous — on the
STD 204 (Rev. 03/2021) the names sit one label above their boxes, so the field
called `BUSINESS NAME…` holds the legal name and `Text8` holds the street
address. So the extractor uses positions and printed captions, and the name map
in `documents.json` is a *shortcut* for revisions we have seen, never the only
path. Every value carries the document and the method that produced it.

## What can be read, document by document

| Document | Facts | Method | Trust |
|---|---|---|---|
| RFA cover pages | funding period, application deadline, round | printed text | exact; one source |
| IRS determination letter | legal name, 501(c)(3) status | header text, `501(c)(3)` | medium; the name needs a human eye |
| Fiscal sponsor agreement | whether a sponsor is used, sponsor name | printed text | low; shape varies wildly |
| Two budget PDFs | which of three budget bands | printed amounts | band only; figures deliberately not kept |
| STD 204 | legal name, DBA, street/city/state/ZIP, entity type, payee email, signatory name/title/email/phone/date | AcroForm fields, name map | high |
| STD 205 | legal name, DBA, signatory, up to two extra contacts and their phone/email | AcroForm fields | high |
| Supplement vendor form | legal name, DBA, physical address, website, DGS non-profit number, sales and accounting contacts, one-line service description | AcroForm fields | high |
| OBS 1000 | solicitation, vendor ID, business name, phone, address, **contract description of purchase**, signature date | AcroForm fields | high |
| OBS 1500 | company name, "no operations outside the US", bid/agreement number, signatory + title, date, county | AcroForm fields | high |
| OBS 1510 | firm name, signatory + title, date, county and state | AcroForm fields | high |
| Contractor certification clauses | firm name, signatory + title, date, county | AcroForm fields | high; nine pages, one signature page |
| Certificate of insurance | general liability limit, whether CDCR is the certificate holder, workers' comp | printed text | medium; ACORD layouts vary |
| Workers' comp exemption | that the form exists (=> check whether a certificate is owed instead) | presence | n/a |
| Secretary of State record | active status, entity name | printed text, if any | low; usually a screenshot |
| Program summary | delivery mode, capacity, frequency, non-English languages, institutions named in prose | pattern match | low; this one is for a human to read |
| Attachment A | institution × population grid, language column, underserved flag | **position, not text order** | high when the applicant typed the ticks |

Measured against the dummy packet in `Downloads` (a complete one, filled):
**10 documents recognised over 30 pages, all 30 pages accounted for, 31 facts
filled, 3 institutions read from the grid, 6 required documents correctly
reported missing.** Two facts were wrong in a way worth keeping in the record:
the packet prints the same county two ways (`Sacramento` and `Sacramento County,
California`), and the page says so rather than picking one.

## The facts worth having, and where they land

Every parsed fact maps onto something the ledger already models:

- **Organization** → the registry entry (`data/intake/orgs/index.json`), which is
  derived from cycles. A profile is allowed to create an organization with no
  cycles yet — that is exactly the applicant case — and to fill blanks, but never
  to overwrite what a signed cycle reported.
- **Signatory and contacts** → the registry's `contact`, so the next submission
  is addressed to somebody real.
- **Program and institutions** → a program with zero cycles and its sites. This
  is what makes the Organizations page useful to an organization that has never
  reported: the packet already says which program it intends to run and where,
  so the report form can be pre-filled from it.
- **Attachment A** → `sites[].populations`, the join spine. `program × facility ×
  population` is the unit the whole project joins on.
- **Grant round** → dates and solicitation, which is how a RIGHT 4.0 application
  becomes a *planned* cycle instead of a blank page.
- **Points** → §9 of the RFA: budget band (1–3) plus at most one extra point for
  underserved institutions, special populations, and non-English delivery,
  capped at 4. Computed on the page so an organization can see what its packet is
  worth before it submits, and to show what a missing budget PDF costs.

## What this refuses to keep

A profile record can only contain fields listed in `documents.json`, and
`scripts/intake_documents.py` fails the build on anything else. On top of that:

- **FEIN / EIN / SSN / TIN.** Read in the browser, one reason only: to check the
  packet is internally consistent (the same nine digits should appear on six
  forms). The output is `fein_documents: 2, fein_consistent: true`. The number is
  never written, and a record containing one — under any key — fails CI.
- **Street address and phone** are read but marked `privacy: "local"`: they stay
  in the page and the record lists them under `withheld`, because the ledger has
  no use for them and the repository is public.
- **Budget figures.** Only the band is derived. A member organization's annual
  budget should not sit in a public git history, and it is not needed: §9 asks
  which of three bands it falls in.
- **Signatures.** Never copied. Their presence is what is recorded.
- **Scans with no text layer.** Nothing is guessed at. The page says the document
  could not be read and asks the person to tick the grid or type the field.

## Attachment A, and the two kinds of X

The nicest problem in the packet. The state prints a lowercase `x` in every
population column an institution does **not** house, and the applicant later
types a tick in the columns it does. In the dummy packet, reading every `x` as a
selection claims a program in sixteen prisons; the true answer is three.

Three signals separate them, in order of strength:

1. **Font.** The applicant's ticks are set in a different font from the table's
   own body text. This is the primary rule.
2. **The public grid.** `data/public/cdcr-attachment-a-institutions.csv` already
   says which institutions house which populations. A mark in the table's font,
   in a cell the public grid says "does not house", is the legend.
3. **Column geometry.** Columns are located from the header row of the page
   being read, not from constants, because the state re-typesets this table
   between rounds.

For a grid that is read anyway, the ticks are cross-checked against the public
grid, and a printed mark where the public grid says the institution *does* house
that population is reported as a discrepancy for a human, never as a selection.

## What this does not do

- **Scanned packets.** A photographed or scanned form has no text layer. The page
  degrades to "tell us which file this is" and a grid to tick. OCR is a separate
  project and a worse error rate than a human with the page in front of them.
- **The program summary's argument.** Two pages of prose about how the program
  benefits people. We pull the structured bits (delivery, capacity, frequency,
  languages) and show the text; we do not summarise it.
- **Form revisions.** A new revision may rename or move fields. The name map
  stops matching and the caption fallback takes over at lower confidence, with
  the method printed next to the value. Adding a revision is a JSON edit.
- **Fiscal sponsors.** The packet allows a sponsor to sign, hold the money and
  appear on the payee forms. The extractor reads the sponsor's name but does not
  yet model the two-organization case properly.
- **Flattened PDFs.** If a packet was "printed to PDF", its fields are gone.
  Detection falls back to text fingerprints and the result is thinner: dates,
  names and prose, but no exact field values.

## Where the prefill stops

The profile is filed as its own record (`data/intake/records/profile/*.json`),
because a RIGHT 4.0 application is not a cycle: it has no participants, no start
date and no course hours yet. The next step, not done here, is a two-line
addition to the cycle form: read the registry's `profile` block for the chosen
organization and pre-fill organization, program, facility, funding dates and
`status: Planned`. The data is already there and shaped for it; nothing else
needs to be parsed.

## How to extend it

Everything is data. To add a document, or a fact, or a new revision of a form:

1. Add the document to `data/intake/documents.json`: its fingerprints (phrases
   from its own masthead — never a phrase that the RFA narrative also uses), the
   field names on its AcroForm, and/or the text rules.
2. Add any new fact to `fields` with a `privacy` of `commit` or `local`. A fact
   not declared there cannot be filed — `scripts/intake_documents.py` will say so.
3. Re-run the sample:

```bash
python3 -m http.server 8080        # then open http://localhost:8080/intake/upload.html
python3 scripts/intake_documents.py data/intake/example/profile.json
```

`data/intake/example/profile.json` is the record the dummy packet produces. It is
example data, not a member organization: the organization in it does not exist.
