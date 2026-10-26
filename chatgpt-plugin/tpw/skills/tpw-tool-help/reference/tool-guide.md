# TPW's data collection tool: the guide

This is the guide to the data collection tool built for Transformative Programming Works (TPW) at Hack for Social Impact 2026 (24 and 25 October 2026). It is written for TPW staff, who don't need any technical knowledge to use the tool. It describes the tool as it was on 25 October 2026. Anything in [square brackets] is still to be filled in by TPW.

## 1. What the tool does

TPW asks its members for four things about their programs: the program's name, how many participants started, the course hours, and how many participants completed. The tool collects them in three steps:

1. **A member submits.** On a web page called Log data, the member enters its facilities, yards and programs, and the numbers for this quarter.
2. **A script checks it.** A script is a short piece of code that runs inside Google. It checks every number, tells the member about any mistake straight away, and saves good submissions.
3. **TPW reads the Sheet.** Every submission is saved in one Google Sheet, one row per program per yard. Only the people the Sheet is shared with can open it.

The old Google Form needed a separate submission for every program at every yard at every facility. With this form, a member with 3 programs at 4 yards submits once, not 12 times.

The form never asks for participants' names, CDCR numbers or birth dates. TPW staff asked for counts only, with demographics perhaps later.

## 2. The pages

The pages sit inside a copy of TPW's own website, with TPW's header and menu.

| Page | What it shows | Who sees it |
| --- | --- | --- |
| Log data | The form members fill in (the "Quarterly totals" tab, titled "Quarterly report") | Everyone |
| Dashboard | Totals, a chart of participants over time, and credit-day estimates | Signed-in accounts. Signed out, it asks you to sign in |
| Programs | Every program, with its latest numbers | Signed-in accounts |
| Submissions | For TPW staff: who has and hasn't submitted for each of the last two finished quarters. For a member: its own submissions | Signed-in accounts |
| Organizations | One card per organization: programs, facilities, participants | TPW staff view only |
| Data | The real Google Sheet, shown inside the website | TPW staff view only, and Google still asks for a Google account the Sheet is shared with |
| Annual report | A PDF report | Signed-in accounts |

**Members Login** opens a copy of TPW's own sign-in box. Today it is a demo: no password is asked for or checked, and one click picks Org 1, Org 2 or TPW staff. See section 8.

## 3. How a member submits

1. Open **Log data**. (On the demo site, choose Members Login first and pick an account.)
2. **Name the organization.** As the member types, TPW's member names appear as suggestions. Picking one keeps each member's numbers under one name. If the name isn't listed, the member types it in full.
3. **Choose the facilities and yards** the member works in. Facilities come from TPW's own list of 31 CDCR facilities. Yards come from a general list, and a member can add a yard that isn't listed.
4. **Add each program:** its name, the facilities and yards where it runs, its status (In Progress or Completed), its start and end dates, and its course hours per participant.
5. **For each yard**, enter the participants who started and the participants who completed. Notes are optional, up to 2,000 characters, and must not include names.
6. **Finish and submit.** Nothing is saved until a receipt appears. The receipt shows how many rows were saved and a **reference code**, eight letters and numbers like 56F98641. Members should keep it.

**The quarter is set for them** from today's date in California. Members can't choose it. Numbers for July to September sent in October are labeled Q4.

**Next quarter, the form remembers.** When the form knows which organization is submitting, it starts from that organization's last report: facilities, yards, program names and course hours are filled in, and the member only enters this quarter's status, dates and numbers. Participants and completions always start at 0. Every carried-over program is marked "Review for this quarter", and the form won't submit until each one is reviewed. "Start blank instead" gives an empty form. Today this only works for the demo accounts, because the form only knows who is submitting once real sign-in is on.

**The form checks** that:

- every program has a name, a status, and a facility and yard;
- dates are real, and the end isn't before the start;
- course hours are a number from 0 to 5,000;
- participants are whole numbers;
- completions aren't more than participants at any yard.

If something is wrong, it says which program and yard, and why. It doesn't catch everything: see section 6.

## 4. Where everything lives

| Piece | What it is | Today | TPW's own |
| --- | --- | --- | --- |
| The website | The pages members use | The hackathon demo site, https://www.averychan.site/tpw-hackathon/ (Log data is at /intake/simple.html) | [FILL IN: web address] |
| The quarterly script | Checks and saves each submission | A hackathon demo Google account | [FILL IN: TPW Google account] |
| A second script | Takes two older forms that Log data no longer shows | A hackathon demo Google account | [FILL IN: TPW Google account] |
| The Google Sheet | Where every submission is saved: "TPW guided form submissions (App Script)" | A hackathon team member's Google account | [FILL IN: link to the Sheet] |
| The code | The folder of everything, kept on GitHub | github.com/Avery2/tpw-hackathon | [FILL IN: TPW GitHub address] |

