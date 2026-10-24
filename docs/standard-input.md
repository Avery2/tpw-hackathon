# The standard: quarterly input

This is the input side of the Collective Impact standard. It produces one file per
organization-quarter, plus per-person attendance that survives long enough to be matched to a
background check later. Three ways in, all optional, all landing in the same ledger:

| Path | Who it's for | What it produces |
|---|---|---|
| **Session sheets + scan** | orgs that run a room | per-session roster, per-person attendance |
| **Quarterly totals** | orgs that already count their own numbers | one aggregate row per program-quarter |
| **Follow-up** | anyone who hears what happened after release | one outcome per participant ID |

Nothing here requires an account, a server, or a database. Every entry is a small JSON file
committed to this repository.

---

## 1. The ID

The join key is **first initial + year of birth**: `M78`, `D1981`. Ten characters at most,
written on paper by the facilitator, never a full name.

- It is stable across sessions and across quarters, so attendance accumulates per person.
- It is not a direct identifier. It cannot be searched, and it is not unique across facilities —
  which is why every record also carries facility, program and quarter.
- The name written next to it on the sheet is for the room. **The scanner never reads the name
  column.** Paper keeps the names; the ledger keeps `M78`.

If an organization already has its own IDs, use those. The rule is stability, not format.

---

## 2. Session sheets (`intake/sheet.html`)

Type the roster once, print one page per session, tick the people who were there.

- IDs are pre-printed, so a photograph of the ticks is enough to attribute attendance.
- A QR code carries the sheet code, session number, org, program, facility, date and the roster.
  It is the anchor the scanner uses to find the page in the photo — not a link.
- The scan (`intake/scan.html`) reads the QR, projects the sheet's geometry into the photograph,
  and samples each tick box. Rotation and perspective are handled; no OCR is involved.
- Blank rows are walk-ins: ticked, counted, unattributed.

### Record

`data/intake/records/session/<id>.json`

```json
{
  "id": "session-guiding-rage-into-power-2026-11-05-o85ia8",
  "kind": "session",
  "schema": "tpw.simple/1",
  "org": "GRIP Training Institute",
  "program": "Guiding Rage Into Power",
  "facility": "San Quentin Rehabilitation Center (SQ)",
  "session_date": "2026-11-05",
  "session_no": 9,
  "sheet": "SS-YDYX",
  "roster": ["M78", "D81", "T79", "R84", "C76"],
  "present": ["M78", "T79", "C76"],
  "present_count": 3,
  "walkins": 0,
  "roster_size": 5
}
```

---

## 3. Quarterly totals (`intake/simple.html#aggregate`)

For an organization that will not keep per-session sheets. One entry per program per quarter:

```json
{
  "kind": "aggregate",
  "org": "Defy Ventures",
  "program": "CEO of Your New Life",
  "facility": "Kern Valley State Prison (KVSP)",
  "quarter": "2026-Q2",
  "served": 58,
  "completed": 41,
  "sessions_held": 22,
  "attendance": 610
}
```

This is the "standard aggregate report" row. It is enough for totals and useless for
per-person analytics — which is the trade the organization is making.

---

## 4. Follow-up (`intake/simple.html#followup`)

One participant, one outcome, whenever it is learned:

```json
{
  "kind": "followup",
  "token": "m78",              // the same simple ID
  "release_date": "2025-03-01",
  "status": "no_new_conviction" // | "new_conviction" | "unknown"
}
```

`unknown` is recorded and excluded from rates rather than counted as clean.

---

## 5. The rollup

`scripts/standard_rollup.py` runs on every push (and in the intake workflow) and writes
`data/intake/standard/rollup.json`. **This is the file the report reads.**

```json
{
  "schema": "tpw.standard.rollup/1",
  "completion_rate_threshold": 0.7,
  "periods": [
    {
      "org": "GRIP Training Institute",
      "program": "Guiding Rage Into Power",
      "facility": "San Quentin Rehabilitation Center (SQ)",
      "quarter": "2026-Q4",
      "sessions_held": 3,
      "attendance_total": 12,
      "walkins": 0,
      "served": 7,
      "completed": 3,
      "completion_rate": 0.429,
      "source": "session-sheets",
      "participants": [
        { "id": "C76", "sessions_listed": 3, "sessions_attended": 3, "rate": 1.0, "completed": true }
      ],
      "reported": null
    }
  ],
  "participants": [
    { "id": "M78", "org": "…", "quarter": "2026-Q4", "rate": 1.0, "completed": true }
  ]
}
```

Rules that matter for the report:

- **`served`** counts every ID that appeared on any sheet for that period.
- **`completed`** means present for at least **70%** of the sessions that participant was
  rostered for — not 70% of all sessions. Someone who joined in week 6 is judged from week 6.
- **`reported`** carries the self-submitted quarterly totals when an organization filed both.
  When `computed` and `reported` disagree, the report shows both rather than picking one.
- **`participants[]`** is flat on purpose: it is the list a background check iterates.

Regenerate locally:

```bash
python3 scripts/standard_rollup.py
python3 scripts/intake_reindex.py      # validation + manifest + orgs + rollup, as CI runs it
```

---

## 6. What is deliberately absent

- No names, no CDCR numbers, no dates of birth — in any file.
- No per-person narrative. A follow-up record is an outcome, not a case note.
- Nothing that requires an account to read. The ledger is static JSON in a public repository,
  and cohorts smaller than five are aggregated before release.
