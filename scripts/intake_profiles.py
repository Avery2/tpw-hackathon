#!/usr/bin/env python3
"""Derive the organization registry from the ledger.

A cycle record is a fact: this program ran at this facility on these dates. An
organization is the slowly-changing dimension over those facts — its name, its
programs, the facilities it works in, the hours its curricula run, and who signs
for it.

Today the form asks a submitter for all of that every single time. Nine of its
fifteen fields are the same on the second submission as the first, and the seed
data already shows 37 cycles filed by three organizations. At TPW's own count of
120 member organizations that is thousands of retyped names, each one a chance
to spell the organization differently and silently split it in two.

So the registry is not entered, it is derived. `seed.json` plus every committed
cycle are grouped by organization and program, and the result is committed as
`data/intake/orgs/index.json`. Derived means it cannot drift from the ledger,
because it is a function of it.

A profile record — what intake/upload.html reads out of an organization's RIGHT
4.0 application packet — joins the same pass. A cycle says this program ran at
this institution; a profile says this program exists and intends to run at these
institutions. The second is where an organization starts, and it is the only
statement we have about an organization with no cycles yet.

Run standalone to regenerate after a hand edit:

    python3 scripts/intake_profiles.py

CI runs it through `scripts/intake_reindex.py` on every push.
"""

from __future__ import annotations

import json
import re
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "intake" / "seed.json"
CYCLES = ROOT / "data" / "intake" / "cycles"
RECORDS = ROOT / "data" / "intake" / "records"
ORGS = ROOT / "data" / "intake" / "orgs"
INDEX = ORGS / "index.json"

SCHEMA = "tpw.intake.orgs/1"


def slug(value: object, limit: int = 48) -> str:
    """A stable, readable key. Same name in, same slug out, always."""
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return text[:limit].strip("-") or "unnamed"


def mode(values: list) -> object:
    """The value an organization uses most often, so one typo cannot win.

    Ties break on first-seen order rather than an arbitrary hash, which keeps the
    output stable across runs.
    """
    seen = [v for v in values if v not in (None, "")]
    if not seen:
        return None
    counts = Counter(seen)
    best = max(counts.values())
    for v in seen:
        if counts[v] == best:
            return v
    return None


def is_sample(cycle: dict) -> bool:
    return "sample-data" in (cycle.get("flags") or [])


def load_ledger() -> list[dict]:
    """Everything durable: the 2026 sheet import, then committed cycles.

    The browser's local queue is deliberately excluded. A draft on somebody's lap-
    top is not evidence that an organization exists.
    """
    cycles: list[dict] = []
    if SEED.exists():
        cycles += json.loads(SEED.read_text(encoding="utf-8")).get("cycles") or []
    for path in sorted(CYCLES.glob("*.json")):
        if path.name == "index.json":
            continue
        try:
            cycles.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            # A malformed cycle is reindex's problem to report, not ours to hide.
            continue
    return cycles


def load_profiles() -> dict[str, dict]:
    """The latest packet read per organization. Same rule as the ledger: newest wins."""
    profiles: dict[str, dict] = {}
    for path in sorted(RECORDS.glob("profile/*.json")):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        name = ((record.get("org") or {}).get("legal_name") or "").strip()
        if not name:
            continue
        key = slug(name)
        prior = profiles.get(key)
        if prior is None or (record.get("submitted_at") or "") >= (prior.get("submitted_at") or ""):
            profiles[key] = record
    return profiles


