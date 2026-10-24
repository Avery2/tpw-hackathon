# FAQ: TPW, the challenge and the data

Last updated October 24, 2026.

Each answer says where it comes from. "TPW staff" means what TPW's staff told us in person at the hackathon on October 24, 2026.

## About TPW

### What is TPW?

Transformative Programming Works (TPW) is a coalition of about 120 community-based organizations that run rehabilitation programs inside California's state prisons. TPW doesn't run programs itself. It works like a trade association or a union: it speaks for its members to CDCR (the California Department of Corrections and Rehabilitation), the legislature, the governor's office and funders. TPW staff told us it started in 2014 with about eight groups.

### Who are its members?

Separate nonprofits, mostly 501(c)(3) organizations, some fiscally sponsored. To join, an organization has to run programs inside prisons. TPW doesn't cover reentry (support after release). Programs include mindfulness, art, dog training and victim-offender dialogue, and between them members reach every prison in California, men's and women's (TPW staff).

Most members are very small. TPW staff described them as often just a few people, many of them formerly incarcerated, family of people in prison, or from the communities affected, and often not comfortable with computers. A few, such as Defy Ventures, are much bigger and better funded.

### How many members are there?

It depends on the source. The problem statement and TPW staff say 120. The member list on TPW's website has 125 ([our copy](tpw-website-text/our-members.md)). The team's research sheet has 127. TPW's 2026 one-pager says "100+". Say "about 120" and name your source.

### How big is TPW's staff?

Four people: an Executive Director, and Advocacy, Operations and Membership Directors ([team page](tpw-website-text/our-team.md)). TPW also has a lobbyist. Whatever we build, these four people have to be able to run it without us.

### How is TPW funded?

By foundations, individual donors and member dues. Dues are voluntary, because some members have very little money. TPW takes no government money, so that it never depends on the state it lobbies (TPW staff).

### What is the RIGHT grant?

The Rehabilitative Investment Grant for Healing and Transformation: state money for community-based programs in prisons, split among the organizations that qualify. TPW sponsored it in the legislature and takes none of the money itself (TPW staff).

The current round, RIGHT 4.0, is $19.4 million, with applications due November 30, 2026. Grantees report only process data (spending, the prison, number of participants and populations served). Outcomes research needs an independent third party plus approval from CDCR's Office of Research. See the [request for applications](RIGHT%204.0%20RFA.pdf) and [our guide to a filled-in application](right-4.0-application-example.md).

## The challenge

### What problem are we solving?

There are two versions. The hackathon brief asks us to join TPW's process data (who enrolled, how many hours) to parole and recidivism data, so TPW can track impact. When we met TPW staff, they put an earlier job first: get members to send simple numbers at all. The two fit together, because you can't link outcomes to data most members never send.

### Why don't members send TPW their data?

On a really good day, about a quarter of members respond (TPW staff). The reasons we've heard:

- Most members are tiny and short of time.
- Many don't track participant numbers or hours at all, and some keep them only on paper.
- Past requests asked members to put the data together themselves and send it in.
- The current form needs a separate submission for every program at every yard at every prison (see [the form](tpw-google-form.md)).
- Requests arrive by email and through TPW's listserv (an email list), and get lost among everything else.
- Nothing is required. TPW wants members to take part because it's worth it to them.

### What does TPW want the first version to collect?

Four things per program: the program's name, how many people took part, how many hours of programming it ran, and how many people completed it. Demographics (race, age and so on) can come later, but the form should be built so that adding them is easy (TPW staff).

### Does TPW want participants' names or CDCR numbers?

No. TPW staff said they only need counts, such as "12 participants". They don't need to know who those people are. Participants are wary of sharing their CDCR numbers, and CDCR guards person-level data closely. This repo's own rule is the same: never commit anything that identifies a person.

So anything we build that collects data about individual people, even as codes, goes beyond what TPW asked for in its first version. Keep it optional, and present it as a later step.

### What about recidivism and outcomes?

TPW sees outcomes as a later step. TPW staff said that collecting recidivism data would mean either becoming the government or tracking individual people after release. TPW wants to do neither. A few larger members, such as Defy Ventures, pay for background checks on their own graduates. Most members can't afford to.

For the ways outcomes could be linked later, see "Honest limits" in the [README](../README.md) and the three options in [NOTES-data-recon.md](../NOTES-data-recon.md).

### What would members get back for sending data?

Numbers they can use with their own funders: how many people they served and how many hours of programming they ran. TPW staff told us that showing what you've done, rather than what you hope to do, is often what wins funding.

### How often does TPW ask for data?

There's no set rhythm yet. TPW staff said it has been hit or miss, because so few members respond.

### What tools does TPW already use?

A Google Form, "TPW - Collective Impact Data", and the Google Sheet behind it. TPW reaches members by email and through its listserv. TPW staff said simple Google Forms have had much better response rates for other requests, and they expect members would use one if its fields were already laid out for them.

