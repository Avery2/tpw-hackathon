# One-time receiver update

This is **Code.gs for the existing guided-form Google Apps Script project**, not
another backend. Keep its current `Rows.gs`, renamed-tab `Sheet.gs`, `Session.gs`,
Script Properties and deployment URL. Do not paste this into `admin/sheetforms`,
which is a different, older receiver.

1. Copy all of [`Code.gs`](Code.gs) into the existing project's **Code.gs**.
2. Save. Deploy → Manage deployments → pencil/Edit → Version: **New version** → Deploy.
3. Keep the same `/exec` URL; no website configuration change is needed.
4. Submit a clearly labeled synthetic programme with optional context. Check its
   **Notes** cell and **Additional data (JSON)** cell in the existing named tab.

The update:

- Uses the server's current **California** quarter, ignoring browser-supplied periods.
- Accepts **In Progress** and **Completed**, not Planned. Existing count/date
  validation still comes from the unchanged `Rows.gs`.
- Saves optional context (up to 2,000 characters) into the existing **Notes** column.
- Adds one **Additional data (JSON)** column at the right, on the first valid write.
  It retains structured submission/programme/site data, including future fields
  sent by the form. Unknown fields are preserved there, not promoted to metrics.
- Maps core values by their existing header names, so adding or reordering columns
  does not shift data. A blank **Reporting Quarter** heading is recovered in place
  when the other core headings uniquely match the canonical layout and the column
  is empty or contains only recognizable quarter values. Existing values are never
  rewritten or backfilled. Other missing/duplicate core headings, conflicting data
  and ambiguous layouts still fail rather than guessing or overwriting anything.
- Preserves existing rows and column names. It never renames the destination tab.
- Excludes the HTTP envelope, authentication tokens and common credential/file/ID
  fields from snapshots. Free text must still not contain personal information.
  Nothing is written to the public repo or a public read endpoint.
- Retains the existing unsigned-demo setting, session attribution, serialized
  writes and bounded receipt-cache deduplication. There are no Firebase calls.

Snapshots are limited to 20,000 characters per row and requests to 250,000
characters. Cell text is escaped for `USER_ENTERED` writes. Cache deduplication
lasts at most six hours and is best-effort: after an ambiguous network failure,
check the Sheet before resubmitting. There is no permanent request-ID ledger.

The frontend checks receiver capabilities before submitting nonempty context.
An old receiver can still accept an empty-context filing, but cannot silently
claim to have saved comments it ignores. Refresh/retry after upgrading it.

## Checks (no real Google requests)

```bash
node form-demo/test/receiver.cjs
node form-demo/test/reporting.mjs
python3 -m http.server 8826 --bind 127.0.0.1  # separate terminal
node form-demo/test/browser.mjs
```

The receiver tests exercise both historical Rows.gs contracts from pinned Git
commits. A normal full clone includes those branch objects; fetch the existing
`email-code-signin` and `sheet-firebase` branches if testing from a shallow clone.
Browser tests require Chrome and Node 22+; set `CHROME_BIN` on non-macOS systems.
All Google requests in that browser suite are intercepted; it never writes live
rows or sends emails.
