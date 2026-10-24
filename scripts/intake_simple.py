#!/usr/bin/env python3
"""Validate a quick-form record (weekly / aggregate / follow-up).

Same contract as intake/js/simple.js, read from data/intake/simple_forms.json so
the page and CI cannot disagree about what a valid entry is.

A quick form is deliberately shallow: required-ness, types, ranges, and one
conditional field. Anything richer belongs on the full cycle form.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / "data" / "intake" / "simple_forms.json").read_text())
FORMS = {f["kind"]: f for f in SPEC["forms"]}
KINDS = set(FORMS)
TOKEN = re.compile(r"^[0-9a-f]{32}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _shown(field: dict, record: dict) -> bool:
    cond = field.get("show_if")
    if not cond:
        return True
    return all(record.get(k) == v for k, v in cond.items())


def validate_record(record: dict) -> list[dict]:
    """Returns a list of {field, message}. Empty means valid."""
    findings: list[dict] = []

    def err(key: str, msg: str) -> None:
        findings.append({"field": key, "message": msg})

    if not isinstance(record, dict):
        return [{"field": None, "message": "Record must be an object"}]

    kind = record.get("kind")
    form = FORMS.get(kind)
    if not form:
        return [{"field": "kind", "message": f"Unknown form kind: {kind!r}"}]

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{5,120}", str(record.get("id") or "")):
        err("id", "id must be a lowercase slug")
    if record.get("schema") not in (None, "tpw.simple/1"):
        err("schema", "Unexpected schema tag")

    for field in form["fields"]:
        if not _shown(field, record):
            continue
        key = field["key"]
        value = record.get(key)
        blank = value is None or (isinstance(value, str) and not value.strip())

        if blank:
            if field.get("required"):
                err(key, f"{field['label']} is required")
            continue

        ftype = field["type"]
        if ftype == "integer":
            if isinstance(value, bool) or not isinstance(value, int):
                err(key, f"{field['label']} must be a whole number")
                continue
            if field.get("min") is not None and value < field["min"]:
                err(key, f"{field['label']} must be at least {field['min']}")
            if field.get("max") is not None and value > field["max"]:
                err(key, f"{field['label']} must be at most {field['max']}")
        elif ftype == "date":
            if not DATE.fullmatch(str(value)):
                err(key, f"{field['label']} must be YYYY-MM-DD")
        elif ftype == "list":
            if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
                err(key, f"{field['label']} must be a list of IDs")
            elif len(value) > field.get("max_items", 60):
                err(key, f"{field['label']} has too many entries")
            elif any(len(x) > field.get("max_length", 12) for x in value):
                err(key, f"{field['label']} has an entry that is too long")
        elif ftype == "token":
            if not TOKEN.fullmatch(str(value)):
                err(key, "Token must be 32 lowercase hex characters")
        elif ftype == "select":
            if value not in field.get("options", []):
                err(key, f"{field['label']} must be one of the listed quarters")
        elif ftype == "choice":
            allowed = {o["value"] for o in field.get("options", [])}
            if value not in allowed:
                err(key, f"{field['label']} must be one of {sorted(allowed)}")
        elif ftype == "facility":
            names = {
                f["name"]
                for f in json.loads((ROOT / "data" / "intake" / "facilities.json").read_text())["facilities"]
            }
            if value not in names:
                err(key, "Facility must come from the reference list")
        else:
            if not isinstance(value, str):
                err(key, f"{field['label']} must be text")
            elif field.get("max") and len(value) > field["max"]:
                err(key, f"{field['label']} is too long")

    return findings


def summary(record: dict) -> str:
    """One line for a log or a commit message."""
    kind = record.get("kind")
    if kind == "weekly":
        return f"{record.get('program', '?')} · week of {record.get('week_ending', '?')}"
    if kind == "aggregate":
        return f"{record.get('org', '?')} — {record.get('program', '?')} · {record.get('quarter', '?')}"
    if kind == "session":
        return f"{record.get('program', '?')} · {record.get('session_date', '?')} · {record.get('present_count', record.get('present', '?'))} present"
    return f"follow-up · {str(record.get('token', ''))[:8]}… · {record.get('status', '?')}"