### Would it help if only some members responded?

Yes, if we can show how typical they are. We asked TPW whether it would help their lobbying to show that, say, 40 respondents are broadly like all 120 members, and to see which kinds of organization aren't responding. TPW said it could. They still hope a simple enough form will get almost everyone.

## The data

### What does the current form ask?

Ten questions. One submission covers one run of one program at one yard of one prison. See [tpw-google-form.md](tpw-google-form.md) for every question, and TPW's own field definitions in [TPW Data Glossary Instructions.docx](TPW%20Data%20Glossary%20Instructions.docx).

### What real data do we have?

A snapshot of TPW's Collective Impact sheet, in `data/tpw-collective-impact.csv`. It has 103 records, but 66 are empty spreadsheet rows, which leaves 37 real rows from three organizations ([NOTES-data-recon.md](../NOTES-data-recon.md)). One organization has 20 rows for a single program, across 13 prison-and-yard combinations.

### Is any of the data made up?

Yes. The participation sample TPW gave teams (1,200 participants across three organizations) is synthetic. So are the participant codes and outcomes in `data/intake/demo/join.json`, which drive the impact view. The activity numbers from the Collective Impact sheet are real. Never present synthetic numbers as evidence of impact.

### What's already public about who runs what, where?

Who runs what, where is public. How many people and how many hours is not public for anyone ([public-data-sources.md](public-data-sources.md)).

CDCR's [In Prison Programs Available by Location](https://www.cdcr.ca.gov/rehabilitation/inprison/mapip/) page lists grant-funded providers by prison, as of January 1, 2026. 36 of its 64 providers are TPW members. The California Rehabilitation Oversight Board's [2024 annual report](https://crob.ca.gov/wp-content/uploads/2024/10/2024-C-ROB-Annual-Report.pdf), Appendix D, lists the groups approved to award sentence-reduction credit at 32 prisons as of June 2024, including volunteer-run groups. The board's website no longer loads, so use the copy on the Internet Archive. Neither list has yards, dates or participant counts.

## Numbers to handle with care

### What recidivism figures can we quote?

TPW's headline numbers come from CDCR's [recidivism report on people released in 2018-19](https://www.cdcr.ca.gov/research/wp-content/uploads/sites/174/2024/02/Statewide-Recidivism-Report-for-Individuals-Released-in-Fiscal-Year-2018-19.pdf), published in February 2024. [TPW's own summary of it](tpw-website-text/member-portal-blog-blog-post-title-one-dcwrn.md) gives these rates:

- 21.1% for people in programs eligible for Rehabilitative Achievement Credits
- 26.1% for people who earned Educational Merit Credits
- 39.2% for people in any form of programming
- 45.6% for people with no enhanced credit earnings

CDCR's main measure is conviction within three years of release ([public-data-sources.md](public-data-sources.md)). Other materials round the comparison group to 44% or 45%, so quote the exact figure, the group and the report each time. The 21.1% group is defined by which credits a program can award. Who runs the program doesn't come into it, so check before presenting it as a figure for TPW members' programs.

The comparison is also observational. People who choose a program and finish it were probably less likely to reoffend to begin with. Treat the gap as a reason to look closer. It doesn't prove the programs caused it.

### How much of CDCR's budget goes to rehabilitation?

Sources disagree. The problem statement says "under one percent". TPW's 2026 one-pager (a draft) says "less than 0.1%". Don't quote either until TPW confirms which is right.

### How do sentence-reduction credits work?

Under [Title 15, section 3043.4](https://regulations.justia.com/states/california/title-15/division-3/chapter-1/article-3-3/section-3043-4) of California's prison rules, a person earns 10 days of Rehabilitative Achievement Credit for every 52 hours of approved programming, up to 40 days in any 12 months. It only counts for programs approved to award credit at that prison, and only for people who complete. Credits can also be taken away for rule violations. So from TPW's data we can estimate the credit days participants could have earned. That is an upper limit on the days taken off sentences. The Justia copy is marked current to September 2024, so check the official text before quoting.

## Still to ask TPW

1. Does the first version still need one row per yard and prison, or is one row per program enough? TPW staff listed program name, participants, hours and completions, and didn't mention prisons or yards. If one row per program is enough, most of the repetition goes away.
2. By "hours", do they mean hours per week, or total course hours per participant? The credit estimate needs total hours.
3. When TPW's form says "facility", does it mean the whole prison, or one of the lettered sub-units (Facility A, B, C) inside the bigger prisons?
4. Who at TPW will own the new form?
5. Which programs are approved to award credits at which prisons?
6. Are the members who don't respond mostly the smallest ones? If so, totals from the quarter who do respond will lean towards bigger organizations.
7. Did members ever use the Google Form? The sheet's Form Responses tab holds a single test submission, and the 37 real rows were typed in by hand ([NOTES-data-recon.md](../NOTES-data-recon.md)).
