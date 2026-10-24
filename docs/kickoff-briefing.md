# HSI Hack for Social Impact 2026 — what the README links actually contain

Captured 2026-10-24. The Notion page and Loom video are both JavaScript-rendered, so the
raw fetch only yields the header of each. What follows is what we have, and what is still
missing from each.

## Hack pack (Notion) — `docs/hsi-hack-pack-2026.html`

The saved page yields only ~1.3 KB of text; the Notion body below "Day 1: Kickoff and
Ideation" never renders without JS. Extracted:

- Event: Hack for Social Impact — San Francisco, Oct 2026 · **Oct 24–25, 2026** ·
  1885 Mission St, SF · in person
- Status: In progress
- Action items: join the HSI Discord; **register team by 4 PM Oct 24** (up to 5 people);
  **submit by 3 PM Oct 25 — no extensions**; mentors via the `#mentors` Discord channel
- Submission: **via Devpost by 3:00 PM Sunday Oct 25**. Project description required;
  short video demo and public GitHub repo encouraged; **slide deck not required**

Missing from the fetch (needs a screenshot or paste): judging criteria and weights,
Day 1/Day 2 schedule, the `#mentors` channel links, any data-format requirements.

## Kickoff briefing (Loom) — transcript, verbatim

> 0:01 Okay, everybody, so um I'm gonna give you since you can't I don't have access to do
> the form, so I just kinda want to show you what we created so far.
> 0:10 So let's say you're a nonprofit leader, you received this form to fill out, and it
> asks Which CDCR facility that you're in, right?
> 0:20 Let's say they do program at Sentinella Prison or something. What yard is it's on?
> So that's that's for them to because the prisons are divided by yard, organization name,
> program name, schedules, like is it in plan?
> 0:32 And is it in progress or did they complete? When did they start? When did they end?
> The course hours per participant, number of participants, and number of participants
> completed.
> 0:42 But let's just say they ran 12 different programs this year already. They would have
> to fill this form out 12 times.
> 0:48 Times. So, as you see, there's quite a bit of friction. And if they aren't tracking,
> if they're not tracking which prisons that they're doing it at, and or they have multiple
> prisons that they're doing it at, they would have to fill this out multiple times.
> 1:03 So, this is where you kind of See, this could be some of the challenge. Hit me and Ken
> up if you guys have other questions.

What it tells us, in design terms:

1. The form is the artifact being demoed — it is already built and in use, not a spec.
2. Field list is confirmed and matches the sheet exactly (facility, yard, org, program,
   status, start, end, course hours per participant, participants, completed).
3. The named problem is **submission friction, not field design**: one row per program
   cycle per yard means an org running 12 programs fills the form 12 times, and orgs often
   don't track which facilities they're in. So the win is fewer submissions for the same
   data (bulk entry, prefill, or importing from what they already have), not a richer form.
4. The sentence "since you can't, I don't have access to do the form" suggests the
   Collective Impact sheet is behind a permission wall for the presenter — worth confirming
   whether TPW members can actually open it.