Everything marked "today" needs to move into accounts TPW owns before real members use it (section 12).

## 5. The Google Sheet

### The tabs

- **Submissions; comes from website form DO NOT RENAME.** The main tab: every quarterly submission, one row per program per yard per facility. Never rename it: the scripts find it by its exact name. (If you download the Sheet as an Excel file, Excel shortens the tab's name to "Submissions; comes from website". That's normal.)
- **Aggregates.** A summary page a teammate built by hand, with totals from the other tabs. It says it includes demo records.
- **Session records.** Left over from a form that was removed on 25 October 2026. Nothing writes to it.
- **Dashboard copy.** Left over from an earlier test. Nothing writes to it.

### The main tab's columns

| Column | What it holds |
| --- | --- |
| CDCR Facility | The facility (prison), by its full name |
| Yard | The yard within the facility |
| Organization Name | The member organization, as it was typed or picked on the form |
| Program Name | The program |
| Schedule Status | In Progress or Completed |
| Start Date, End Date | The program's first and last session |
| Total Programming hours | Course hours per participant: the hours one person would get by attending every session. TPW's Data Glossary proposes renaming it "Course Hours (per Participant)" |
| Number of Participants | Participants who started at this yard |
| Number of Participants Completed | Participants who completed at this yard |
| CALC: Total Participant Programming hours | Completions times course hours, worked out for you |
| CALC: Program Year | The year the program started, worked out for you |
| Notes | The member's optional notes |
| Submission ID | The reference code from the member's receipt. Rows with the same code came from one submission |
| Submitted At | When it arrived, in UTC (7 or 8 hours ahead of California) |
| Submitted By | The member's email, once sign-in is on. Blank today |
| Sign-in Checked | "No" means the member wasn't signed in, which is every row today |
| Reporting Quarter | The quarter, like "2026 Q4" |
| Additional data (JSON) | A copy of each submission in a form the website's code reads. Leave it alone |
| Test data | "Yes" marks made-up rows from the hackathon. Delete them before real use |

### Finding a submission

Search the Sheet (Cmd+F on a Mac, Ctrl+F on Windows) for the reference code on the member's receipt. All the rows with that code are that one submission.

### Adding things up yourself

Don't type, sort or work in the main tab. Choose File, then Make a copy, and work in the copy. Or ask ChatGPT for this quarter's numbers: the TPW skills read the Sheet and add it up the same way the Dashboard does.

## 6. Reading the numbers

### The Dashboard

