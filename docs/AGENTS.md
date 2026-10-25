# docs/AGENTS.md

Signpost for the `docs/` folder. For the rest of the repo, see `../AGENTS.md`.

This folder holds two kinds of thing: **source documents** that came from TPW, CDCR or the hackathon, and **our write-ups** about them. Treat the sources as read-only. If you learn something new about a source, write it up in a new or existing markdown file, and don't edit the source itself.

## Start here

| If you need to know… | Read |
|---|---|
| Quick answers about TPW, what it wants from us, and our data | `faq.md` |
| What each field on TPW's current form means, and the submission rules | `TPW Data Glossary Instructions.docx` |
| What TPW's current Google Form actually asks, question by question | `tpw-google-form.md` |
| What the state grant requires grantees to report | `RIGHT 4.0 RFA.pdf`, sections 15 (research) and 16 (reporting) |
| What public data exists, and what doesn't | `public-data-sources.md` |
| What TPW says about itself publicly | `tpw-website-text/` |
| **How TPW talks** about people in prison, programs and its mission, and which words to use or avoid (read before writing any text members or TPW will see) | `tpw-language.md` |
| What each screen of the app looks like, step by step (made-up data) | `staff-guide-screenshots/` |
| **What must be fixed before real members use the app** (Sheet privacy, real sign-in, test data) | `after-the-demo.md` |
| What the hackathon organisers told teams | `kickoff-briefing.md` |
| What a filled grant application looks like | `right-4.0-application-example.md` |

## Files

### Source documents (don't edit)

| File | What it is | How to read it |
|---|---|---|
| `TPW Data Glossary Instructions.docx` | TPW's field-by-field definitions and submission rules for its Collective Impact form (June 2026). The intake schema in `data/intake/schema.json` is built from it. **Read this before changing the form.** | Word file. Convert to text first, e.g. `pandoc -t plain "TPW Data Glossary Instructions.docx"`. |
| `RIGHT 4.0 RFA.pdf` | CDCR's request for applications for the RIGHT 4.0 grant: $19.4M for community-based programs in prisons, applications due 30 November 2026. Reporting is process-only (spending, participants, populations). Outcomes research needs an independent third party and CDCR approval. | PDF. Attachment A (the institution grid) is on page 30 of the PDF. |
| `right-4.0-rfa-dummy-filled.pdf` | The same RFA packet with every state form filled in for one **fictional** organization. | PDF. Explained in `right-4.0-application-example.md`. |
| `hsi-hack-pack-2026.html` | Saved copy of the hackathon's Notion page (schedule, judging, submission rules). | Mostly JavaScript, so it reads poorly as raw text. Open it in a browser, or read the summary in `kickoff-briefing.md`. Large file (about 4.5 MB). |
| `img/right-4.0-attachment-a-filled.png` | Image of the filled Attachment A grid from the dummy application. | Used by `right-4.0-application-example.md`. |
| `img/tpw-hierarchy-infographic.png` (and `.svg`) | One-page graphic of the vocabulary: CDCR → institution (also called a facility) → yard, where programmes run, which partner runs them, and why the form is refilled once per programme per yard. Placements in it are made up. | Open the PNG. The SVG is the editable original. |

### Our write-ups (edit and extend)

| File | What it is |
|---|---|
| `after-the-demo.md` | Checklist of the hackathon shortcuts to undo before any member files real numbers: keep the Google Sheet private and TPW-owned, move sign-in to TPW's own, stop unsigned filings, remove demo and test data, make the prefill read real filings, combined figures only in public, move hosting to TPW. Each item says what's true now and what to do. | Before hand-off, and before anyone talks to TPW about going live |
| `tpw-language.md` | How TPW talks: its mission in its own terms, the words it uses (and doesn't) for people in prison, participants, members and programs, its tone, American spelling, and a checklist for new text. Read from TPW's website, one-pager and Data Glossary on 25 October 2026. There is no official TPW style guide, so it ends with what to confirm with TPW. |
| `faq.md` | Questions and answers about TPW, the challenge, the data and the numbers to handle with care, each with its source. Includes what TPW staff told us in person on 24 October 2026, and the questions still to ask TPW. |
| `tpw-google-form.md` | TPW's current Google Form ("TPW - Collective Impact Data"), rebuilt question by question from screenshots of a screen recording, because we don't have the form's own link. One submission covers one program at one yard at one prison. |
| `public-data-sources.md` | Every public source we checked, verified 24 October 2026. Short version: *who runs what, where* is public; *how many people, how many hours* is not public for anyone. Includes dead ends, so nobody re-checks them, and how the public data joins to TPW's form. |
| `other-ways-to-get-the-data.md` | Every route we found to programme names, participants, hours and completions that doesn't rely on members filling in a form: grant reports members already send CDCR (55 members held a RIGHT 2.0 grant, listed at the end), records CDCR holds, phone calls and voice notes, and sampling. Written 24 October 2026. |
| `crob-2024-credit-groups.md` | A 2024 state list of every credit-earning group at 32 prisons. It exists, but we decided on 24 October 2026 it's too old to use, and no newer version will come. Read before anyone suggests pre-filling from it. |
| `kickoff-briefing.md` | What the hackathon pack and the kickoff video actually contain, including the video transcript, and what that implies for what we build. |
| `right-4.0-application-example.md` | Page-by-page guide to the dummy filled application, and what's still missing from it. |
| `chatgpt-skills-for-tpw-staff.md` | Candidate ChatGPT skills Ken or other TPW staff could install for day-to-day work around the data tool (data requests, briefs, checking submissions, member questions), with what each needs, what was left out and why, and what to settle first. Working draft, 25 October 2026. Nothing built yet. |

### `tpw-website-text/`

A plain-text markdown copy of every page on <https://www.thetpw.org/>, 38 pages in all. Use it to quote or check what TPW says publicly without loading HTML.

- **Where it came from:** converted with pandoc from the offline HTML mirror in `../site/` on 24 October 2026. It is a snapshot, so check the live site before quoting anything as current.
- **What's left out:** images, and the video on the Our Story page.
- **File names** follow the page's web address, with `/` replaced by `-`. The homepage is `home.md`. Each file starts with the page's title and live web address. `tpw-website-text/README.md` lists every file.
- **Pages worth reading first:** `home.md`, `ourstory.md`, `ourwork.md`, `our-members.md`, `our-team.md`, `cdcr.md`, `member-portal-1.md`.
- **Duplicates to ignore:** `home-1.md` is a second, near-identical version of the homepage that TPW's site still serves. The six `member-portal-blog-the-tpw-has-a-new-name*.md` files are near-copies of one blog post on TPW's site.
- **Numbers on TPW's site don't all agree** with each other or with other sources. For example, the homepage repeats one funding sentence under two different headline figures. Check any figure against its original source before using it.

## Adding to this folder

- Put new source documents here under a clear name, and add a row to the right table above.
- If a source is binary (PDF, Word, HTML that needs JavaScript), also write a short markdown summary so the next agent doesn't have to parse it.
- Never add anything that identifies a program participant. This repo is public.
