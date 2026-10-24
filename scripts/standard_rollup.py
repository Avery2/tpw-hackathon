#!/usr/bin/env python3
"""Roll session sheets up into the standard quarterly aggregate.

Input:  data/intake/records/session/*.json   (one session, roster + ticks)
        data/intake/records/aggregate/*.json  (one quarter's totals, filed by hand)
Output: data/intake/standard/rollup.json

The session sheets are the source of truth for *who*. Each sheet lists a roster
and which rows were ticked, so attendance is per person, not just a headcount:
a participant is "completed" when they were present for at least COMPLETION_RATE
of the sessions they were rostered for. That is the number the report needs and
the list a background check would iterate.

A quarter is counted once. An organization files either sessions *or* the
quarter's totals, and when it sends both the second one is kept beside the first
for reconciliation rather than added to it — a double-counted quarter is a wrong
number that looks right, which is worse than a missing one. Session sheets win.

The `packets` block is the fold: one quarter, every organization together. That
is the number TPW hands onward, which is why it is summed from the winning source
of each row and never from the raw inputs.
"""

from __future__ import annotations

import json
from collections import Counter, OrderedDict, defaultdict
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECORDS = ROOT / "data" / "intake" / "records"
OUT = ROOT / "data" / "intake" / "standard"

COMPLETION_RATE = 0.70  # attended at least 70% of the sessions they were listed for


SIMPLE_FORMS = ROOT / "data" / "intake" / "simple_forms.json"


def demographic_keys() -> list[str]:
    """Bucket keys from every `counts` block, in declaration order.

    Read from the form contract rather than hard-coded here, so adding a bucket
    to the form is enough: the packet picks it up.
    """
    spec = json.loads(SIMPLE_FORMS.read_text(encoding="utf-8"))
    keys: list[str] = []
    for form in spec["forms"]:
        for field in form["fields"]:
            if field.get("type") == "counts":
                for item in field.get("items", []):
                    if item["key"] not in keys:
                        keys.append(item["key"])
    return keys


def quarter_of(iso: str) -> str | None:
    try:
        d = date.fromisoformat(iso)
    except (TypeError, ValueError):
        return None
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


def facility_list(record: dict) -> list[str]:
    """A record may name one facility or several; normalize to a sorted list."""
    many = record.get("facilities")
    if isinstance(many, list) and many:
        return sorted({str(x) for x in many if x})
    one = record.get("facility")
    return [str(one)] if one else []


def load(kind: str) -> list[dict]:
    folder = RECORDS / kind
    if not folder.exists():
        return []
    out = []
    for path in sorted(folder.glob("*.json")):
        try:
            out.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return out


