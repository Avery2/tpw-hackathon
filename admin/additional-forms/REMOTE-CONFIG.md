# Live public definitions, private additional-form records

**Preferred setup for definitions that update without Apps Script redeployments.**
This uses the existing standalone receiver engine unchanged. It does not edit,
redeploy or add files to the working guided-quarterly project.

## One-time setup: one paste for all additional forms

1. In the **new, standalone additional-forms project**, replace `Code.gs` with
   the complete generated [`LiveReceiver.gs`](LiveReceiver.gs). It combines the
   receiver engine and the remote loader in one paste. **Do not also install
   `Config.gs` or `RemoteConfig.gs`**: the bundle already defines the configuration.
2. Enable the advanced **Sheets v4** service. If using an explicit manifest, copy
   [`appsscript.remote.json`](appsscript.remote.json) into the project's
   `appsscript.json`. This includes the spreadsheet scope **and external-request
   scope**, needed to read the public definitions. The spreadsheet-only manifest
   from the offline setup does not grant that second permission.
3. Set the **new project's** Script Properties:
   - `SPREADSHEET_ID`: `1iUR7q0qnq3RLq33cwIZraRjJn0YWaY1PM0btTKMH7Q0`.
   - `ALLOW_UNSIGNED`: `true` for **synthetic demo submissions only**. Otherwise
     writes are disabled. This does not implement production authentication.
4. Deploy the new project as a Web app, **Execute as Me**, access **Anyone**.
   Authorize both scopes. Put its **new** `/exec` URL in `intake/backend.js`, not
   `form-demo/backend.js`. Keep the quarterly deployment unchanged.
5. Open the additional endpoint. It should return `ok: true`, service
   `tpw.additional-forms`, approved `recordKinds` and `recordTabs`.

If the additional project was already deployed with a static `Config.gs`, remove
that file when installing the bundle; save and deploy a **New version of that
additional deployment**, keeping its URL. Never do this in the quarterly project.

Alternatively, install the unchanged `Code.gs` plus `RemoteConfig.gs`, **instead
of** the generated static `Config.gs`. The one-file bundle is just that same code.

## Where definitions live

- `data/intake/simple_forms.json`: the questions and field definitions already
  read by the quick-form frontend.
- `data/intake/additional_forms.json`: approved form kinds, source contracts,
  destination tabs, sources and cross-field validation rules.
- `data/intake/facilities.json` and `sheets.json`: shared facility/photo references.
- **Generated** `data/intake/additional_forms.runtime.json`: one validated snapshot
  of those definitions, read by the receiver over HTTPS. Contains a deterministic
  SHA-256 content revision, not a date or any submitted records.

The Pages build regenerates the JSON snapshot from those same sources. Editing a
normal field or approving another supported form requires a website/configuration
publish, **not a Google-side code change or another Apps Script project**. New field
*types*, validation-rule implementations, authentication or other new behavior
still require receiver code changes and a deployment.

The default receiver URL is fixed in `RemoteConfig.gs`:

```
https://www.averychan.site/tpw-hackathon/data/intake/additional_forms.runtime.json
```

Only the steward can override it, via the new project's `RECORD_CONFIG_URL` Script
Property. No request field can choose a configuration URL, schema, workbook or tab.
The endpoint is public configuration, not a secret.

## Runtime behavior and boundaries

- JSON only: no `eval`, downloaded JavaScript or executable configuration.
- A validated configuration is cached for **up to five minutes**, in addition to
  website-publish/CDN propagation. Each execution uses one consistent snapshot for
  validation and routing. Newly published fields may be rejected until the cache
  refreshes; keep the form open and retry.
- Corrupt cached data is refetched. A cold/expired cache plus unavailable or invalid
  definitions **fails closed**, returning JSON and making no Sheets calls. There is
  no indefinite stale fallback or fallback to the bundled static configuration.
- Reserved quarterly/workbook tabs, duplicate destinations, malformed fields and
  unsupported rules are refused. Known direct-identifier/raw-upload field names
  are refused even if accidentally added to the contract. This is not a guarantee
  against someone typing personal information into a permitted text field.
- Optional new answers are retained in **Record (JSON)**, even if they have no
  dedicated summary column. Do not add a spreadsheet column for every question.
- Prefer optional additions. Adding required fields or changing meanings needs a
  schema-transition plan, including how older in-flight submissions can retry.
- Keep existing form kinds and tab mappings stable once data exists. Changing a
  mapping is **not a migration** and can break cross-tab retry lookup. Do not run
  multiple projects writing the same approved tabs: their locks are independent.
- Submitted records, credentials, signing keys and authentication secrets never
  belong in the public definitions. The workbook remains private. The receiver
  exposes capabilities, not a record-reading endpoint.
- To stop writes immediately, disable `ALLOW_UNSIGNED`; a cached public schema is
  not an access-control mechanism. Authentication remains separate future work.

## Regenerate and test locally

```bash
python3 scripts/build_additional_forms_runtime.py
python3 scripts/build_additional_forms_runtime.py --apps-script
python3 scripts/build_additional_forms_runtime.py --check
python3 scripts/build_additional_forms_runtime.py --apps-script --check
node admin/additional-forms/remote-config.test.cjs
```

Both generated files are disposable snapshots; edit source contracts/loader/engine,
not the snapshots. The public JSON build uses `scripts/build_additional_forms.py`
for the same validation and expansion as the static Apps Script config. All remote
loader/integration tests stub Google and network calls; no live rows are added.
