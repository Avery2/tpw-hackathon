#!/usr/bin/env python3
"""Validate intake cycles against data/intake/schema.json.

This is the same contract the browser enforces in intake/js/schema.js. CI runs it
on every cycle file and on issues labelled `intake`, so nothing enters the ledger
that the form itself would have rejected.

  python3 scripts/intake_validate.py                 # all files in cycles/
  python3 scripts/intake_validate.py path/to/x.json  # one file or a seed bundle
  cat payload.json | python3 scripts/intake_validate.py -   # stdin
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "intake"
SCHEMA = json.loads((DATA / "schema.json").read_text())
FIELDS = {f["key"]: f for f in SCHEMA["fields"]}
FACILITY_NAMES = {f["name"] for f in json.loads((DATA / "facilities.json").read_text())["facilities"]}


def _is_blank(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def _required(field: dict, cycle: dict) -> bool:
    if field.get("required_for") == "submission" and cycle.get("source") == "sheet-import":
        return False
    if field.get("required"):
        return True
    when = field.get("required_when")
    if not when:
        return False
    return all(cycle.get(k) in allowed for k, allowed in when.items())


def validate(cycle: dict) -> list[dict]:
    errors: list[dict] = []
    warnings: list[dict] = []

    def err(field, msg):
        errors.append({"field": field, "level": "error", "message": msg})

    def warn(code, msg):
        warnings.append({"field": None, "code": code, "level": "warning", "message": msg})

    if not isinstance(cycle, dict):
        err(None, "Cycle must be a JSON object")
        return errors

    # Identity
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{5,90}", str(cycle.get("id") or "")):
        err("id", "id must be a lowercase slug of 6-90 chars")

    for key, field in FIELDS.items():
        value = cycle.get(key)
        if _is_blank(value):
            if _required(field, cycle):
                err(key, f"{field['label']} is required")
            continue

        kind = field["type"]
        if kind in {"text", "textarea", "email"}:
            if not isinstance(value, str):
                err(key, f"{field['label']} must be text")
                continue
            if field.get("max") and len(value) > field["max"]:
                err(key, f"{field['label']} exceeds {field['max']} characters")
            if kind == "email" and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
                err(key, f"{field['label']} is not a valid email address")
        elif kind == "date":
            try:
                date.fromisoformat(str(value))
            except ValueError:
                err(key, f"{field['label']} must be an ISO date (YYYY-MM-DD)")
        elif kind in {"number", "integer"}:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                err(key, f"{field['label']} must be a number")
                continue
            if kind == "integer" and float(value) != int(value):
                err(key, f"{field['label']} must be a whole number")
            if field.get("min") is not None and value < field["min"]:
                err(key, f"{field['label']} must be at least {field['min']}")
            if field.get("max") is not None and value > field["max"]:
                err(key, f"{field['label']} must be at most {field['max']}")
        elif kind == "select":
            allowed = field.get("options")
            if allowed is None and field.get("source") == "facilities":
                allowed = FACILITY_NAMES
            if allowed and value not in allowed:
                err(key, f"{field['label']} must be one of the reference values")

    # Cross-field rules
    status = cycle.get("status")
    start, end = cycle.get("start_date"), cycle.get("end_date")
    started = cycle.get("participants_started")
    completed = cycle.get("participants_completed")
    hours = cycle.get("course_hours")

    if isinstance(started, (int, float)) and isinstance(completed, (int, float)) and completed > started:
        err("participants_completed", "More participants completed than began")
    if start and end:
        try:
            if date.fromisoformat(end) < date.fromisoformat(start):
                err("end_date", "End date precedes start date")
        except ValueError:
            pass
    if hours is not None and completed is not None and hours <= 0 and completed > 0:
        err("course_hours", "Course hours must be greater than zero")

    # Quality rules from the schema
    flags = set(cycle.get("flags") or [])
    if status == "Completed" and completed is None:
        warn("unknown-completions", "Completions unknown; cycle cannot contribute hours or outcomes")
    if status == "Completed" and not end:
        err("end_date", "A completed cycle needs an end date")
    if isinstance(started, (int, float)) and started == 0:
        err("participants_started", "A completed cycle with zero enrollees has no recordable activity")
    if start and end:
        try:
            span = (date.fromisoformat(end) - date.fromisoformat(start)).days
            if span > 548:
                warn("implausible-duration", "Cycle length exceeds 18 months; confirm the dates")
        except ValueError:
            pass
    join = cycle.get("join") or {}
    if not join.get("tokens"):
        warnings.append(
            {
                "field": None,
                "code": "missing-join",
                "level": "info",
                "message": "No participant join spine; activity only, no outcome match possible",
            }
        )
    if "sample-data" in flags:
        err("flags", "Sample rows are excluded from the ledger")

    # Historical imports are records of what was filed, not proposals. Their
    # gaps are the finding, so they downgrade to warnings instead of vanishing.
    if cycle.get("source") == "sheet-import":
        for e in errors:
            warnings.append({**e, "level": "warning", "code": "import-gap"})
        errors = []

    return errors + warnings


def main(argv: list[str]) -> int:
    targets = argv[1:]
    payloads: list[tuple[str, dict]] = []

    if not targets:
        for path in sorted((DATA / "cycles").glob("*.json")):
            if path.name == "index.json":
                continue
            payloads.append((path.name, json.loads(path.read_text())))
    elif targets == ["-"]:
        payloads.append(("<stdin>", json.load(sys.stdin)))
    else:
        for target in targets:
            p = Path(target)
            obj = json.loads(p.read_text())
            if isinstance(obj, dict) and "cycles" in obj and "id" not in obj:
                payloads.extend((f"{p.name}#{i}", c) for i, c in enumerate(obj["cycles"]))
            else:
                payloads.append((p.name, obj))

    failed = 0
    for name, cycle in payloads:
        findings = validate(cycle)
        errors = [f for f in findings if f["level"] == "error"]
        warns = [f for f in findings if f["level"] != "error"]
        status = "FAIL" if errors else ("warn" if warns else "ok")
        print(f"[{status}] {name}")
        for f in errors:
            print(f"    error  {f['field'] or '-'}: {f['message']}")
        for f in warns:
            print(f"    {f['level']:<6} {f['field'] or f.get('code') or '-'}: {f['message']}")
        failed += bool(errors)

    print(f"\n{len(payloads)} cycle(s), {failed} failing")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
