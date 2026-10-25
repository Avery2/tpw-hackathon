# team-form/: the quarterly form

The form members use to submit each quarter's numbers. Members reach it through **Log data** (`intake/simple.html`), which shows it in a frame; on its own it's at `/team-form/`. To run it locally, serve the repository's root folder (`python3 -m http.server 8080`) and open <http://localhost:8080/team-form/>.

| File | What it is |
|---|---|
| `index.html` | The form: HTML, CSS and one JavaScript module |
| `backend.js` | The Google Apps Script web app's address, where submissions go |
| `js/reporting-period.js` | The current quarter, in California time |
| `js/last-quarter.js` | Turns an organization's latest submission into the starting point for this quarter |
| `receiver/` | The Google Apps Script back end (see its README) |
| `test/` | Tests: the back end with Google faked, the quarter logic, the dashboard data, and the form in a real browser |

What the form does, in short:

- One submission covers every program an organization runs this quarter. The back end turns it into one row per program, per prison, per yard in the Google Sheet.
- When it knows which organization is filing (`?account=`), it starts from that organization's last submission: prisons, yards, program names and course hours carry forward; counts, dates and status don't. `?blank=1` starts empty.
- Status is In Progress or Completed. Participants and completions are entered for each yard separately. Optional notes per program, up to 2,000 characters.
- It shows success only after the back end confirms the rows were written, with the row count and a reference. If anything fails, the answers stay on the page for a retry, and a retry can't file the same submission twice.
- With no address in `backend.js`, it saves in the browser only, which is the safe way to try it without writing to the Sheet.

[`../docs/technical-guide.md`](../docs/technical-guide.md) explains all of this in detail, including the requests the form sends and the replies it gets (section 5.4) and how the form works inside (section 7.3).
