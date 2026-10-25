# Before real members submit real numbers

The tool works end to end today, but it was built as a demonstration with made-up data, and it takes shortcuts that aren't safe for real member data. Every item below needs doing before any member submits real numbers.

They're in the order to do them. Each one says what's true now and what to change. [`technical-guide.md`](technical-guide.md) explains the parts named here.

One rule shapes all of them: assume nobody technical will watch the system day to day. So each fix has to keep working on its own, and when something does break, it has to tell a non-technical person in plain words what happened and who to contact.

## 1. Move the Sheet, the script and the website into TPW's own accounts

**Now:** the Google Sheet and the Apps Script that writes to it live in an account from the hackathon, and the website is published from a hackathon team member's GitHub account and web address (averychan.site).

**To do:**

- Make TPW's own Sheet and Apps Script, in a shared TPW Google account rather than one person's (technical guide, section 5.9). Start with a fresh, empty Sheet: every row in today's Sheet is test data.
- Share the Sheet only with named TPW staff. Never use "Anyone with the link": it holds each organization's own numbers, and members may fear retaliation from CDCR if one organization's figures get out.
- Publish the website from a GitHub repository (or other host) TPW controls (technical guide, section 8).
- Check the **Data** page still shows the Sheet only to people it's shared with.

## 2. Build real sign-in

**Now:** "Members Login" is a demo. One click signs you in as Org 1, Org 2 or TPW staff, with no password, and the page address alone decides which organization you are. Changing `org-1` to `org-2` in the address shows and files as Org 2. Pages marked "TPW staff only" just hide their links; the pages themselves are open.

**To do:** finish the emailed-code sign-in that's already designed on the branch `email-code-signin`: a member types their email, gets a 6-digit code, and the script files their rows under the organization TPW has listed for that email, whatever the page says. The technical guide, section 5.8, lists what has to move across and what else changes with it. TPW's Squarespace member login can decide who sees a page, but it can't tell the script which organization someone belongs to, so it can't replace this on its own.

## 3. Close the open dashboard feed

**Now:** the script answers `?view=dashboard` for anyone who asks, with no sign-in, and returns every organization's name, programs and numbers. Its address is in the public website's code (`team-form/backend.js`), so anyone can read the numbers without access to the Sheet.

**To do:** once sign-in works, make the feed return only the signed-in organization's own submissions, and everything only to TPW staff. Until then, don't let real data into the Sheet.

## 4. Stop the Sheet accepting submissions from anyone

**Now:** the script's `ALLOW_UNSIGNED` setting is `true`, so anyone on the internet can add rows under any organization's name.

**To do:** once sign-in works, delete `ALLOW_UNSIGNED` from the script's **Project Settings** → **Script Properties**.

## 5. Take out the demo and test data

- Delete the `TEST_DATA` script setting, so new rows are no longer marked as test data.
- Empty or delete `data/demo/dashboard-sample.json`, the made-up Org 1 and Org 2, and change the dashboards so an organization's view comes from its sign-in instead of that file (technical guide, sections 5.8 and 7.5).
- Remove the one-click demo sign-in (`assets/member-session.js` and the account menu that uses it).
- Replace the sample annual reports in `report/organizations/`.

## 6. Keep anything public to combined figures

Dashboards, reports and anything TPW shares outside should add organizations together, never show one organization's numbers, unless TPW decides otherwise.

**Now:** this repository and the website are public, and some files name real member organizations with their own numbers:

- `report/TPW-Collective-Impact-Report-2026.pdf` and `docs/TPW Collective Impact Report 2026.pdf` name two members and compare their completion rates side by side. The first is linked from the site as the TPW "Annual report".
- `data/tpw-collective-impact.csv`, `data/tpw-collective-impact-form.xlsx` and `data/snapshots/` hold rows from TPW's earlier Collective Impact sheet, by organization.

**To do:** make TPW's copy of the repository private, or take these files out. Taking a file out of a public repository doesn't remove it from the repository's history, so the simplest safe route is to start TPW's repository as a fresh copy of the current files, without the history. Share reports privately, for example as Google Drive files shared only with named staff.

## 7. Decide which quarter a filing belongs to

**Now:** the script labels each filing with the quarter it arrives in (California time). If TPW asks members in October for July to September numbers, those rows are labelled Q4, not Q3.

**To do:** decide which TPW wants, and change the code to match if needed (technical guide, section 5.11). Tell members in the data request which months their numbers should cover.

## 8. Switch off the second Apps Script

**Now:** a second Apps Script (`admin/additional-forms/`, address in `intake/backend.js`) still accepts a follow-up form and an older quarterly form that nothing on the site links to, also without sign-in.

**To do:** unless TPW wants a follow-up form, archive that deployment in its Apps Script project and remove its folder and forms (technical guide, section 5.12).

## 9. Check the contact address and embed it in thetpw.org

- When something goes wrong that a member can't fix, the form tells them to email `membership@thetpw.org`. Confirm that's the right address, or change `TPW_CONTACT_EMAIL` in `team-form/index.html`.
- Show the form on a member page of thetpw.org (technical guide, section 8), and remove the offline copy of thetpw.org (`site/`) once that's done.