def build() -> dict:
    sessions = load("session")
    manual = load("aggregate")  # one quarter's totals, filed by hand
    demo_keys = demographic_keys()

    # group sessions by org / program / facility / quarter
    groups: "OrderedDict[tuple, dict]" = OrderedDict()
    for s in sessions:
        q = quarter_of(s.get("session_date"))
        if not q:
            continue
        facs = tuple(facility_list(s))
        key = (s.get("org") or "", s.get("program") or "", facs, q)
        g = groups.setdefault(
            key,
            {
                "org": key[0] or None,
                "program": key[1] or None,
                "facilities": list(facs),
                "facility": facs[0] if len(facs) == 1 else None,
                "quarter": key[3],
                "sessions": [],
            },
        )
        g["sessions"].append(s)

    periods = []
    people = []

    for (org, program, facs, quarter), g in groups.items():
        # per-ID attendance
        listed: dict[str, int] = defaultdict(int)
        attended: dict[str, int] = defaultdict(int)
        walkins = 0

        for s in g["sessions"]:
            roster = [str(x) for x in (s.get("roster") or []) if x]
            present = {str(x) for x in (s.get("present") or []) if x}
            for pid in roster:
                listed[pid] += 1
                if pid in present:
                    attended[pid] += 1
            walkins += int(s.get("walkins") or 0)

        roster_rows = []
        for pid in sorted(listed, key=lambda p: (-attended[p], p)):
            possible = listed[pid]
            rate = attended[pid] / possible if possible else 0.0
            roster_rows.append(
                {
                    "id": pid,
                    "sessions_listed": possible,
                    "sessions_attended": attended[pid],
                    "rate": round(rate, 3),
                    "completed": rate >= COMPLETION_RATE,
                }
            )
            people.append(
                {
                    "id": pid,
                    "org": org or None,
                    "program": program or None,
                    "facilities": list(facs),
                    "facility": facs[0] if len(facs) == 1 else None,
                    "quarter": quarter,
                    "sessions_attended": attended[pid],
                    "sessions_listed": possible,
                    "rate": round(rate, 3),
                    "completed": rate >= COMPLETION_RATE,
                }
            )

        sessions_held = len(g["sessions"])
        attendance_total = sum(
            int(s.get("present_count") or len(s.get("present") or []) or 0) for s in g["sessions"]
        ) + walkins
        served = len(listed)

        periods.append(
            {
                "org": org or None,
                "program": program or None,
                "facilities": list(facs),
                "facility": facs[0] if len(facs) == 1 else None,
                "quarter": quarter,
                "sessions_held": sessions_held,
                "attendance_total": attendance_total,
                "walkins": walkins,
                "served": served,
                "completed": sum(1 for r in roster_rows if r["completed"]),
                "completion_rate": round(sum(1 for r in roster_rows if r["completed"]) / served, 3) if served else None,
                "participants": roster_rows,
                "source": "session-sheets",
                "reported": None,
                "demographics": {},
            }
        )

    # ------------------------------------------------------- reported inputs
    # Two ways to file a quarter without session sheets. Both are kept beside
    # the computed numbers, never added to them.
    def key_of(record: dict) -> tuple:
        return (record.get("org"), record.get("program"), tuple(facility_list(record)), record.get("quarter"))

    by_key = {key_of(p): p for p in periods}

    def sibling(key: tuple) -> dict | None:
        """Same org, same program, same quarter, whatever facilities it names."""
        for k, r in by_key.items():
            if k[0] == key[0] and k[1] == key[1] and k[3] == key[3]:
                return r
        return None

    def blank_row(key: tuple, source: str) -> dict:
        return {
            "org": key[0],
            "program": key[1],
            "facilities": list(key[2]),
            "facility": key[2][0] if len(key[2]) == 1 else None,
            "quarter": key[3],
            "sessions_held": None,
            "attendance_total": None,
            "walkins": None,
            "served": None,
            "completed": None,
            "completion_rate": None,
            "participants": [],
            "source": source,
            "reported": None,
            "demographics": {},
        }

    # quarterly totals filed by hand
    for m in manual:
        if not m.get("quarter"):
            continue
        key = key_of(m)
        reported = {
            "served": m.get("served"),
            "completed": m.get("completed"),
            "sessions_held": m.get("sessions_held"),
            "attendance_total": m.get("attendance"),
            "notes": m.get("notes"),
            "submitted_at": m.get("submitted_at"),
        }
        row = by_key.get(key) or sibling(key)
        if row is not None:
            # Session sheets already cover this org, program and quarter. Keep the
            # numbers side by side; the report shows both, nothing is summed. A
            # sheet carries no demographics, so take them from the totals when the
            # row has none of its own.
            row["reported"] = reported
            if not row.get("demographics"):
                row["demographics"] = {k: m[k] for k in demo_keys if isinstance(m.get(k), int)}
            continue
        row = blank_row(key, "reported")
        row.update(
            sessions_held=reported["sessions_held"],
            attendance_total=reported["attendance_total"],
            served=reported["served"],
            completed=reported["completed"],
            reported=reported,
            demographics={k: m[k] for k in demo_keys if isinstance(m.get(k), int)},
        )
        if reported.get("served"):
            row["completion_rate"] = round((reported["completed"] or 0) / reported["served"], 3)
        periods.append(row)
        by_key[key] = row

    periods.sort(key=lambda p: (p["quarter"] or "", p["org"] or "", p["program"] or ""))

    # --------------------------------------------------------------- packets
    # One quarter, every organization folded together: what TPW hands onward.
    # Each row contributes once, from whichever source won, so an organization
    # that filed both a sheet and a total is not counted twice.
    packets = []
    for quarter in sorted({p["quarter"] for p in periods if p["quarter"]}):
        rows = [p for p in periods if p["quarter"] == quarter]

        def total(field: str):
            vals = [r[field] for r in rows if isinstance(r.get(field), (int, float))]
            return sum(vals) if vals else None

        demographics = {}
        for key in demo_keys:
            vals = [r["demographics"][key] for r in rows if isinstance((r.get("demographics") or {}).get(key), int)]
            if vals:
                demographics[key] = sum(vals)

        packets.append(
            {
                "quarter": quarter,
                "organizations": len({r["org"] for r in rows if r.get("org")}),
                "programs": len({(r["org"], r["program"]) for r in rows}),
                "rows": len(rows),
                "sources": dict(sorted(Counter(r.get("source") or "?" for r in rows).items())),
                "served": total("served"),
                "completed": total("completed"),
                "sessions_held": total("sessions_held"),
                "attendance_total": total("attendance_total"),
                "rows_without_participant_counts": sum(1 for r in rows if r.get("served") is None),
                "reconciled": sum(
                    1 for r in rows if r.get("reported") and r.get("source") != "reported"
                ),
                "demographics": demographics,
            }
        )

    return {
        "schema": "tpw.standard.rollup/1",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "completion_rate_threshold": COMPLETION_RATE,
        "note": (
            "'completed' means present for at least 70% of the sessions the participant "
            "was rostered for. Participants are identified by the simple ID printed on "
            "the sheet (first initial + birth year), never by name."
        ),
        "counts": {
            "sessions": len(sessions),
            "periods": len(periods),
            "packets": len(packets),
            "participants": len({(p['id'], p['org'], p['quarter']) for p in people}),
        },
        "periods": periods,
        "packets": packets,
        "participants": people,
    }


def write(rollup: dict) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "rollup.json"
    path.write_text(json.dumps(rollup, indent=2) + "\n", encoding="utf-8")
    return path


if __name__ == "__main__":
    result = build()
    path = write(result)
    c = result["counts"]
    print(
        f"{c['sessions']} sessions · {c['periods']} periods · "
        f"{c['packets']} packets · {c['participants']} participants "
        f"-> {path.relative_to(ROOT)}"
    )
