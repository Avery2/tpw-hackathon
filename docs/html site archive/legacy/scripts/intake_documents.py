#!/usr/bin/env python3
"""Validate a profile record: what the upload page read out of an application packet.

Same idea as intake_simple.py. The contract lives in data/intake/documents.json,
which the browser page and this validator both read, so what the page says is
valid and what CI accepts cannot drift apart.

Two of the checks here are not about shape at all:

  * Every fact must be something the catalogue asked for. A key that is not in
    documents.json is an error, not an extension.
  * Nothing that identifies a person or a bank account may appear, under any key.
    The repository is public and the organizations in it are being asked to trust
    it, so a profile that carries a tax number, an SSN or a signature fails the
    build rather than being quietly committed.

Run standalone:

    python3 scripts/intake_documents.py data/intake/records/profile/<id>.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / "data" / "intake" / "documents.json").read_text(encoding="utf-8"))
FACILITIES = {
    f["code"]: f["name"]
    for f in json.loads((ROOT / "data" / "intake" / "facilities.json").read_text(encoding="utf-8"))["facilities"]
}
FIELDS = {f["key"]: f for f in SPEC["fields"]}
DOCUMENTS = {d["id"]: d for d in SPEC["documents"]}
LOCAL_ONLY = {k for k, f in FIELDS.items() if f.get("privacy") == "local"}

SCHEMA = "tpw.profile/1"
ID = re.compile(r"^profile-[a-z0-9][a-z0-9-]{3,110}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
POPULATIONS = {"GP", "EOP", "MHCB", "RHU"}
DELIVERY = {o["value"] for o in FIELDS["program.delivery"]["options"]}

# A key, or a value, that must never be committed. FEINs and SSNs are read in the
# browser to check that a packet is internally consistent, and then dropped.
FORBIDDEN_KEYS = {
    "fein", "ein", "tin", "ssn", "itin", "tax_id", "taxpayer_id", "taxid",
    "signature", "dob", "date_of_birth", "cdcr_number", "cdc_number",
    "account_number", "routing_number",
}
SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
FEIN = re.compile(r"\b\d{2}-\d{7}\b")


def validate_profile(record: dict) -> list[dict]:
    """Returns a list of {field, message}. Empty means valid."""
    findings: list[dict] = []

    def err(field: str | None, message: str) -> None:
        findings.append({"field": field, "message": message})

    if not isinstance(record, dict):
        return [{"field": None, "message": "Record must be an object"}]

    if record.get("kind") != "profile":
        err("kind", "Expected kind 'profile'")
    if record.get("schema") not in (None, SCHEMA):
        err("schema", f"Expected schema {SCHEMA}")
    if not ID.fullmatch(str(record.get("id") or "")):
        err("id", "id must look like profile-<organization>-<date>-<random>")

    org = record.get("org") or {}
    if not isinstance(org, dict):
        err("org", "org must be an object")
        org = {}
    name = str(org.get("legal_name") or "").strip()
    if not name:
        err("org.legal_name", "A profile needs the organization's legal name")
    elif len(name) > 120:
        err("org.legal_name", "Legal name is implausibly long")
    for key in ("entity", "nonprofit_status"):
        value = org.get(key)
        if value in (None, ""):
            continue
        allowed = {o["value"] for o in FIELDS[f"org.{key}"]["options"]}
        if value not in allowed:
            err(f"org.{key}", f"must be one of {sorted(allowed)}")

    signatory = record.get("signatory") or {}
    if not isinstance(signatory, dict):
        err("signatory", "signatory must be an object")
        signatory = {}
    signed_on = signatory.get("signed_on")
    if signed_on and not DATE.fullmatch(str(signed_on)):
        err("signatory.signed_on", "must be YYYY-MM-DD")

    program = record.get("program") or {}
    if not isinstance(program, dict):
        err("program", "program must be an object")
        program = {}
    if not str(program.get("name") or "").strip():
        err("program.name", "A profile needs a program name, or it cannot be joined to a cycle")
    if program.get("delivery") and program["delivery"] not in DELIVERY:
        err("program.delivery", f"must be one of {sorted(DELIVERY)}")
    capacity = program.get("capacity")
    if capacity is not None:
        if isinstance(capacity, bool) or not isinstance(capacity, int) or not 0 <= capacity <= 5000:
            err("program.capacity", "must be a whole number of places")
    if program.get("languages") is not None:
        languages = program["languages"]
        if not isinstance(languages, list) or not all(isinstance(x, str) for x in languages):
            err("program.languages", "must be a list of language names")
        elif len(languages) > 8:
            err("program.languages", "too many languages for one program summary")

    sites = record.get("sites")
    if not isinstance(sites, list) or not sites:
        err("sites", "A profile needs at least one institution, or it cannot join to anything")
    else:
        seen: set[str] = set()
        for i, site in enumerate(sites):
            where = f"sites[{i}]"
            if not isinstance(site, dict):
                err(where, "must be an object")
                continue
            code = str(site.get("facility_code") or "")
            if code not in FACILITIES:
                err(f"{where}.facility_code", f"{code!r} is not a CDCR facility code in facilities.json")
            elif code in seen:
                err(f"{where}.facility_code", f"{code} appears twice")
            else:
                seen.add(code)
            pops = site.get("populations")
            if not isinstance(pops, list) or not all(p in POPULATIONS for p in pops):
                err(f"{where}.populations", f"must be a subset of {sorted(POPULATIONS)}")

    points = record.get("points") or {}
    if isinstance(points, dict) and points:
        total = points.get("total")
        if total is not None and (isinstance(total, bool) or not isinstance(total, (int, float)) or not 0 <= total <= 4):
            err("points.total", "qualifying points run from 0 to 4 (RFA §9)")
        tier = points.get("budget_tier")
        if tier is not None and tier not in (1, 2, 3):
            err("points.budget_tier", "budget band is 1, 2 or 3")

    grant = record.get("grant") or {}
    if isinstance(grant, dict):
        for key in ("funding_start", "funding_end", "application_due"):
            if grant.get(key) and not DATE.fullmatch(str(grant[key])):
                err(f"grant.{key}", "must be YYYY-MM-DD")

    for doc in record.get("documents") or []:
        doc_id = doc.get("id") if isinstance(doc, dict) else doc
        if doc_id not in DOCUMENTS:
            err("documents", f"{doc_id!r} is not a document in documents.json")
    for doc_id in record.get("missing") or []:
        if doc_id not in DOCUMENTS:
            err("missing", f"{doc_id!r} is not a document in documents.json")

    for key in record.get("withheld") or []:
        if key not in LOCAL_ONLY:
            err("withheld", f"{key!r} is not one of the fields that stays on the device")

    findings.extend(_privacy(record))
    return findings


def _privacy(record: dict, path: str = "") -> list[dict]:
    """Walk the whole record. A tax number under a friendly key is still a tax number."""
    out: list[dict] = []
    if isinstance(record, dict):
        for key, value in record.items():
            here = f"{path}.{key}" if path else key
            if str(key).lower() in FORBIDDEN_KEYS:
                out.append({"field": here, "message": "This is read in the browser and never written to a record"})
                continue
            out.extend(_privacy(value, here))
    elif isinstance(record, list):
        for i, value in enumerate(record):
            out.extend(_privacy(value, f"{path}[{i}]"))
    elif isinstance(record, str):
        if SSN.search(record):
            out.append({"field": path, "message": "Looks like a Social Security number"})
        elif FEIN.search(record):
            out.append({"field": path, "message": "Looks like a tax identification number"})
    return out


def summary(record: dict) -> str:
    """One line for a log or a commit message."""
    org = (record.get("org") or {}).get("legal_name") or "?"
    program = (record.get("program") or {}).get("name") or "?"
    sites = len(record.get("sites") or [])
    return f"{org} — {program} · {sites} institution{'s' if sites != 1 else ''}"


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv[1:]] or sorted(
        (ROOT / "data" / "intake" / "records" / "profile").glob("*.json")
    )
    failures = 0
    for path in paths:
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"[FAIL] {path}: {e}")
            failures += 1
            continue
        findings = validate_profile(record)
        if findings:
            failures += 1
            print(f"[FAIL] {path.name}")
            for f in findings:
                print(f"    error  {f['field'] or '-'}: {f['message']}")
        else:
            print(f"[ok]   {path.name}: {summary(record)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
