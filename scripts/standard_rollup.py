#!/usr/bin/env python3
"""Roll session sheets up into the standard quarterly aggregate.

Input:  data/intake/records/session/*.json
        data/intake/records/aggregate/*.json   (hand-entered quarterly totals)
Output: data/intake/standard/rollup.json

The session sheets are the source of truth for *who*. Each sheet lists a roster
and which rows were ticked, so attendance is per person, not just a headcount:
a participant is "completed" when they were present for at least COMPLETION_RATE
of the sessions they were rostered for. That is the number the report needs and
the list a background check would iterate.

Orgs that do not keep per-session records can file the quarterly totals by hand;
those appear as `reported` next to `computed` so the two can be reconciled
instead of silently disagreeing.
"""

from __future__ import annotations

import json
from collections import OrderedDict, defaultdict
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECORDS = ROOT / "data" / "intake" / "records"
OUT = ROOT / "data" / "intake" / "standard"

COMPLETION_RATE = 0.70  # attended at least 70% of the sessions they were listed for


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
    manual = load("aggregate")

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
        attendance_total = sum(int(s.get("present_count") or 0) for s in g["sessions"]) + walkins
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
            }
        )

    # hand-entered quarterly totals, including quarters with no sheets at all
    def key_of(record: dict) -> tuple:
        return (record.get("org"), record.get("program"), tuple(facility_list(record)), record.get("quarter"))

    by_key = {key_of(p): p for p in periods}
    for m in manual:
        key = key_of(m)
        if not key[3]:
            continue
        reported = {
            "served": m.get("served"),
            "completed": m.get("completed"),
            "sessions_held": m.get("sessions_held"),
            "attendance_total": m.get("attendance"),
            "notes": m.get("notes"),
            "submitted_at": m.get("submitted_at"),
        }
        if key in by_key:
            by_key[key]["reported"] = reported
        else:
            periods.append(
                {
                    "org": key[0],
                    "program": key[1],
                    "facilities": list(key[2]),
                    "facility": key[2][0] if len(key[2]) == 1 else None,
                    "quarter": key[3],
                    "sessions_held": reported["sessions_held"],
                    "attendance_total": reported["attendance_total"],
                    "walkins": None,
                    "served": reported["served"],
                    "completed": reported["completed"],
                    "completion_rate": (
                        round(reported["completed"] / reported["served"], 3)
                        if reported.get("served")
                        else None
                    ),
                    "participants": [],
                    "source": "reported",
                    "reported": reported,
                }
            )

    periods.sort(key=lambda p: (p["quarter"] or "", p["org"] or "", p["program"] or ""))

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
            "participants": len({(p['id'], p['org'], p['quarter']) for p in people}),
        },
        "periods": periods,
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
        f"{c['sessions']} sessions · {c['periods']} periods · {c['participants']} participants "
        f"-> {path.relative_to(ROOT)}"
    )