def derive(cycles: list[dict], profiles: dict[str, dict] | None = None) -> list[dict]:
    orgs: OrderedDict[str, dict] = OrderedDict()

    for c in cycles:
        name = (c.get("org") or "").strip()
        if not name:
            continue
        sample = is_sample(c)
        start = c.get("start_date") or ""

        oid = slug(name)
        org = orgs.setdefault(
            oid,
            {
                "id": oid,
                "org": name,
                "cycles": 0,
                "sample_cycles": 0,
                "programs": OrderedDict(),
                "contact": None,
                "last_activity": None,
            },
        )
        org["cycles"] += 1
        org["sample_cycles"] += 1 if sample else 0
        if start > (org["last_activity"] or ""):
            org["last_activity"] = start

        pid = slug(c.get("program") or "unnamed")
        program = org["programs"].setdefault(
            pid,
            {
                "id": pid,
                "name": (c.get("program") or "").strip(),
                "cycles": 0,
                "sample_cycles": 0,
                "hours": [],
                "funding": [],
                "sites": OrderedDict(),
                "last_cycle": None,
            },
        )
        program["cycles"] += 1
        program["sample_cycles"] += 1 if sample else 0
        program["hours"].append(c.get("course_hours"))
        program["funding"].append(c.get("funded_by"))
        if start > (program["last_cycle"] or ""):
            program["last_cycle"] = start

        facility = (c.get("facility") or "").strip()
        if facility:
            yard = (c.get("yard") or "").strip() or None
            sid = slug(f"{facility} {yard or ''}")
            site = program["sites"].setdefault(
                sid,
                {
                    "id": sid,
                    "facility": facility,
                    "facility_code": c.get("facility_code") or None,
                    "yard": yard,
                    "cycles": 0,
                },
            )
            site["cycles"] += 1

        # Whoever signed the most recent submission is the contact of record.
        # Imported sheet rows have no submitter, so this stays null until a real
        # form submission arrives.
        if c.get("submitter_email"):
            at = c.get("submitted_at") or start
            if not org["contact"] or at >= org["contact"]["_at"]:
                org["contact"] = {
                    "name": c.get("submitter_name") or None,
                    "email": c.get("submitter_email"),
                    "role": c.get("submitter_role") or None,
                    "_at": at,
                }

    if profiles:
        _fold_profiles(orgs, profiles)

    ranked = sorted(
        orgs.values(),
        key=lambda o: (-(o["cycles"] - o["sample_cycles"]), -o["cycles"], o["org"].lower()),
    )
    return [_finish(o) for o in ranked]


def _fold_profiles(orgs: OrderedDict[str, dict], profiles: dict[str, dict]) -> None:
    """Attach what a packet said about an organization to what its cycles say.

    A profile is allowed to *create* an organization that has filed no cycles —
    that is the case this exists for, an applicant with a packet and no ledger
    history — and it is allowed to fill in blanks. It is never allowed to
    overwrite a fact a signed cycle reported.
    """
    for key, record in profiles.items():
        entry = record.get("org") or {}
        name = (entry.get("legal_name") or "").strip()
        if not name:
            continue
        org = orgs.get(key)
        if org is None:
            org = orgs[key] = {
                "id": key,
                "org": name,
                "cycles": 0,
                "sample_cycles": 0,
                "programs": OrderedDict(),
                "contact": None,
                "last_activity": None,
            }
        org["legal_name"] = name
        if entry.get("dba"):
            org["_dba"] = entry["dba"]

        program = record.get("program") or {}
        grant = record.get("grant") or {}
        org["profile"] = {
            "updated_at": record.get("submitted_at"),
            "program": {
                k: program.get(k)
                for k in ("name", "summary", "delivery", "languages", "capacity", "frequency")
                if program.get(k)
            },
            "sites": [
                {"facility_code": s.get("facility_code"), "populations": s.get("populations") or []}
                for s in record.get("sites") or []
            ],
            "points": record.get("points") or {},
            "vendor_id": grant.get("vendor_id"),
            "funding_start": grant.get("funding_start"),
            "documents": len(record.get("documents") or []),
            "missing": record.get("missing") or [],
        }

        signatory = record.get("signatory") or {}
        if not org["contact"] and signatory.get("email"):
            org["contact"] = {
                "name": signatory.get("name"),
                "email": signatory["email"],
                "role": signatory.get("title"),
            }

        # A program named in the packet is a program this organization offers,
        # even with no cycles behind it yet. It is what the organizations page
        # offers to start a report from.
        pname = (program.get("name") or "").strip()
        if not pname:
            continue
        pid = slug(pname)
        prog = org["programs"].setdefault(
            pid,
            {
                "id": pid,
                "name": pname,
                "cycles": 0,
                "sample_cycles": 0,
                "hours": [],
                "funding": [],
                "sites": OrderedDict(),
                "last_cycle": None,
                "source": "packet",
            },
        )
        for site in record.get("sites") or []:
            facility = site.get("facility") or ""
            code = site.get("facility_code")
            if not facility:
                continue
            sid = slug(facility)
            prog["sites"].setdefault(
                sid,
                {
                    "id": sid,
                    "facility": facility,
                    "facility_code": code,
                    "yard": None,
                    "cycles": 0,
                    "source": "attachment-a",
                },
            )


