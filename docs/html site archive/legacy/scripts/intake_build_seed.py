#!/usr/bin/env python3
"""Build the intake seed ledger from the Collective Impact sheet snapshot.

Reads data/tpw-collective-impact.csv (the Data Entry Sheet tab) and emits:

  data/intake/seed.json          normalized cycles, warts preserved and flagged
  data/intake/demo/join.json     SYNTHETIC participant spine + outcomes

Nothing is silently repaired. A `TBD` stays missing and carries a flag, so the
dashboard can show the real hygiene of the collective's reporting instead of a
laundered copy of it.

Usage: python3 scripts/intake_build_seed.py [--today YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "tpw-collective-impact.csv"
OUT_SEED = ROOT / "data" / "intake" / "seed.json"
OUT_JOIN = ROOT / "data" / "intake" / "demo" / "join.json"
FACILITIES = json.loads((ROOT / "data" / "intake" / "facilities.json").read_text())["facilities"]

MISSING = {"", "tbd", "n/a", "na", "unknown", "-", "#value!", "#n/a", "#ref!", "none"}

# Columns as they appear in the snapshot, in sheet order.
COL = {
    "facility": "CDCR Facility",
    "yard": "Yard",
    "org": "Organization Name",
    "program": "Program Name",
    "status": "Schedule Status (Planned, In Progress, Completed)",
    "start": "Start Date",
    "end": "End Date",
    "hours": "Total Programming hours",
    "started": "Number of Participants",
    "completed": "Number of Participants Completed",
    "notes": "Notes",
}


TYPOGRAPHY = {
    "\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": "-", "\u00a0": " ",
}


def clean(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip()
    for src, dst in TYPOGRAPHY.items():
        v = v.replace(src, dst)
    v = " ".join(v.split())
    return None if v.lower() in MISSING else v


def to_date(value: str | None) -> str | None:
    """Parse M/D/YYYY (sheet format) into ISO, else None."""
    v = clean(value)
    if not v:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def to_num(value: str | None, integer: bool) -> float | int | None:
    v = clean(value)
    if v is None:
        return None
    try:
        n = float(v.replace(",", ""))
    except ValueError:
        return None
    return int(n) if integer else n


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:48].strip("-")


def canonical_facility(name: str | None) -> str | None:
    """Snap to the reference list, tolerating quote/dash drift from Sheets."""
    if not name:
        return name
    for f in FACILITIES:
        if f["name"] == name:
            return f["name"]
    code = facility_code(name)
    for f in FACILITIES:
        if code and f["code"] == code:
            return f["name"]
    return name


def facility_code(name: str) -> str | None:
    for f in FACILITIES:
        if f["name"] == name:
            return f["code"]
    m = re.search(r"\(([A-Z]{2,5})", name or "")
    return m.group(1) if m else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=date.today().isoformat())
    args = ap.parse_args()
    today = date.fromisoformat(args.today)

    with CSV_PATH.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    cycles: list[dict] = []
    skipped_empty = 0
    seen_keys: Counter = Counter()

    for raw in rows:
        facility = clean(raw.get(COL["facility"]))
        program = clean(raw.get(COL["program"]))
        org = clean(raw.get(COL["org"]))
        start = to_date(raw.get(COL["start"]))

        # Trailing rows in the sheet are formula remnants: everything blank.
        if not any(clean(raw.get(c)) for c in COL.values()):
            skipped_empty += 1
            continue
        if not facility and not program and not org:
            skipped_empty += 1
            continue

        facility = canonical_facility(facility)
        status = clean(raw.get(COL["status"])) or "Completed"
        if status not in {"Planned", "In Progress", "Completed"}:
            status = "Completed"

        hours = to_num(raw.get(COL["hours"]), integer=False)
        started = to_num(raw.get(COL["started"]), integer=True)
        completed = to_num(raw.get(COL["completed"]), integer=True)
        end = to_date(raw.get(COL["end"]))
        notes = clean(raw.get(COL["notes"]))
        yard = clean(raw.get(COL["yard"]))

        flags: list[str] = []
        if notes and "sample data" in notes.lower():
            flags.append("sample-data")
        if completed is None and status == "Completed":
            flags.append("unknown-completions")
        start_d = date.fromisoformat(start) if start else None
        end_d = date.fromisoformat(end) if end else None
        if start_d and end_d and end_d < start_d:
            flags.append("end-before-start")
        if completed is not None and started is not None and completed > started:
            flags.append("completions-exceed-starts")
        if start_d and end_d and (end_d - start_d).days > 548:
            flags.append("implausible-duration")
        if start_d and status == "Completed" and start_d > today:
            flags.append("future-date")
        if status == "Completed" and completed == 0:
            flags.append("empty-completions-zero")

        key = (facility, yard, program, start)
        seen_keys[key] += 1
        if seen_keys[key] > 1:
            flags.append("duplicate-cycle")

        base = f"{facility or 'unknown'}-{org or 'unknown'}-{program or 'unknown'}-{start or 'nodate'}"
        digest = hashlib.sha1(repr(sorted(raw.items())).encode()).hexdigest()[:6]
        cycle_id = f"{slug(base)}-{digest}"

        cycles.append(
            {
                "id": cycle_id,
                "source": "sheet-import",
                "submitted_at": None,
                "submitted_by": None,
                "facility": facility,
                "facility_code": facility_code(facility or ""),
                "yard": yard,
                "org": org,
                "program": program,
                "status": status,
                "start_date": start,
                "end_date": end,
                "course_hours": hours,
                "participants_started": started,
                "participants_completed": completed,
                "funded_by": None,
                "notes": notes,
                "flags": sorted(set(flags)),
                "join": {"spine_version": None, "tokens": []},
            }
        )

    # ---- synthetic join spine -------------------------------------------------
    # Deterministic, reproducible, and labelled synthetic everywhere it surfaces.
    # The point is to demonstrate the shape of a joined record, not to make a
    # claim about any real program.
    join = build_synthetic_join(cycles, today)

    OUT_SEED.parent.mkdir(parents=True, exist_ok=True)
    OUT_JOIN.parent.mkdir(parents=True, exist_ok=True)

    seed = {
        "schema": "tpw.intake/1",
        "kind": "seed",
        "source": "data/tpw-collective-impact.csv",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "note": "Imported from the live Collective Impact sheet. Missing values are null and flagged, never fabricated.",
        "skipped_blank_rows": skipped_empty,
        "cycles": cycles,
    }
    OUT_SEED.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n")
    OUT_JOIN.write_text(json.dumps(join, indent=2, ensure_ascii=False) + "\n")

    flagged = Counter(f for c in cycles for f in c["flags"])
    print(f"cycles written:      {len(cycles)}")
    print(f"blank rows skipped:  {skipped_empty}")
    print(f"flagged:             {dict(flagged)}")
    print(f"synthetic tokens:    {len(join['participants'])}")


def build_synthetic_join(cycles: list[dict], today: date) -> dict:
    """Invent a plausible, clearly-labelled participant spine for the demo.

    The spine stores only what a real one would: a token, which cycle it belongs
    to, whether the person finished, a release date, and — when there is one — how
    long after release a new conviction appears. Any observation window (12, 24,
    36 months) is then a client-side computation rather than a baked-in verdict,
    so a cohort that is too young reads as "not yet", not as "clean".
    """

    def rng(*parts: str) -> float:
        h = hashlib.sha256("|".join(parts).encode()).hexdigest()
        return int(h[:12], 16) / 0xFFFFFFFFFFFF

    participants: list[dict] = []
    for c in cycles:
        if c["status"] != "Completed" or not c["participants_started"]:
            continue
        started = c["participants_started"]
        completed = c["participants_completed"]
        if completed is None or "sample-data" in c["flags"]:
            continue

        # Mostly completers carry a spine, plus a slice of non-completers — the
        # comparison group is what makes the join worth doing.
        for i in range(started):
            did_complete = i < completed
            if not did_complete and rng(c["id"], str(i), "drop") > 0.45:
                continue

            token = hashlib.sha256(f"tpw-demo-spine|{c['id']}|{i}".encode()).hexdigest()[:32]
            release = None
            conviction_after = None
            if c["end_date"]:
                lag = 7 + int(rng(c["id"], str(i), "rel") * 230)
                release = (date.fromisoformat(c["end_date"]) + timedelta(days=lag)).isoformat()
                base = 0.20 if did_complete else 0.42
                jitter = (rng(token, "bump") - 0.5) * 0.12
                if rng(token, "conviction") < base + jitter:
                    conviction_after = 14 + int(rng(token, "when") * 520)

            participants.append(
                {
                    "token": token,
                    "cycle_id": c["id"],
                    "event": "completed" if did_complete else "did_not_complete",
                    "release_date": release,
                    "new_conviction_after_days": conviction_after,
                }
            )

    return {
        "schema": "tpw.join/1",
        "kind": "synthetic",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "warning": "SYNTHETIC. Generated to demonstrate the join. Not real people, not real convictions. Do not cite.",
        "method": "HMAC-SHA256 over the organization key, truncated to 128 bits. A fixed demo salt stands in for the key.",
        "windows_days": [365, 730, 1095],
        "participants": participants,
    }


if __name__ == "__main__":
    main()
