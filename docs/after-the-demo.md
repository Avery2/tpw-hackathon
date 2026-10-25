# Things to make sure of after the demo

The hackathon version takes shortcuts that are fine for a demo with made-up data and not fine
for real members. Before any TPW member files real numbers, every item below needs to be done.
Assume nobody technical will be watching the system after hand-off, so each fix has to work
without someone checking on it.

The first two are the ones Richie set on 25 October 2026. The rest came up while building.

## 1. The Google Sheet data stays private

**Now (checked 25 October 2026):** the master Sheet can't be opened by anyone who isn't signed
in and shared on it. It lives in Richie's Google account and is shared with the hackathon team.
The app's **Data** page shows it through Google's preview, so Google decides who can see it.

**After the demo:**

- Move the Sheet into a Google account TPW owns.
- Remove the hackathon team from it. Share it only with named TPW staff.
- Never use "Anyone with the link". The Sheet holds each organization's own numbers, and
  members may fear retaliation from CDCR if one organization's figures get out.
- Check the **Data** page still only shows the Sheet to people it's shared with.

## 2. Sign-in moves over to TPW's own

**Now:** "Members Login" is a demo. One click signs you in as Org 1, Org 2 or the TPW view, with
no password, and the page address alone decides which organization you are. Anyone can change
`org-1` to `org-2` in the address and see or file as Org 2.

**After the demo:** members sign in with TPW's existing member sign-in on thetpw.org, so they
don't need a second login.

One thing to work out with TPW first: as far as we know, TPW's Squarespace sign-in only hides
pages from people who aren't signed in. It can't tell the Google Sheet, in a way the Sheet can
trust, which organization is signed in. So something has to link the two. One option is
already built on branch `email-code-signin`: the member gets a 6-digit code by email, checked
against TPW's member list in the Sheet, and the Sheet files rows under that organization
whatever the page says. It needs porting to the current `team-form/receiver/` files before use.

## 3. The Sheet stops accepting filings from anyone

**Now:** the Google Apps Script that writes to the Sheet runs with `ALLOW_UNSIGNED=true`, so
anyone on the website can add rows under any organization's name.

**After the demo:** once real sign-in works (item 2), set `ALLOW_UNSIGNED` to `false` in the
script's Project Settings → Script Properties, for every Apps Script project the site still
posts to (the quarterly form's, and `admin/additional-forms/` if it is still used).

## 4. Demo and test data come out

- Delete the test rows in the Sheet (the ones marked in its test column).
- Remove the made-up organizations (Org 1, Org 2) and the one-click demo login.

## 5. The prefill reads real filings

**Now:** when a member opens the form, it fills in last quarter's prisons, yards, programs and
course hours from Firebase demo data, not from what members actually filed in the Sheet. A
separate branch (`retire-firebase`) is moving this over.

**After the demo:** check that filing this quarter really does prefill next quarter's form,
and that a member can only ever load their own organization's history (which depends on item 2).

## 6. Anything public shows combined figures only

Dashboards, reports and anything TPW shares outside should add organizations together, never
show one organization's numbers, unless TPW decides otherwise.

## 7. The website moves somewhere TPW controls

**Now:** the site runs on Avery's personal GitHub Pages (averychan.site).

**After the demo:** host the form somewhere TPW owns and can keep running without us, and show
it on thetpw.org (for example in an Embed block on a member page).
