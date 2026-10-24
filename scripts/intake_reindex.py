#!/usr/bin/env python3
"""Validate every committed cycle, rebuild the manifest, rebuild the registry.

Runs on any push that touches data/intake/. A malformed cycle fails the build
rather than silently disappearing from the ledger, because the manifest is the
only thing the static site reads.

The organization registry in data/intake/orgs/ is rebuilt on the same pass, so
it is never a hand-maintained fact that can go stale against the ledger.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CYCLES = ROOT / "data" / "intake" / "cycles"
INDEX = CYCLES / "index.json"
RECORDS = ROOT / "data" / "intake" / "records"
RECORDS_INDEX = RECORDS / "index.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from intake_profiles import build as build_profiles, write as write_profiles  # noqa: E402
from intake_simple import validate_record  # noqa: E402
from standard_rollup import build as build_rollup, write as write_rollup  # noqa: E402
from intake_validate import validate  # noqa: E402


def main() -> int:
    files = sorted(p for p in CYCLES.glob("*.json") if p.name != "index.json")
    entries: list[dict] = []
    failures = 0

    for path in files:
        try:
            cycle = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"[FAIL] {path.name}: not JSON ({e})")
            failures += 1
            continue

        findings = validate(cycle)
        errors = [f for f in findings if f["level"] == "error"]
        for f in findings:
            mark = "error" if f["level"] == "error" else f["level"]
            print(f"    {mark:<6} {f['field'] or f.get('code') or '-'}: {f['message']}")

        if cycle.get("id") != path.stem:
            print(f"[FAIL] {path.name}: id '{cycle.get('id')}' does not match the filename")
            errors.append({"message": "id/filename mismatch"})

        if errors:
            print(f"[FAIL] {path.name}")
            failures += 1
        else:
            print(f"[ok]   {path.name}")
            entries.append({"file": path.name, "id": path.stem})

    index = {
        "schema": "tpw.intake.index/1",
        "cycles": entries,
        "updated_at": None,
    }
    INDEX.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(entries)} indexed, {failures} failing")

    # Quick-form entries live beside the cycles, one folder per kind.
    quick: list[dict] = []
    for path in sorted(RECORDS.glob("*/*.json")):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"[FAIL] {path.name}: not JSON ({e})")
            failures += 1
            continue
        findings = validate_record(record)
        if findings:
            print(f"[FAIL] {path.parent.name}/{path.name}")
            for f in findings:
                print(f"    error  {f['field'] or '-'}: {f['message']}")
            failures += 1
            continue
        print(f"[ok]   {path.parent.name}/{path.name}")
        quick.append({"kind": path.parent.name, "id": path.stem, "file": f"{path.parent.name}/{path.name}"})

    RECORDS_INDEX.write_text(
        json.dumps({"schema": "tpw.records.index/1", "records": quick, "updated_at": None}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{len(quick)} quick entries indexed")

    rollup = build_rollup()
    path = write_rollup(rollup)
    c = rollup["counts"]
    print(
        f"{c['sessions']} sessions rolled up into {c['periods']} periods "
        f"({c['participants']} participants) -> {path.relative_to(ROOT)}"
    )

    # The registry is derived from the ledger, so it is rebuilt whether or not a
    # cycle failed: a profile is a convenience, and a bad cycle must not leave
    # returning submitters without last quarter's answers.
    profiles = build_profiles()
    path = write_profiles(profiles)
    orgs = profiles["orgs"]
    print(
        f"{len(orgs)} organization profiles rebuilt "
        f"({sum(len(o['programs']) for o in orgs)} programs) -> {path.relative_to(ROOT)}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
