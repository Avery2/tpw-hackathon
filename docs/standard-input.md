# The standard: quarterly input

This is the input side of the Collective Impact standard. It produces one file per
organization-quarter, plus per-person attendance that survives long enough to be matched to a
background check later. Three ways in, all optional, all landing in the same ledger.

**Each entry is filed by one organization and belongs to it.** Every form asks for the
organization first, because that is the unit the ledger attributes numbers to and the unit the
quarterly packet folds across.

**A quarter is counted once.** For a given organization, program and quarter, file *either*
sessions *or* the quarter's totals — not both. Both sides say so. If both arrive anyway the
rollup keeps the second set for reconciliation and never adds it in (see §5).

| Path | Who it's for | What it produces |
|---|---|---|
| **Sessions** | orgs that run a room | per-session roster and attendance: printed and scanned, or typed in |
| **Quarterly totals** | orgs that already count their own numbers | one aggregate row per program-quarter |
| **Follow-up** | anyone who hears what happened after release | one outcome per participant ID |

The first two are the choice: an organization files its quarter as sessions *or* as totals.
Follow-up is not a filing; it is an outcome attached to a participant ID whenever it arrives.

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

For an organization that will not keep per-session sheets. One entry per program per quarter,
covering one facility or several:

```json
{
  "kind": "aggregate",
  "org": "Defy Ventures",
  "program": "CEO of Your New Life",
  "facilities": [
    "Kern Valley State Prison (KVSP)",
    "California Correctional Institution (CCI)",
    "Mule Creek State Prison (MCSP)"
  ],
  "quarter": "2026-Q2",
  "served": 132,
  "completed": 88,
  "sessions_held": 64,
  "attendance": 1740
}
```

`facilities` is a list. File one entry per facility if your numbers are already split that way;
file one entry with several facilities when the total is all you have. The rollup keeps the
list intact, and only attaches a reported row to a computed one when the org, the program and
the quarter match — a combined total never silently stands in for a per-facility figure.

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

**A quarter is counted once.** An organization files either sessions (sheets, scanned or typed)
or the quarter's totals — not both, and the forms say so. When both arrive anyway, the rollup
keeps the second set beside the first for reconciliation instead of adding it in. Precedence:
**session sheets win.** A double-counted quarter is a wrong number
that looks right, which is worse than a missing one.

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
      "facilities": ["San Quentin Rehabilitation Center (SQ)"],
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
      "reported": null,
      "demographics": {}
    }
  ],
  "packets": [
    {
      "quarter": "2026-Q4",
      "organizations": 3,
      "programs": 4,
      "rows": 4,
      "sources": { "reported": 1, "session-sheets": 3 },
      "served": 61,
      "completed": 44,
      "sessions_held": 96,
      "attendance_total": 2480,
      "rows_without_participant_counts": 0,
      "reconciled": 1,
      "demographics": { "age_25_34": 19, "race_black": 7 }
    }
  ],
  "participants": [
    { "id": "M78", "org": "…", "quarter": "2026-Q4", "rate": 1.0, "completed": true }
  ]
}
```

Rules that matter for the report:

- **`facilities`** is always a list; **`facility`** is set only when there is exactly one, so
  a consumer that wants a single site reads `facility` and checks for null.
- **`served`** counts every ID that appeared on any sheet for that period.
- **`completed`** means present for at least **70%** of the sessions that participant was
  rostered for — not 70% of all sessions. Someone who joined in week 6 is judged from week 6.
- **`reported`** carries the self-submitted quarterly totals when an organization filed both.
  When `computed` and `reported` disagree, the report shows both rather than picking one.
- **`demographics`** is counts only, never names, summed per bucket. A sheet carries none, so
  a computed row takes the demographics from whichever alternative source reported them.
- **`packets[]`** is the fold: one quarter with every organization added together. Each row
  contributes once, from its winning `source`. `rows_without_participant_counts` says how many
  rows could not contribute to `served`, so a partial sum is never read as a total.
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
