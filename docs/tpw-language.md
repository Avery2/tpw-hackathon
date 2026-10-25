# How TPW talks

TPW (Transformative Programming Works) has a clear way of talking about the people it serves, the programs its members run, and its mission. **Everything we write, in the app, the forms, the dashboard, the docs and the commit messages, should sound like TPW wrote it.** This page says how they talk, so you don't have to guess.

## Where this comes from

Read from TPW's own writing on 25 October 2026:

- TPW's public website, all 39 pages copied to `tpw-website-text/` (a few are duplicates).
- TPW's 2026 one-pager (a draft).
- TPW's Data Glossary (June 2026) and its current Google Form (`tpw-google-form.md`).
- CDCR's RIGHT 4.0 request for applications, for contrast with CDCR's own words.

**We found no official TPW style guide.** The rules below are read from how TPW writes, not handed down by TPW. The counts are "pages out of 39". Section 7 lists what to confirm with TPW.

## 1. The mission, in their terms

- **The belief.** Everyone is capable of being better than their worst moments, and incarcerated people have inherent worth and dignity.
- **The goal.** Everyone living in California prisons should have access to quality community-based programs, ending in decarceration, which they call their north star.
- **The method.** Advocate at the state level for moving money from punitive systems into community-based healing; support and amplify the member organizations; lift up people with lived experience (their Trusted Messengers fellowship).
- **What data is for.** The homepage says TPW is driven by humanity and grounded in data. Here, data is evidence that healing programs work and a way to make members' lives easier. It is never a way to watch people. TPW's one-pager says members may fear retaliation from CDCR, so show combined figures.

## 2. The words

| Talking about | Say this | Don't say | What the evidence shows |
|---|---|---|---|
| People in prison | **incarcerated people**, **people living in California prisons**, **people incarcerated in California state prisons**. "Incarcerated individuals" is also fine | inmate, prisoner, offender, convict, felon, criminal | "Inmate" appears on **0** pages. "Prisoner" appears only inside three member organizations' names (see below). "Offender" appears once, in quotation marks, for a kind of dialogue program. |
| People who have been released | **formerly incarcerated people** (or "folks") | ex-offender, ex-con, "returning citizens" | "Formerly incarcerated" on 6 pages; the other three terms on 0. |
| People with direct experience | **people with lived experience**, **system-impacted** | "justice-involved" | TPW uses "system-impacted" and "lived experience". "Justice-involved" is on 0 pages. |
| People in a program | **participants** | clients, patients, beneficiaries | "Participants" on 8 pages and throughout the Data Glossary. |
| Member groups | **members**, **member organizations**, **CBOs** (community-based organizations). For their link with CDCR: **program providers** | vendors, clients | "CBO" on 14 pages, "program provider" on 9. |
| What members do | **programs**, **programming**, **program cycle** (the Glossary's term for one run of one program) | "inmate programs" | "Programs" is everywhere. "Programme" is on **0** pages (see section 5). |
| Kinds of program | **transformative**, **healing**, **restorative**, **rehabilitative**, **trauma-informed**, **community-based** | | TPW uses all of these, almost interchangeably. |
| The system | **criminal legal system**, **punitive systems**, **decarceration**, **reentry** | "criminal justice system" | "Criminal legal" on 3 pages; "criminal justice" on 0. |
| Outcomes | **recidivism** when citing CDCR's reports; **return to prison** or **reincarceration** in plain speech | | "Recidivism" on 7 pages; "reincarceration" on 2. |
| Places | **prisons** in plain speech; **facility** on the form (the "CDCR Facility" column); **yard** for a part of a prison | | **Institution** is CDCR's word. Keep it when quoting CDCR. |
| TPW itself | **TPW**, or **Transformative Programming Works** | the old name, Transformative In-Prison Workgroup, except as "formerly" | The site says "formerly the Transformative In-Prison Workgroup" in one place. |

### Where the avoided words are fine

Keep the word exactly as it is, because it is a name or a quotation, never our own description of a person:

- **Names of member organizations**: Asian Prisoner Support Committee, California Coalition for Women Prisoners, Legal Services For Prisoners With Children.
- **CDCR report titles, web addresses and data field names.** For example, CDCR's own pages are called "offender-recidivism" and "inmate-activity-groups" in their web addresses.
- **Direct quotes.** TPW itself puts "victim-offender" in quotation marks on its Our Story page.
- **Text TPW reposts from CDCR.** TPW's blog repeats a CDCR memo that says "incarcerated individuals". That is CDCR's voice, not TPW's.

## 3. How TPW sounds

- **Warm and direct.** First person plural: "we", "our members", "together". They address members as colleagues.
- **People first, then numbers.** Headline figures sit next to participants' own words. Where we can, let participants speak for themselves.
- **Strengths, not labels.** Describe a person by what they are doing or becoming, never by their worst act.
- **Plain words.** Short sentences. Explain acronyms the first time (CDCR, CBO, RAC), as TPW does.
- **Verbs.** TPW's Glossary says members **submit** data and **enter** it into the sheet. Our app currently says "Filed with TPW"; prefer "Submitted".

## 4. Names and capitalization

- Capitalize **Rehabilitative Achievement Credits (RAC)** as CDCR does.
- Write **CDCR** without "the".
- Write **TPW**, not "the TPW".
- Participants' IDs are first initial plus birth year (`M78`). Never write a real participant's name anywhere in this repo.

## 5. Spelling: US English

TPW is a California organization and writes American English: **program**, **organization**, **behavior**, **center**. "Programme" is on 0 of 39 pages. When you write for the repo, the app or the docs, use American spelling, even if you usually write British English.

## 6. How we check ourselves (as of `main` at 89052b9)

- **No loaded words in our own writing.** The only hits for inmate, offender, prisoner and similar are inside web addresses and member organization names. Nothing to fix.
- **Wording in the team's form and receiver.** The British spellings ("programme", "behaviour") and "Filed with TPW" were in `team-form/index.html` and `team-form/receiver/Code.gs`. They are fixed on branch `tpw-language-fixes`, which is waiting for Avery's go-ahead before it merges. After it merges, the receipt reads "Submitted to TPW".
- **Yuki's original form** (`form-demo/index.html`) still says numbers are "filed under one name". It's Yuki's, so ask first.
- **British spellings in documentation** (safe to edit): this folder's `other-ways-to-get-the-data.md`, plus `NOTES-data-recon.md` (Avery's notes) and `report/build.py` (Avery's report code).

## 7. To confirm with TPW

1. Does TPW have a style guide or a list of preferred terms? Ask Ken Hartman or the Membership Director.
2. Is "folks" fine in formal reports and on the dashboard, or only on the website?
3. Is "participants" the right word at yard level, or do members say "students" or "group members"?
4. Do they ever want a people-first word other than "incarcerated" in member-facing text?

## Before you add any text

1. Does it call people "incarcerated people", "participants" or "members", never "inmates"?
2. Is the spelling American?
3. Does it use TPW's verbs and names (submit, program, CBO, TPW)?
4. If it shows numbers, are they combined figures, with synthetic data labeled?
5. Not sure? Check this page, then ask TPW. Don't guess.
