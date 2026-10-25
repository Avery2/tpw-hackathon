# ChatGPT skills for TPW staff: candidates

Working draft, 25 October 2026. A list of ChatGPT skills Ken Hartman (or any TPW staff member) could install to make day-to-day TPW work easier, built around the data collection tool from the hackathon. Nothing here is built yet. Everything is numbered so it can be cut by number.

A ChatGPT skill is a saved folder of instructions, reference files and, if needed, a small script. Once it is installed, ChatGPT uses it on its own whenever a request matches. You install one in ChatGPT under **Plugins**, then the **Skills** tab, then **Create**, then **Upload from your computer** ([OpenAI Help Center](https://help.openai.com/en/articles/20001066-skills-in-chatgpt)).

Every skill below would carry the same short TPW reference file, so they all follow the same rules: TPW's words from `tpw-language.md` (incarcerated people, participants, members, submit, American spelling), combined figures only and never one member's numbers in anything shared, no names or CDCR numbers, the four numbers TPW asks for, the definitions from TPW's Data Glossary, and the facility list.

## The candidates

1. **Quarterly data request.** Ken asks: "Write the Q4 data request for the listserv." It drafts the email asking members to submit their quarter's numbers: one line on why it matters, the Log data link, the four numbers needed, the deadline and who to email for help. It also writes the reminder, the last call, and a short personal nudge to one organization. Needs nothing else, so it works today. Why: TPW staff told us in person on 24 October 2026 that about a quarter of members respond on a good day, that requests get lost in busy inboxes, and that they want members to take part because it is worth it to them.

2. **Who hasn't submitted, and does it matter?** Ken drops in a download of the Sheet and the member list. It lists the members who haven't submitted this quarter. Then it compares the members who did with the ones who didn't (size, program type, region, from the team's member research sheet), so Ken can say "the members who submitted look like the rest" or see which kinds of member to chase. Why: TPW liked this idea when we raised it on 24 October. The website's Submissions page gives counts, not this comparison. Limit: most rows in the research sheet still say "Pending".

3. **This quarter's numbers.** Ken drops in a download of the Sheet. A script in the skill works out the combined totals the same way the website's Dashboard does: programs, facilities, participants, completions, participant hours, the credit-day upper limit and facility costs avoided. It leaves out rows marked as test data and counts an updated program once. It gives back a short table and a paragraph Ken can paste anywhere. Why: Ken gets ready-to-use text and any date range he likes. Overlaps with the Dashboard, so it is only worth building if he wants those two things. The script must copy the Dashboard's rules (`team-dashboard/js/data.js`, `team-dashboard/js/rac.js`), or the two will give different numbers.

4. **Brief for a legislator, funder or CDCR meeting.** Ken asks: "One page for a budget committee staffer on why RIGHT funding matters." It turns TPW's combined numbers and CDCR's published figures into a one-page brief, talking points or a section for a foundation report, with sources. Built-in rules: combined figures only. CDCR's 21.1% against 45.6% is always quoted with its source, plus the plain caveat that people who choose programs may differ from people who don't. Credit days and costs avoided are always called upper limits. Member stories come from Ken, never invented. Why: TPW's case to legislators rests mostly on one CDCR figure plus stories, and the new data lets TPW make its own case.

5. **Check new submissions.** Ken asks: "Check this week's submissions." It reads the Sheet download and lists rows to look at, in plain words, with a draft question to the member for each. It looks for the problems the form can't catch: the same program submitted twice under new reference codes, "Completed" with dates still in the future, test rows, organization names that aren't on the member list, July to September numbers filed in October (the form counts everything filed in October as Q4), and big jumps from last quarter. Why: our checks of the live site and its code on 25 October found the first five get through. Nobody technical will be watching the Sheet day to day.

6. **Member help desk.** Ken pastes in a member's email. If it is a "how do I count this?" question, it answers from TPW's Data Glossary (what counts as a participant, a completion, course hours, a yard). If it is a problem with the website, it explains the error message in plain words. It drafts the reply in TPW's words. If the fault is on TPW's side, it also drafts the message to TPW's technical contact, with the page, the time, the exact message and the reference code. Where the Glossary is silent (for example, a cohort that runs a whole year), it says so and leaves the answer to Ken. His answer can then be added to the skill. Why: members are small and often not comfortable with computers, and TPW is four staff.

7. **A member's own numbers for its funders.** Ken asks: "Make Riverbend a summary of what they reported this year." It takes one member's rows and writes a half page that member can use with its own funders: participants, programs, hours of programming delivered and facilities reached, with plain caveats. It goes only to that member. Why: this is the "something back" TPW wants members to get. TPW staff told us that showing what you've actually done is often the key to getting funded. The website's per-organization report PDFs exist only for the made-up sample organizations so far.

8. **RIGHT 4.0 questions from members.** Ken asks: "A member wants to know if they can apply for RIGHT 4.0 and what they'd have to report." It answers from the request for applications in this folder: who can apply (a 501(c)(3) or fiscally sponsored group that has run programs in a CDCR institution in 2 of the last 5 years), the 30 November 2026 deadline, and what grantees report (spending, the institution, number of participants, populations served). It points out that the quarterly numbers are the same numbers RIGHT reporting asks for, which gives members another reason to submit. Why: applications close in five weeks, and TPW sponsored the grant. Check first whether TPW wants to advise members on applications at all.

9. **Welcome a new member.** Ken asks: "We've just welcomed Open Gate. Write their welcome." It drafts a welcome email that explains, briefly, how and when to submit numbers and what the member gets back. Small, but it means every new member hears about the data from day one.

10. **Yearly one-pager.** Ken asks: "Draft this year's collective impact one-pager." It takes the year's Sheet download and drafts the text of a one-pager in the shape of TPW's 2026 one-pager, with the same rules as 4. Why: the one-pager is the reporting example TPW gave the hackathon. Overlaps with 4, so it could be one of that skill's options instead.

## Left out on purpose

11. **A separate "TPW voice" checker.** Ken is TPW's voice, so he doesn't need one. The words go into the shared reference file inside every skill instead.

12. **Turning paper sign-in sheets into the four numbers.** Useful for members who keep records on paper, but a photo of a sign-in sheet would put participants' names into ChatGPT. TPW asked for no names.

13. **A skill that submits numbers for members or edits the Sheet.** The website should stay the only way numbers get in, so every number goes through the same checks. ChatGPT editing the Sheet could also rename the tab the form writes to, which would break submissions.

14. **Anything about reoffending or individual people's outcomes.** TPW staff called this "much further down the road" and want no names or CDCR numbers.

## Start with these

15. **Build 1, 4 and 6 first.** 1 goes straight at the low response rate. 4 helps with Ken's main job, speaking for members to the legislature, CDCR and funders. 6 answers the member questions that would otherwise land on Ken's desk. None of the three needs real data, so they work today.

16. **Add 5 and 3 once real members are submitting.** Until then they would only read test rows.

## Before any skill reads real numbers

17. **Which plans have skills is unclear.** On 25 October 2026, ChatGPT's [pricing page](https://chatgpt.com/pricing) listed Skills on Free, Go, Plus and Pro. OpenAI's [Help Center](https://help.openai.com/en/articles/20001066-skills-in-chatgpt), updated around 20 October, names only Business, Enterprise, Healthcare and Edu. The quickest check is to look for **Plugins** then **Skills** in Ken's own ChatGPT.

18. **Member numbers need care.** Members may fear retaliation from CDCR, so a member's numbers are sensitive even though no person is named. On a personal plan, turn off "Improve the model for everyone" in ChatGPT's data controls. On ChatGPT Business, data isn't used for training by default, and Ken could share the skills with the other three staff. OpenAI says nonprofits can get up to 75% off Business or Enterprise through its sales team ([OpenAI for Nonprofits](https://openai.com/index/introducing-openai-for-nonprofits/), February 2026 update). Check TPW qualifies.

19. **Getting the data in.** The simplest route is to download the Sheet's tab and drop the file into the chat. Connecting Google Drive to ChatGPT should also work, but we haven't tested it with a skill, and it is one more sign-in that can lapse without anyone noticing. Never build a skill on the website's open data feed (`?view=dashboard`). `after-the-demo.md` (item 1) says to close it.

20. **The items in `after-the-demo.md` come first.** The Sheet has to move into a Google account TPW owns, and the test rows have to come out, before 2, 3, 5, 7 or 10 can say anything true.

21. **Skills added to one ChatGPT app don't appear in the other.** Skills added in the desktop app and on the web or phone don't sync, so install each skill in every app it will be used from.

22. **Keeping them up to date.** Each skill carries its own copy of the shared reference file, so a change to TPW's rules means updating every copy. Fewer skills means fewer copies, which is another reason to start with three.

## Questions for TPW

23. Which ChatGPT plan does TPW use, and who on staff uses it?

24. Is TPW comfortable putting members' numbers into ChatGPT at all?

25. Does TPW want to answer members' RIGHT 4.0 questions (candidate 8)?

26. Should "hours" mean hours per week or total course hours? This decides how candidate 6 answers members. It is still open in `faq.md`.
