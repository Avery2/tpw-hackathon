# Staff guide screenshots

Screenshots of the TPW data collection tool, used in the staff guide for Ken and Quan (a Google Slides deck). They show what a member and a staff person see, step by step.

**Everything on screen is made up.** The form was filled in with "Sample Organization (made-up data)" and "Sample Reading Circle (made-up)". The submit button was intercepted, and so was the dashboard's read of the sheet, so nothing was sent to or read from the real Google Sheet. The reference code (56F98641) is an example copied from the demo rows in the sheet.

Taken on 25 October 2026 from `main` (after the Session tab was removed, Firebase was retired and the dashboards began reading the sheet), with headless Chrome at twice the normal pixel density. The date boxes are shown in US order (mm/dd/yyyy), the way a Californian member's browser draws them.

| File | What it shows |
|---|---|
| `door_signin.png` | Members Login opening a copy of TPW's own sign-in box. On the demo site you pick Org 1, Org 2 or TPW staff, and no password is checked |
| `door_logdata.png` | The Log data page when no one is signed in: the Quarterly totals tab, step 1 of the form |
| `door_checkin.png` | Log data for a sample organization: the form starts from last quarter's report and asks only for this quarter's numbers |
| `form_org.png` | Step 1: the organization's name |
| `form_prisons.png` | Step 2: choosing a prison and its yards |
| `form_prog_a.png` | Step 3: program name, prisons and yards |
| `form_prog_b.png` | Step 3: status, start and end dates, course hours |
| `form_prog_c.png` | Step 3: participants started and completed at each yard, notes |
| `form_next.png` | After a program is added: add another, or finish and submit |
| `form_receipt.png` | The receipt after a successful submission |
| `form_error_numbers.png` | The message when completed is higher than started |
| `form_error_connection.png` | The message when the connection drops on submit |
| `dashboard.png` | The Dashboard page. It reads TPW's Google Sheet plus the made-up sample organizations. For the picture the sheet read was stubbed out, so only the sample organizations show |
| `datapage.png` | The Data page as someone with access sees it: the Google Sheet shown inside the website. Taken while the workbook was still open to anyone with its link; it is private now, so someone signed out sees a Google sign-in prompt instead |
| `sheet_strip_a.png`, `sheet_strip_b.png`, `sheet_strip_c.png` | The main tab's columns A to G, H to M and N to R, first rows. Taken before the sheet gained its Test data column at the far right, and not retaken because the workbook is private now |
| `sheet_tabs.png` | The tabs along the bottom of the workbook |

If the app's screens change, retake these rather than editing them, and keep the data made up.
