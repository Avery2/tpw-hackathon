#!/usr/bin/env python3
"""Turn a labelled GitHub issue into a committed cycle file.

The intake form opens a prefilled issue whose body contains a fenced JSON block
and an HTML marker. This script is the server that the static site does not have:
it finds the payload, validates it against data/intake/schema.json, writes
data/intake/cycles/<id>.json, and reports what happened.

Environment (set by .github/workflows/intake.yml):
  ISSUE_BODY    full issue body
  ISSUE_NUMBER  issue number, for the commit message
  GITHUB_OUTPUT optional path for step outputs
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CYCLES = ROOT / "data" / "intake" / "cycles"
INDEX = CYCLES / "index.json"
MARKER = "<!-- tpw-intake-payload -->"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from intake_validate import validate  # noqa: E402


def output(**kw) -> None:
    out = os.environ.get("GITHUB_OUTPUT")
    lines = []
    for k, v in kw.items():
        v = str(v).replace("\n", " ")
        lines.append(f"{k}={v}")
    text = "\n".join(lines)
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(text + "\n")
    print(text)


def extract(body: str) -> dict | None:
    """Accept a fenced JSON block, or a bare object pasted by hand."""
    if MARKER in body:
        body = body.split(MARKER, 1)[1]
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", body, re.S)
    candidate = match.group(1) if match else body.strip()
    if not candidate.startswith("{"):
        # Trim prose around a pasted object.
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            return None
        candidate = candidate[start : end + 1]
    return json.loads(candidate)


def rebuild_index() -> list[dict]:
    files = sorted(p.name for p in CYCLES.glob("*.json") if p.name != "index.json")
    entries = [{"file": f, "id": f[:-5]} for f in files]
    INDEX.write_text(
        json.dumps({"schema": "tpw.intake.index/1", "cycles": entries, "updated_at": None}, indent=2) + "\n",
        encoding="utf-8",
    )
    return entries


def main() -> int:
    body = os.environ.get("ISSUE_BODY", "")
    number = os.environ.get("ISSUE_NUMBER", "?")
    author = os.environ.get("ISSUE_AUTHOR", "")

    if MARKER not in body and "```json" not in body:
        output(ok="false", reason="not-a-submission", id="", detail="No intake payload found in the issue body.")
        return 0

    try:
        cycle = extract(body)
    except json.JSONDecodeError as e:
        output(ok="false", reason="bad-json", id="", detail=f"Could not parse the JSON payload: {e}")
        return 0

    if not cycle:
        output(ok="false", reason="bad-json", id="", detail="No fenced JSON block found.")
        return 0

    # Provenance: the issue author is the record of who filed it.
    cycle.setdefault("source", "intake")
    if author and isinstance(cycle.get("submitted_by"), dict):
        cycle["submitted_by"].setdefault("github", author)
    cycle["issue"] = number

    findings = validate(cycle)
    errors = [f for f in findings if f["level"] == "error"]
    if errors:
        detail = "; ".join(f"{f['field'] or '-'}: {f['message']}" for f in errors[:6])
        output(ok="false", reason="invalid", id=cycle.get("id", ""), detail=detail)
        print("\n".join(f"error {f['field']}: {f['message']}" for f in errors))
        return 0

    CYCLES.mkdir(parents=True, exist_ok=True)
    target = CYCLES / f"{cycle['id']}.json"
    target.write_text(json.dumps(cycle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    entries = rebuild_index()

    warnings = [f for f in findings if f["level"] != "error"]
    output(
        ok="true",
        reason="committed",
        id=cycle["id"],
        detail="; ".join(w["message"] for w in warnings[:4]),
        count=len(entries),
    )
    print(f"wrote {target.relative_to(ROOT)} ({len(entries)} cycles indexed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
