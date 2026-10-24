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


def derive(cycles: list[dict]) -> list[dict]:
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

    ranked = sorted(
        orgs.values(),
        key=lambda o: (-(o["cycles"] - o["sample_cycles"]), -o["cycles"], o["org"].lower()),
    )
    return [_finish(o) for o in ranked]


def _finish(org: dict) -> dict:
    programs = []
    for p in org["programs"].values():
        programs.append(
            {
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
        "programs": programs,
    }


def build() -> dict:
    cycles = load_ledger()
    orgs = derive(cycles)
    return {
        "schema": SCHEMA,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "note": (
            "Derived from data/intake/seed.json plus every committed cycle by "
            "scripts/intake_profiles.py. Regenerated on every push — do not edit by hand. "
            "It exists so a returning submitter does not retype what the ledger already knows."
        ),
        "source_cycles": len(cycles),
        "orgs": orgs,
    }


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
