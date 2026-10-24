# What a filled RIGHT 4.0 application looks like

`docs/right-4.0-rfa-dummy-filled.pdf` — the RFA packet with every fillable state form
completed by one fictional organization. This is the only "example submission" we have.
It is a forms template, **not** a program example: there is no Program Summary document in
it, and the Attachment A is ticked but not explained.

## The imaginary applicant

| Field | Value |
|---|---|
| Legal name | Bridges to Restoration |
| DBA | Bridges Restorative Justice Project |
| Address | 2718 Broadway, Suite 400, Sacramento, CA 95817 |
| FEIN | 12-3456789 |
| Signatory | Jordan A. Rivera, Executive Director, jrivera@example.org, (916) 555-0142 |
| Finance contact | Dana M. Whitfield, Finance Manager |
| Signed | /s/ Jordan A. Rivera · 11/12/2026 |
| Status ticks | EXEMPT (nonprofit), CALIFORNIA RESIDENT |
| Remittance | P.O. Box 189023 |

## Which pages are filled (30-page packet)

| Page | Document | State |
|---|---|---|
| 1–12 | RFA narrative (funding, eligibility, requirements, key events) | reference only |
| 13–14 | STD 204 Payee Data Record | **filled** |
| 15–16 | STD 205 Payee Data Record Supplement | **filled** |
| 17–18 | DRP payee/vendor info form | **filled** |
| 19–21 | OBS 1000 (GenAI reporting + factsheet) | **filled** |
| 22 | OBS 1500 (Darfur Contracting Act) | **filled** |
| 23 | OBS 1510 (Civil Rights Laws certification) | **filled** |
| 24–25 | Workers' comp exemption | blank |
| 26–29 | Contractor Certification Clauses (CCC 04/2017) | **filled** |
| 30 | **Attachment A — Institution Locations & Populations** | **ticked** |

## Attachment A as filled in this dummy

Three institutions, which is exactly the maximum-point strategy (2 underserved + special
population + non-English = 3 base points + 1 additional, capped at 4):

| Institution | Populations selected |
|---|---|
| California Correctional Institution (CCI) | GP + **Alt. Language** |
| California Institution for Women (CIW) * | RHU |
| California State Prison, Sacramento (SAC) * | GP |

\* = underserved institution (red font in the template)

Mechanics worth knowing for any intake tool: the template's own marks are **lowercase `x`**
meaning "this location does not house this population type," and the applicant's selections
are **uppercase `X`**. Both end up in the same grid, so a naive text parse of a filled
Attachment A reads the wrong thing.

## What is still missing

The Program Summary (RFA p. 9, items I–VII: institution, benefit to the population,
delivery type, goals/objectives, schedule/frequency, current capacity, space/equipment) is
a separate ≤2-page document the applicant writes and uploads. Nothing in this packet shows
one. Until we get a real one from a member, the substance of "what they do / how many
served / how many hours" stays unmodelled.