- **Programs, Facilities, Submissions.** Programs counts each program once, using its latest submission from any quarter. Facilities counts the different facilities those programs run in. Submissions counts every submission, including the sample ones.
- **Participants over time.** The total participants each day, where a program's latest numbers replace its earlier ones. Someone in two programs counts twice.
- **Credit days participants could have earned (upper limit).** CDCR gives Rehabilitative Achievement Credits of 10 days off a sentence for every 52 hours of approved programming, up to 40 days a year (https://www.cdcr.ca.gov/proposition57/). The Dashboard works out, for each completion, 10 days per 52 course hours, at most 40, and adds them up. It assumes every program is approved for credit at its facility and every completion earns credit, so the real number is probably lower.
- **Facility costs avoided, if every credit day were applied (upper limit).** Credit days times $59 a day: the Legislative Analyst's Office marginal cost of a prison place, $21,534 a year, divided by 365.
- **Sample data.** The Dashboard adds sample numbers for two made-up organizations, Org 1 and Org 2. They come from the website, not the Sheet. Sheet rows marked Yes under Test data are badged as samples too. Don't quote the Dashboard's numbers until real members have submitted and the test rows are gone.

### Things the form can't catch

- A member who submits again on a blank form creates the same program twice, and both are counted.
- A program can be marked Completed with an end date still to come.
- Numbers for an earlier quarter get the quarter they were sent in.
- A member can type its name differently from the member list, which splits its numbers.

The "check the submissions" skill finds all of these.

## 7. Fixing a wrong submission

A second submission adds new rows. It doesn't replace the first. So:

1. Ask the member to submit again with the right numbers.
2. In a separate tab, never the main one, list the old submission's reference code as "ignore".
3. When you add things up, skip every reference code on that list.

Don't edit rows in the main tab: it is TPW's record of what members sent. The one exception is personal information: if a name, CDCR number or birth date turns up in a note, delete it from the note and tell the member. This "ignore" tab is the hackathon team's suggestion, not a rule. A developer could add a proper way to replace a submission.

## 8. Sign-in

**Today:** a demo of TPW's sign-in box. No password is asked for or checked, and one click picks Org 1, Org 2 or TPW staff. The page address alone decides which organization you are, and anyone can submit under any organization's name. So only made-up data should go in for now.

**Planned (built, tested, switched off):** a member types their email and gets a 6-digit code, good for 10 minutes. TPW would keep a Members tab with four columns: Email (or @domain, for everyone at one organization), Organization, Active and Notes. To add a member, add a row. To remove one, mark it not active. A technical person needs to turn it on, then switch off the setting that lets anyone submit without signing in.

The longer-term idea is for members to use TPW's existing member sign-in on thetpw.org, so they don't need a second login. That needs a technical person to link TPW's website and the Sheet.

## 9. Keeping members and participants safe

- **Share the Sheet with named people only.** Anyone who can open it sees every organization's numbers. Never use "anyone with the link".
- **No names or CDCR numbers.** Not in the form, the notes or the Sheet.
- **Report combined numbers.** Members may fear retaliation from CDCR. When sharing results outside TPW, add members together and don't show any one organization's numbers.
- **Real numbers wait for three fixes.** Today the Dashboard's data feed answers anyone who knows its address, sign-in is a demo, and the demo site's annual report PDF names two members side by side. Until those are fixed, use made-up data only.

## 10. When something goes wrong

Nothing alerts anyone when something breaks. Members who keep seeing an error are told to email membership@thetpw.org, so that inbox is where TPW hears first. Opening the Sheet once a week also shows whether new rows have stopped.

| What you notice | What to do |
| --- | --- |
| A member sees an error when they press Submit | Their answers stay on the page. Ask them to wait a minute and press Submit again. Submitting again is usually safe: the same submission is recognized for about 6 hours. If it still fails, send your technical person a screenshot and the time |
| The form says "The sheet is busy. Please try again in a minute." | Exactly that: wait a minute and submit again |
| The form says it "Could not confirm the Sheet write" | The save may or may not have worked. Search the Sheet for the member's rows before they submit again, so it isn't saved twice |
| The form says completed is more than participants | The member has typed a higher number for completed than for started at that yard. The message says which yard |
| The form won't submit and says to review each program | Carried-over programs from last quarter each need opening and finishing for this quarter |
| A member says they submitted, but you can't find it | Ask for the reference code and search the Sheet for it. If it isn't there after five minutes, send the code and the time to your technical person |
| A page won't load or looks broken | Refresh, or try another browser. If it's still broken, tell your technical person which page, which device and what you see |
| Submissions stopped arriving for everyone | Check the Google account that owns the scripts is still active and can open the Sheet. The Dashboard stops loading too. If you can't tell, call your technical person straight away |
| A tab was renamed, deleted or changed | In Google Sheets choose File, then Version history, then See version history, and restore the last copy that looked right. The main tab's name must stay exactly as it is |
| The same quarter shows up twice for a member | A second submission adds rows. See section 7 |
| Someone submitted as the wrong organization | While sign-in is off, anyone can type any name. Note the reference code and ignore that submission (section 7) |
| A member can't sign in (once sign-in is on) | Check their email is on the Members tab and the row is active. Codes last 10 minutes. They can ask for a new one after a minute |

### Six things never to do

1. Rename or delete the main tab. The scripts find it by its exact name.
2. Rename the headings in row 1. The scripts find each column by its heading.
3. Type or paste in the main tab. Make a copy and work in that.
4. Enter names or CDCR numbers, anywhere.
5. Share the Sheet with "anyone with the link". Add named people, and never share a password.
6. Close the Google account that owns the scripts, or remove its access to the Sheet. Everything stops.

## 11. Who to call

Your technical person: [FILL IN: name, email, phone]. Backup: [FILL IN: name and email]. Questions about how it was built: [FILL IN: hackathon team contact].

Tell them:

- what you saw, with a screenshot if you can;
- when it happened: date, time and time zone;
- which organization, and the reference code;
- which page, and which device or browser;
- what you already tried.

### Asking for a change

Say what you want in plain words and who it's for. Say how you'll know it works ("a member can …"). Say what must not change: no names, no CDCR numbers, and the Sheet's columns. Ask them to try it on a copy first and show you a test submission in the Sheet.

### Finding a technical person

Look for someone comfortable with JavaScript and Google Workspace (the scripts are Google Apps Script) who is willing to read a small amount of code. It's fine if they use an AI coding assistant. Try members and the board, volunteer tech groups that help nonprofits, or a freelance Google Workspace consultant. Give them this guide and the code on GitHub, and add them as an editor on the Sheet and scripts. Never share a password.

## 12. What's left before real members use it

As of 25 October 2026 the tool runs on hackathon demo accounts with sign-in off.

1. Take the annual report PDF and TPW's real data files out of the public code and its history. (A technical person, first.)
2. Move the Sheet and both scripts into TPW's Google account, and share the Sheet with named people only. (TPW and a technical person.)
3. Put the Dashboard and its data feed behind sign-in, or remove them. (TPW decides, a technical person does it.)
4. Turn on real sign-in, then turn off the setting that lets anyone submit. (A technical person.)
5. Delete the rows marked Yes under Test data, and the sample organizations. (TPW.)
6. Agree the yard list, which is general today, with members able to add their own. (TPW and a technical person.)
7. Put Log data on TPW's own website. (A technical person.)

## 13. Words

| Word | What it means here |
| --- | --- |
| Submission | One time a member submits its quarterly numbers |
| Reference code | The 8-character code on a member's receipt, like 56F98641. It's in the Submission ID column |
| Workbook, tab | The Google Sheets file is the workbook. The pages along its bottom edge are tabs |
| Script | A short piece of code that runs inside Google and checks and saves submissions. Technical people call it an Apps Script |
| Facility | A prison. The form says facility, as TPW's own data form does |
| Yard | A part of a facility, like "North" or "A Yard" |
| Quarter | The reporting period, like 2026 Q4, set from today's date in California |
| Course hours | The hours one participant gets by attending every session of a program |
| Participant hours | Course hours times completions |
| Repository (repo) | The folder of all the code, kept on GitHub |
| Test data | Made-up rows from the hackathon, marked Yes in the Test data column |
| Sample data | Made-up numbers for Org 1 and Org 2 that the website adds to the Dashboard |

## 14. Questions TPW staff may ask

**Can members see each other's numbers?** Not on purpose. A member signed in sees only its own. But while sign-in is a demo, anyone can pick any account, and the Dashboard's data feed is open. That's why only made-up data should go in for now.

**Why does a member's July to September report say Q4?** The form labels a submission with the quarter it was sent in. If the numbers are for the quarter before, count them there when you add things up.

**Why are the Dashboard's numbers different from mine?** The Dashboard adds sample organizations and test rows, counts each program's latest numbers from any quarter, counts a program twice if a member submits it again on a blank form, and counts someone in two programs twice. The "this quarter's numbers" skill counts one quarter (or a year) without test rows, and counts each run of a program once.

**Can a member correct a mistake?** They submit again with the right numbers, and TPW ignores the old reference code (section 7).

**How do I add a new member to the name suggestions?** The suggestions come from a member list kept with the code (the file data/public/tpw-members.csv). Ask your technical person to add the name. The member can still type its name in full meanwhile.

**Can we add a facility or a yard?** Members can add a yard on the form. A new facility needs a technical person, because the scripts check facilities against their own list.

**Can we ask for more, like demographics?** Yes, later. The form was built so fields can be added. It needs a technical person, and both the form and the Sheet get the new column.

**Does the form collect anything about reoffending?** No. TPW staff said that is further down the road, and the form collects no names or CDCR numbers that could link to it.

**Is the data backed up?** Google keeps the Sheet's version history (File, then Version history). A downloaded copy now and then is a sensible extra.

**What does "Sign-in Checked: No" mean?** The member wasn't signed in. Every row says No today, because sign-in is a demo.

## 15. What ChatGPT can do with the Sheet

TPW has four other ChatGPT skills that read the Sheet (they never change it):

- **Who hasn't submitted:** the members with no submission this quarter or last quarter.
- **This quarter's numbers:** members' combined numbers for a quarter or a year, counted the same way as the Dashboard.
- **Check the submissions:** problems the form can't catch, with what to ask the member.
- **A member's own numbers:** a half-page summary a member can use with its funders.

This help skill can also look up one submission by the reference code on a member's receipt: who sent it, when, and every row it added.
