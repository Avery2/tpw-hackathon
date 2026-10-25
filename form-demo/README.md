# Guided form submissions

Serve the repository with `python3 -m http.server 8787` and open
`http://localhost:8787/form-demo/`. No build or package install is needed.

**Finish and submit** writes one document to the default Cloud Firestore database
in Firebase project `tpw-hackathon`, collection `submissions`. It does not write to
`orgs`. `js/submissions.js` holds the web configuration and pinned Firebase CDN SDK
imports; the SDK loads when submitting, so network failures do not break form entry.

Each document includes `schemaVersion`, `source`, `organization`, `prisons`,
`programs`, `totals`, the client's ISO `submittedAt`, and a Firestore server
`receivedAt` timestamp. Program fields are stored with stable keys and numeric
counts, not HTML input names. Assignments retain prison codes and selected yards.
Totals count each program once, even when assigned to several prisons; participant
counts are enrollments, not distinct people. Mock savings are not saved as outcomes.

The form shows success only after Firestore confirms the write. During submission,
controls are disabled. Failed writes preserve entries for retry. A document ID is
reused within the page session to prevent duplicate documents on retry. Starting a
new submission generates a new ID. Local storage is no longer the submission store.

Requires an internet connection and Firestore rules allowing the client write.
No sign-in or rules changes are implemented by this form.
