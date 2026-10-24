#!/usr/bin/env python3
"""Validate every committed cycle and rebuild data/intake/cycles/index.json.

Runs on any push that touches data/intake/. A malformed cycle fails the build
rather than silently disappearing from the ledger, because the manifest is the
only thing the static site reads.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CYCLES = ROOT / "data" / "intake" / "cycles"
INDEX = CYCLES / "index.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
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
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