def _finish(org: dict) -> dict:
    programs = []
    for p in org["programs"].values():
        programs.append(
            {
                **({"source": p["source"]} if p.get("source") else {}),
                "id": p["id"],
                "name": p["name"],
                "cycles": p["cycles"],
                "sample_cycles": p["sample_cycles"],
                "course_hours": mode(p["hours"]),
                "funded_by": mode(p["funding"]),
                "last_cycle": p["last_cycle"],
                "sites": sorted(
                    p["sites"].values(),
                    key=lambda s: (-s["cycles"], s["facility"], s["yard"] or ""),
                ),
            }
        )
    programs.sort(key=lambda p: (-p["cycles"], p["name"].lower()))

    contact = org["contact"]
    if contact:
        contact = {k: v for k, v in contact.items() if k != "_at"}

    real = org["cycles"] - org["sample_cycles"]
    extra = {}
    if org.get("legal_name") and org["legal_name"] != org["org"]:
        extra["legal_name"] = org["legal_name"]
    if org.get("_dba"):
        extra["dba"] = org["_dba"]
    if org.get("profile"):
        extra["profile"] = org["profile"]
    return {
        "id": org["id"],
        "org": org["org"],
        "cycles": org["cycles"],
        "sample_cycles": org["sample_cycles"],
        "real_cycles": real,
        # Everything we know about this organization came from rows marked SAMPLE
        # DATA. It must not be counted, and the registry says so rather than
        # dropping it — same rule the ledger follows.
        "sample_only": real == 0 and org["cycles"] > 0,
        "contact": contact,
        "last_activity": org["last_activity"],
        **extra,
        "programs": programs,
    }


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _read_previous() -> dict | None:
    try:
        return json.loads(INDEX.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def build() -> dict:
    cycles = load_ledger()
    profiles = load_profiles()
    orgs = derive(cycles, profiles)
    payload = {
        "schema": SCHEMA,
        "generated_at": _now(),
        "note": (
            "Derived from data/intake/seed.json plus every committed cycle by "
            "scripts/intake_profiles.py. Regenerated on every push — do not edit by hand. "
            "It exists so a returning submitter does not retype what the ledger already knows."
        ),
        "source_cycles": len(cycles),
        "source_profiles": len(profiles),
        "orgs": orgs,
    }

    # This file is rebuilt on every push. A timestamp that moves when nothing
    # else does would turn each of those into a commit, and CI would commit a
    # one-line diff forever. Keep the old stamp unless the content it describes
    # actually changed — the same reason cycles/index.json carries a null
    # updated_at instead of a fresh date.
    previous = _read_previous()
    if (
        previous
        and previous.get("orgs") == orgs
        and previous.get("source_cycles") == len(cycles)
        and previous.get("source_profiles") == len(profiles)
    ):
        payload["generated_at"] = previous.get("generated_at", payload["generated_at"])

    return payload


def write(payload: dict) -> Path:
    ORGS.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return INDEX


def main() -> int:
    payload = build()
    path = write(payload)
    orgs = payload["orgs"]
    programs = sum(len(o["programs"]) for o in orgs)
    sites = sum(len(p["sites"]) for o in orgs for p in o["programs"])
    print(
        f"{len(orgs)} organizations · {programs} programs · {sites} sites · "
        f"{payload['source_cycles']} cycles -> {path.relative_to(ROOT)}"
    )
    for o in orgs:
        flag = "  (sample only)" if o["sample_only"] else ""
        print(f"  {o['org'][:44]:<44} {o['real_cycles']:>3} real  {len(o['programs'])} program(s){flag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
