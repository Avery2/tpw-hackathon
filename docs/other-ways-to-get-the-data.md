# Other ways to get the data, without members filling in a form

Written 24 October 2026. TPW staff told us in person on 24 October 2026 that the first version needs four things: programme name, number of participants, hours of programming and number who completed. We also need the prison each programme runs in. This note lists every route we found to those numbers that doesn't rely on a member filling in TPW's form. `public-data-sources.md` covers public data in depth, so this note only points to it.

The short answer: for about half of TPW's members, programme names, prisons and participant counts probably already exist in reports they send CDCR every year for their state grant. Hours can be worked out from programme schedules members have already written down. Nobody outside a member's own records counts completions, so that number still has to be asked for, but it doesn't have to be asked for with a form.

## Reports members already write for someone else

1. **RIGHT grant yearly reports.** This is the main new finding in this note. CDCR's [list of RIGHT 2.0 grant holders](https://www.cdcr.ca.gov/rehabilitation/rehabilitative-investment-grants-for-healing-and-transformation-right-2-0-recipients) has 103 organisations. 55 of the 125 organisations on TPW's member list are on it, plus 4 more probable matches (we matched names by hand, see the list at the end). RIGHT 2.0 paid out $20.37 million for programmes running from 25 May 2024 to 1 December 2026 ([grant listing](https://www.grants.ca.gov/?p=46400)). Under the RIGHT 4.0 rules (`RIGHT 4.0 RFA.pdf`, section 16a), every grant holder sends CDCR a yearly report covering the prisons where the money was spent, the number of participants and the populations served. So for roughly half the membership, participants by prison already exist in a document the member wrote. Members could forward a copy to TPW instead of filling anything in. The report has no hours or completions. We have only read the RIGHT 4.0 rules, not the 2.0 rules. [PLACEHOLDER: CONFIRM RIGHT 2.0 HAD THE SAME YEARLY REPORT, AND GET A BLANK COPY OF THE REPORT TEMPLATE FROM A MEMBER GRANT HOLDER]

2. **RIGHT 4.0 applications, due 30 November 2026.** Members are writing these now. Each application includes a programme summary of up to two pages, which must give the prisons, the programme's schedule (how often it meets) and its current capacity (RFA section 10n). The schedule is a start on hours, though it may not give session or course length. Capacity is not the same as participants, so it can't stand in for them. Avery's `intake/upload.html` already reads application packets in the browser. If TPW offers members help with their RIGHT 4.0 applications this month, it could keep the programme facts at the same time.

3. **Innovative Programming Grant progress reports.** Holders of CDCR's other grant send CDCR participant data, waitlists and spending three times a year ([2025 to 2028 grant rules](https://www.cdcr.ca.gov/rehabilitation/wp-content/uploads/sites/173/2024/12/IPG-RFA-2025-2028-Final-20241102.pdf), pages 6 and 7). 14 TPW members hold one of the [2025 to 2028 grants](https://www.cdcr.ca.gov/rehabilitation/innovative-programming-grant-ipg-2025%e2%80%912028-awards/).

4. **Funder reports and annual reports.** TPW staff told us that being able to say what you have actually done, not what you hope to do, is often what gets a member funded. Members who report to foundations have probably already written their participant numbers down somewhere. A member could upload any report, an AI model could pull out the four numbers, and the member would check them. This would need a hosted AI model, which `PLAN-document-upload.md` chose not to use because the repo is public and the reports are private. So it would need a decision on where the reports go.

## Records CDCR already holds

5. **Yearly totals from the RIGHT reports, from CDCR.** TPW staff told us TPW sponsored the RIGHT grant in the legislature. Asking CDCR to publish yearly totals from the RIGHT reports (participants by prison and programme) would give the numbers for every grant holder with no work from members. A Public Records Act request is the formal route. We haven't checked what CDCR would release or how long it would take. Either way TPW's Executive Director would need to agree, because members fear pushback from CDCR.

6. **Attendance counts from CDCR's records system.** CDCR staff enter hours at credit-earning groups so people can earn sentence-reduction credit. Counts by prison and group, with no names, would cover participants and hours for every credit-earning programme. That CDCR stores this per group is our inference from a [San Quentin News article (2016)](https://sanquentinnews.com/soms-overhauls-chronos-and-certificates-for-groups/) and the credit rule ([Title 15 §3043.4(g)](https://www.law.cornell.edu/regulations/california/15-CCR-3043.4)), not confirmed. The routes in are CDCR's Office of Community Partnerships or a Public Records Act request, and both need the same agreement as item 5.

7. **Each prison's yearly list of approved credit-earning activities.** State rules make every warden publish one each year ([Title 15 §3043.4(f)](https://www.law.cornell.edu/regulations/california/15-CCR-3043.4)). It gives who runs what at each prison, not numbers.

## Asking members, but not with a form

8. **A short phone call, with TPW staff typing.** TPW staff told us most members are a few people, many aren't comfortable with computers, and form requests get lost in email. A ten-minute call per member, with TPW staff or volunteers entering the numbers, avoids all three problems. At 125 members that is roughly 20 hours of calls per round. That is our rough sum, not tested.

9. **A voice note or text message.** The member sends something like "two groups at Solano, 15 started, 12 finished, two hours a week for 12 weeks". An AI model turns it into rows, and the member replies to confirm. This suits members who use a phone but not a computer. It also sends their message to an AI provider, so TPW would need to say so up front.

10. **A photo of the sign-in sheet.** Avery has built this (`intake/sheet.html` and `intake/scan.html`). It only works if facilitators can take paper out of the prison and use a phone, which we haven't checked. CDCR's own sign-in sheets carry names and CDCR numbers, so members should count from those and not send them.

## Not asking everyone

11. **Get full numbers from a chosen set of members, then scale up.** For lobbying, TPW needs a total it can defend. That doesn't need a number from every member. TPW could collect full numbers from 30 to 40 members chosen to look like the whole membership (by size, programme type and region, from the team's TPW Information sheet), then estimate the rest. Any total built this way must be labelled as an estimate.

## What we'd do

12. **For the demo,** show that 55 members hold a RIGHT grant, so they probably already report participants by prison to CDCR every year, and offer "forward us what you sent CDCR" next to the form.

13. **For the smallest members,** who are least likely to hold a grant, use the phone call or the voice note. They are also the members least likely to fill in any form.

14. **Ask TPW's Executive Director** whether TPW would ask CDCR for yearly RIGHT totals. That one request could cover half the membership.

## Members on CDCR's RIGHT 2.0 list

Matched by hand on 24 October 2026 against `data/public/tpw-members.csv`. Where CDCR uses a different name, it is in brackets.

**55 matches:** 10P Program, Alliance for California Traditional Arts, Alternatives to Violence California, Awareness Into Domestic Abuse, Back To The Start, Beyond Us & Them, California Reentry Institute, Center For Gender & Justice, Center For Restorative Justice Works, Choices For Freedom, Compassion Prison Project, Creating Restorative Opportunities And Programs, Creative Acts, Defy Ventures, Enneagram Prison Project, Envisioning Justice Solutions, Getting Out by Going In, Give A Beat, Guiding Rage Into Power (GRIP Training Institute), Healing Dialogue and Action, Healing Rhythms, Infinite Pawsabilities, Jail Guitar Doors, Just Detention International, Kid C.A.T., Land Together (Insight Garden Program), Marin Shakespeare Company, Mass Liberation, No More Tears, Pathway to Kinship, Paws For Life K9 Rescue, Peacemakers' Alliance, Playwrights Project, Prison Education Project (Transcendence Children & Family Services), Prison From-TheInside-Out, Prison to Employment Connection, Prison Yoga & Meditation, Prison Yoga Project, Project Paint (Project Paint: The Prison Arts Initiative), Project Rebound at Fresno State (California State University, Fresno Foundation), ReEvolution, Red Ladder Theatre Company, Safer Communities Project, Success Stories, Ten Toes In, The Catalyst Foundation, The Freedom To Choose Project, The Last Mile (Turn 2 U Inc), The Lionheart Foundation, The Mend Collaborative, The Place for Grace, The Roots and Wings Project, Theatre Workers Project, Tia Chucha's Centro Cultural & Bookstore, William James Association Prison Arts project.

**4 probable matches:** Empathy In Action (its website is the Transformative Justice Center's, which is on the list), Freedom Within Prison Project (Freedom Within Project), Inside Circle (Inside-Outside Circle Foundation), Project Rebound at San Diego State (San Diego State University).
