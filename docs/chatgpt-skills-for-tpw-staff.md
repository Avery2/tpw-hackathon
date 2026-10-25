# ChatGPT skills for TPW staff: candidates

Working draft, 25 October 2026. A list of ChatGPT skills Ken Hartman (or any TPW staff member) could install to make day-to-day TPW work easier, built around the data collection tool from the hackathon. Everything is numbered so it can be cut by number.

**Built on 25 October 2026**, in `chatgpt-plugin/` (see its README): candidate 2 cut down to just the list of members who haven't submitted this quarter or last quarter, candidates 3, 5 and 7, and a fifth skill that answers any question about the tool in plain words. They read the submissions Sheet but not yet TPW Database: the member list comes from `data/public/tpw-members.csv`, the same list the form suggests. None has been tried inside a real ChatGPT account yet.

A ChatGPT skill is a saved folder of instructions, reference files and, if needed, a small script. Once it is installed, ChatGPT uses it on its own whenever a request matches ([OpenAI Help Center](https://help.openai.com/en/articles/20001066-skills-in-chatgpt)). Every skill here reads TPW's live Google Sheets and works from this repository's own code and data, so its answers match what the website shows. Items 17 to 23 explain how.

## Where the skills get their information

**Google Sheets, read live through ChatGPT's Google Drive app:**

- **The submissions Sheet**, "TPW guided form submissions (App Script)". Everything members submit through Log data lands in its tab "Submissions; comes from website form DO NOT RENAME": facility, yard, organization, program, status, dates, course hours, participants, completions, notes, submission ID, submission time, reporting quarter, the program's ID (inside "Additional data (JSON)") and a Test data column.
- **TPW Database**, the team's research sheet. Its "TPW Members" tab has a row per member with organization type, city and county, revenue, paid staff, whether it is volunteer-led or led by formerly incarcerated people, programs, facilities served and a contact email.
- **TPW - Collective Impact Report**, TPW's own earlier sheet, with the rows members submitted before the hackathon and TPW's facility list.

**This repository, copied into the skills:**

- **The Dashboard's counting rules**, rewritten in Python so ChatGPT can run them: how sheet rows become submissions (`team-form/receiver/Dashboard.gs`), "the latest submission for each program wins" (`team-dashboard/js/data.js`), and the credit-day and facility-cost estimates (`team-dashboard/js/rac.js`: 10 days per 52 course hours, up to 40 per completion, $59 a day).
- **The form's own checks**: the limits the receiver enforces (`team-form/receiver/Rows.gs`), how the form picks the reporting quarter (`team-form/js/reporting-period.js`), and the exact error messages members see (`team-form/index.html`).
- **Data**: the facility list (`data/intake/facilities.json`), TPW's public member list (`data/public/tpw-members.csv`), which provider runs which state-funded program at which prison (`data/public/cdcr-grant-programs-by-institution.csv`), and the prisons CDCR lists as underserved (`data/public/cdcr-attachment-a-institutions.csv`).
- **Documents**: TPW's words (`docs/tpw-language.md`), TPW's Data Glossary, the FAQ and its numbers to handle with care (`docs/faq.md`), the RIGHT 4.0 request for applications and our guide to it, and `after-the-demo.md`.

Every skill also follows the same rules: TPW's words, combined figures only and never one member's numbers in anything shared, no names or CDCR numbers, rows marked as test data left out (and counted, so Ken knows how many), and nothing ever written back to a Sheet.

## The candidates

1. **Quarterly data request.** Ken asks: "Write the Q4 data request for the listserv." It drafts the email asking members to submit their quarter's numbers: one line on why it matters, the Log data link, the four numbers needed, the deadline and who to email for help. It also writes the reminder, the last call, and personal nudges. **Reads:** the submissions Sheet, so reminders and nudges go only to members who haven't submitted yet. TPW Database, for each member's contact email. **Why:** TPW staff told us in person on 24 October 2026 that about a quarter of members respond on a good day, that requests get lost in busy inboxes, and that they want members to take part because it is worth it to them.

2. **Who hasn't submitted, and does it matter?** Lists the members who haven't submitted this quarter. Then it compares the members who did with the ones who didn't (size, program type, region, volunteer-led or not), so Ken can say "the members who submitted look like the rest" or see which kinds of member to chase. It also shows which prisons go unreported when a member is missing. **Reads:** the submissions Sheet, TPW Database's "TPW Members" tab, `tpw-members.csv`, `cdcr-grant-programs-by-institution.csv`. **Why:** TPW liked this idea when we raised it on 24 October. The website's Submissions page gives counts, not this comparison. **Limit:** most rows in TPW Database still say "Pending".

3. **This quarter's numbers.** Works out the combined totals with the Dashboard's own rules: programs, facilities, participants, completions, participant hours, the credit-day upper limit and facility costs avoided. It gives back a short table and a paragraph Ken can paste anywhere, for any date range. **Reads:** the submissions Sheet, the Python copy of the Dashboard's rules, the facility list. **Why:** Ken gets ready-to-use text without opening the website. Overlaps with the Dashboard, so it is only worth building if he wants paste-ready text or his own date ranges.

4. **Brief for a legislator, funder or CDCR meeting.** Ken asks: "One page for a budget committee staffer on why RIGHT funding matters." It writes a one-page brief, talking points or a section for a foundation report. It uses TPW's combined numbers from 3, and coverage from the repo's data, for example how many of CDCR's underserved prisons members reach. Built-in rules: combined figures only. CDCR's 21.1% against 45.6% is always quoted with its source, plus the plain caveat that people who choose programs may differ from people who don't. Credit days and costs avoided are always called upper limits. Member stories come from Ken, never invented. **Reads:** the submissions Sheet, `cdcr-attachment-a-institutions.csv`, `cdcr-grant-programs-by-institution.csv`, `faq.md`. **Why:** TPW's case to legislators rests mostly on one CDCR figure plus stories, and the new data lets TPW make its own case.

5. **Check new submissions.** Ken asks: "Check this week's submissions." It lists rows to look at, in plain words, with a draft question to the member for each. It looks for the problems the form can't catch: the same program submitted twice under new IDs, "Completed" with dates still in the future, test rows, organization names that aren't on the member list, July to September numbers filed in October (the form counts everything filed in October as Q4), and big jumps from last quarter. **Reads:** the submissions Sheet, TPW Database, the form's checks and quarter rule, the facility list. **Why:** our checks of the live site and its code on 25 October found the first five get through. Nobody technical will be watching the Sheet day to day.

6. **Member help desk.** Ken pastes in a member's email. If it is a "how do I count this?" question, it answers from TPW's Data Glossary (what counts as a participant, a completion, course hours, a yard). If it is a problem with the website, it matches the member's words to the form's real error messages and explains them. If the member quotes a reference code, it looks the submission up in the Sheet. It drafts the reply in TPW's words. If the fault is on TPW's side, it also drafts the message to TPW's technical contact, with the page, the time, the exact message and the reference code. Where the Glossary is silent (for example, a cohort that runs a whole year), it says so and leaves the answer to Ken. His answer can then be added to the skill. **Reads:** the submissions Sheet, the Glossary, `team-form/index.html`, `faq.md`. **Why:** members are small and often not comfortable with computers, and TPW is four staff.

7. **A member's own numbers for its funders.** Ken asks: "Make Riverbend a summary of what they reported this year." It takes one member's rows and writes a half page that member can use with its own funders: participants, programs, hours of programming delivered and facilities reached, with plain caveats. It goes only to that member. **Reads:** the submissions Sheet (that member's rows only), the Dashboard's rules, the layout of the per-organization reports (`scripts/build_organization_reports.py`). **Why:** this is the "something back" TPW wants members to get. TPW staff told us that showing what you've actually done is often the key to getting funded. The website's per-organization report PDFs exist only for the made-up sample organizations so far.

8. **RIGHT 4.0 questions from members.** Ken asks: "A member wants to know if they can apply for RIGHT 4.0 and what they'd have to report." It answers from the request for applications: who can apply (a 501(c)(3) or fiscally sponsored group that has run programs in a CDCR institution in 2 of the last 5 years), the 30 November 2026 deadline, and what grantees report (spending, the institution, number of participants, populations served). It can show the member its own submitted numbers, which are the same kind RIGHT reporting asks for. That gives members another reason to submit. **Reads:** `RIGHT 4.0 RFA.pdf`, `right-4.0-application-example.md`, `cdcr-attachment-a-institutions.csv`, the submissions Sheet. **Why:** applications close in five weeks, and TPW sponsored the grant. Check first whether TPW wants to advise members on applications at all.

9. **Welcome a new member.** Ken asks: "We've just welcomed Open Gate. Write their welcome." It drafts a welcome email that explains, briefly, how and when to submit numbers and what the member gets back. **Reads:** TPW Database for the contact, the site's Log data link. Small, but it means every new member hears about the data from day one.

10. **Yearly one-pager.** Ken asks: "Draft this year's collective impact one-pager." It drafts the text of a one-pager in the shape of TPW's 2026 one-pager, with the same rules as 4, and compares with earlier years. **Reads:** the submissions Sheet, TPW - Collective Impact Report for the earlier rows, the Dashboard's rules. **Why:** the one-pager is the reporting example TPW gave the hackathon. Overlaps with 4, so it could be one of that skill's options instead.

## Left out on purpose

11. **A separate "TPW voice" checker.** Ken is TPW's voice, so he doesn't need one. The words go into the rules every skill follows instead.

12. **Turning paper sign-in sheets into the four numbers.** Useful for members who keep records on paper, but a photo of a sign-in sheet would put participants' names into ChatGPT. TPW asked for no names.

13. **A skill that submits numbers for members or edits the Sheet.** The website should stay the only way numbers get in, so every number goes through the same checks. ChatGPT editing the Sheet could also rename the tab the form writes to, which would break submissions.

14. **Anything about reoffending or individual people's outcomes.** TPW staff called this "much further down the road" and want no names or CDCR numbers.

## Start with these

15. **Build 1, 4 and 6 first.** 1 goes straight at the low response rate. 4 helps with Ken's main job, speaking for members to the legislature, CDCR and funders. 6 answers the member questions that would otherwise land on Ken's desk.

16. **Add 5 and 3 once real members are submitting.** Until then they would only find test rows.

## How the skills read the Sheets, our code and our data

17. **One TPW plugin, kept in this repository.** A ChatGPT plugin is a bundle of skills plus the connected apps they use ([Plugins in ChatGPT](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt)). Ours would sit in its own folder here, holding the skills and the Google Drive app. A build script would copy in the repository files listed above, the same way `build_additional_forms.py` builds the second receiver's settings, so the skills always carry the current code and data.

18. **Tests keep the skills honest.** The repository's test run would check that the copied files are current, and that the Python version of the Dashboard's rules gives the same numbers as the JavaScript on the sample data. Without that test, a change to the Dashboard could make the skills count differently without anyone noticing.

19. **Sheets come through ChatGPT's Google Drive app.** Ken connects a TPW Google account that can open the three Sheets ([Google Drive app](https://help.openai.com/en/articles/10929079-google-drive-app-and-setup-in-chatgpt)). For sums, the skill asks for the Sheet as a file and runs its script on it, because ChatGPT treats reading a Sheet's text and getting a copy of the file as two separate steps. In ChatGPT's app permissions, set Google Drive to ask before any change, so a skill can never edit a Sheet by accident.

20. **Code and data come from GitHub, synced daily, on Business or Enterprise.** A workspace admin imports the plugin from this repository once. ChatGPT then checks for changes every day, and if an update is broken, it keeps the last version that worked ([importing from GitHub](https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github)). On a personal plan there is no sync: the skills are uploaded by hand and need uploading again after a change to the code. The Sheets are still read live either way.

21. **Never through the website's open data feed.** The skills don't use `?view=dashboard`. `after-the-demo.md` (item 1) says to close it.

22. **Two sign-ins can lapse.** If the Google Drive connection lapses, ChatGPT asks Ken to reconnect the next time a skill needs it, so he'll see it. If the admin's GitHub connection lapses, the daily sync stops without any warning, and the skills keep running on the last version they had. That goes against our rule of no sign-ins that lapse without anyone noticing. We think it is acceptable because nothing breaks, but it should go in the staff guide.

23. **The same files work in Claude.** ChatGPT's GitHub import accepts the Claude plugin format, so one plugin folder could serve both.

## Before any skill reads real numbers

24. **Which plans have skills is unclear.** On 25 October 2026, ChatGPT's [pricing page](https://chatgpt.com/pricing) listed Skills on Free, Go, Plus and Pro. OpenAI's [Help Center](https://help.openai.com/en/articles/20001066-skills-in-chatgpt), updated around 20 October, names only Business, Enterprise, Healthcare and Edu. The daily GitHub sync (20) needs a Business or Enterprise workspace in any case.

25. **Member numbers need care.** Members may fear retaliation from CDCR, so a member's numbers are sensitive even though no person is named. The Google Drive app can open everything the connected account can, so connect an account that holds only TPW's work. On ChatGPT Business, data isn't used for training by default, and Ken could share the plugin with the other three staff. On a personal plan, turn off "Improve the model for everyone" in ChatGPT's data controls. OpenAI says nonprofits can get up to 75% off Business or Enterprise through its sales team ([OpenAI for Nonprofits](https://openai.com/index/introducing-openai-for-nonprofits/), February 2026 update). Check TPW qualifies.

26. **The items in `after-the-demo.md` come first.** The submissions Sheet has to move into a Google account TPW owns, and its test rows have to come out, before the skills can say anything true. TPW Database needs the same move, or at least sharing with TPW. For the daily sync, the repository should move to a GitHub account TPW controls (item 7 of that list).

27. **Skills added to one ChatGPT app don't appear in the other.** Personal skills added in the desktop app and on the web or phone don't sync, so install each in every app it will be used from. Plugins from a workspace may behave differently. Test it.

## Questions for TPW

28. Which ChatGPT plan does TPW use, and who on staff uses it?

29. Which Google account will own the Sheets after the hackathon, and does TPW use Google Workspace? If it does, its Google admin may need to approve ChatGPT's access.

30. Is TPW comfortable letting ChatGPT read members' numbers at all?

31. Does TPW want to answer members' RIGHT 4.0 questions (candidate 8)?

32. Should "hours" mean hours per week or total course hours? This decides how candidate 6 answers members. It is still open in `faq.md`.
