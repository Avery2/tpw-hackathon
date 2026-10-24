#!/usr/bin/env python3
"""Build the public-data layer for the TPW impact dataset.

Three public sources, all fetched fresh (cached under data/public/raw/):

1. CDCR "In Prison Programs Available by Location" (MAPIP)
   https://www.cdcr.ca.gov/rehabilitation/inprison/mapip/
   -> data/public/cdcr-grant-programs-by-institution.csv
   Institution x grant program x provider. This is the public, statewide
   equivalent of RIGHT 4.0 "Attachment A - Institution Locations & Populations"
   (RFA p. 12), minus capacity/population detail.

2. RIGHT 4.0 RFA, Attachment A grid (p. 30 of the PDF)
   -> data/public/cdcr-attachment-a-institutions.csv
   One row per institution: underserved flag + which population types the
   institution does NOT house (that is what the 'x' means per the legend).

3. thetpw.org/our-members (local mirror: work/raw/our-members/index.html)
   -> data/public/tpw-members.csv
   Member name + website, for joining provider names to TPW membership.

Usage:  python3 scripts/build_public_data.py
"""
from __future__ import annotations

import csv
import html
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "public"
RAW = OUT / "raw"
MAPIP_URL = "https://www.cdcr.ca.gov/rehabilitation/inprison/mapip/"
RFA_PDF = ROOT / "docs" / "RIGHT 4.0 RFA.pdf"
ATTACHMENT_A_PAGE = 30  # physical page in the bundled PDF


def fetch(url: str, cache: Path) -> str:
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        cache.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    return cache.read_text(encoding="utf-8", errors="ignore")


def strip_tags(text: str) -> str:
    text = re.sub(r"<(script|style).*?</\1>", "", text, flags=re.S)
    text = re.sub(r"<[^>]+>", "\n", text)
    return "\n".join(l.strip() for l in html.unescape(text).split("\n") if l.strip())


# ---------------------------------------------------------------- source 1: MAPIP
GRANT_TYPES = {
    "Victim Impact Grants",
    "Innovative Programming Grants",
    "California Reentry and Enrichment (CARE) Grants",
}

# MAPIP prints facility names without their codes; the rest of the world uses the
# code, so this is the join key across all three sources.
MAPIP_CODES = {
    "Avenal State Prison": "ASP",
    "CA Correctional Institution": "CCI",
    "CA Health Care Facility": "CHCF",
    "CA Institution for Men": "CIM",
    "CA Institution for Women": "CIW",
    "CA Medical Facility": "CMF",
    "CA Men’s Colony": "CMC",
    "CA Rehabilitation Center": "CRC",
    "CA State Prison, Corcoran": "COR",
    "CA State Prison, Los Angeles County": "LAC",
    "CA State Prison, Sacramento": "SAC",
    "CA State Prison, Solano": "SOL",
    "Calipatria State Prison": "CAL",
    "Centinela State Prison": "CEN",
    "Central CA Women’s Facility": "CCWF",
    "Correctional Training Facility": "CTF",
    "Folsom State Prison": "FSP",
    "High Desert State Prison": "HDSP",
    "Ironwood State Prison": "ISP",
    "Kern Valley State Prison": "KVSP",
    "Mule Creek State Prison": "MCSP",
    "North Kern State Prison": "NKSP",
    "Pelican Bay State Prison": "PBSP",
    "Pleasant Valley State Prison": "PVSP",
    "Richard J. Donovan Correctional Facility": "RJD",
    "Salinas Valley State Prison": "SVSP",
    "San Quentin Rehabilitation Center": "SQ",
    "Sierra Conservation Center": "SCC",
    "Substance Abuse Treatment Facility": "SATF",
    "Valley State Prison": "VSP",
    "Wasco State Prison": "WSP",
}


def parse_mapip(page: str) -> list[dict]:
    """Institutions are headings followed by a '▾' toggle; grant programs sit
    between the 'GRANT PROGRAMS' and 'OTHER PROGRAMS' markers."""
    lines = strip_tags(page).split("\n")
    rows: list[dict] = []
    i = 0
    while i < len(lines) - 1:
        if lines[i + 1] != "▾":  # not an institution heading
            i += 1
            continue
        institution, j, block = lines[i], i + 2, []
        while j < len(lines) and not (j + 1 < len(lines) and lines[j + 1] == "▾"):
            block.append(lines[j])
            j += 1
        code = MAPIP_CODES.get(institution, "")
        if "GRANT PROGRAMS" in block:
            start = block.index("GRANT PROGRAMS")
            end = block.index("OTHER PROGRAMS") if "OTHER PROGRAMS" in block else len(block)
            category = None
            for line in block[start + 1 : end]:
                if line in GRANT_TYPES:
                    category = line
                elif category:
                    rows.append({"facility_code": code, "institution": institution,
                                 "grant_program": category, "provider": line})
        i = j
    return rows


# ------------------------------------------------- source 2: Attachment A grid
def parse_attachment_a(pdf: Path) -> list[dict]:
    """The grid is positional: read word x-coords to find which columns carry an
    'x'. Per the legend, an 'x' means the location does NOT house that
    population type, so the GP column is blank for every institution."""
    xml = subprocess.run(
        ["pdftotext", "-f", str(ATTACHMENT_A_PAGE), "-l", str(ATTACHMENT_A_PAGE), "-bbox-layout", str(pdf), "-"],
        capture_output=True, text=True, check=True,
    ).stdout
    words = [
        (float(x), float(y), html.unescape(w))
        for x, y, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>(.*?)</word>', xml)
    ]
    rows: list[list] = []
    for x, y, w in sorted(words, key=lambda t: (t[1], t[0])):
        if rows and abs(rows[-1][0] - y) < 4:
            rows[-1][1].append((x, w))
        else:
            rows.append([y, [(x, w)]])

    columns = {"EOP": 409, "MHCB": 452, "RHU": 494}
    out: list[dict] = []
    for y, ws in rows:
        if not (250 <= y <= 640):
            continue
        name = " ".join(w for x, w in sorted(ws) if x < 340)
        if not name or not re.search(r"\([A-Z]{2,4}\)\s*\*?$", name):
            continue
        marks = [x for x, w in ws if w == "x" and x > 340]
        record = {
            "facility_code": re.search(r"\(([A-Z]{2,4})\)", name).group(1),
            "institution": name.replace("*", "").strip(),
            "underserved": "yes" if name.rstrip().endswith("*") else "no",
        }
        for col, cx in columns.items():
            has_x = any(abs(m - cx) < 12 for m in marks)
            record[f"houses_{col}"] = "no" if has_x else "yes"
        out.append(record)
    return out


# --------------------------------------------------------- source 3: TPW members
def parse_members(local_html: Path) -> list[dict]:
    page = local_html.read_text(encoding="utf-8", errors="ignore")
    seen, members = set(), []
    for href, text in re.findall(r'<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>', page, flags=re.S):
        name = re.sub(r"<[^>]+>", " ", text)
        name = re.sub(r"\s+", " ", html.unescape(name)).strip()
        if not name or href in seen:
            continue
        seen.add(href)
        members.append({"member": name, "website": href})
    return members


def normalize_org(name: str) -> str:
    """Loose org-name key: strip legal suffixes, punctuation, smart quotes, and
    'dba' aliases so CDCR's wording can be matched against TPW's member list."""
    name = (name.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
                .replace("–", "-").replace("—", "-"))
    name = name.split(" dba ")[0] if " dba " in name.lower() else name
    name = re.sub(r"\((?:formerly|fka|dba|d/b/a)[^)]*\)", "", name, flags=re.I)
    name = re.sub(r"\[[^\]]*\]", "", name)
    name = name.lower().replace("&", " and ")
    name = re.sub(r"\b(inc|incorporated|co|corp|corporation|llc|the)\b", " ", name)
    name = re.sub(r"[^a-z0-9 ]", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def match_members(providers: set[str], members: list[dict]) -> dict[str, str]:
    """Map provider name -> TPW member name when they are the same org."""
    index = {normalize_org(m["member"]): m["member"] for m in members}
    matched: dict[str, str] = {}
    for provider in sorted(providers):
        key = normalize_org(provider)
        if key in index:
            matched[provider] = index[key]
            continue
        for member_key, member_name in index.items():
            if re.search(rf"\b{re.escape(member_key)}\b", key) or re.search(rf"\b{re.escape(key)}\b", member_key):
                matched[provider] = member_name
                break
    return matched


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{path.relative_to(ROOT)}: {len(rows)} rows")


def main() -> int:
    mapip = [r for r in parse_mapip(fetch(MAPIP_URL, RAW / "cdcr-mapip.html"))
             if r["provider"] != "Provider Name"]
    att_a = parse_attachment_a(RFA_PDF)
    members = parse_members(ROOT / "work" / "raw" / "our-members" / "index.html")

    member_names = {m["member"].lower() for m in members}
    # Faceted matches plus a few providers whose MAPIP string hides the member name.
    alias = {
        "FACTS Education Fund": "Fair Chance Project",
        "FACTS Education Fund (DBA Fair Chance Project [FCP])": "Fair Chance Project",
        "Victims of Injustice DBA Life Support Alliance": "Life Support Alliance",
        "Commonweal / Humane Prison Hospice Project": "Humane Prison Hospice Project",
    }
    matched = match_members({r["provider"] for r in mapip}, members)
    for row in mapip:
        row["tpw_member"] = matched.get(row["provider"], alias.get(row["provider"], ""))

    form_names = {
        f["code"]: f["name"]
        for f in json.loads((ROOT / "data" / "intake" / "facilities.json").read_text())["facilities"]
    }
    mapip_names = {r["facility_code"]: r["institution"] for r in mapip}
    att_names = {r["facility_code"]: r["institution"] for r in att_a}
    crosswalk = [
        {
            "facility_code": code,
            "tpw_form_name": form_names.get(code, ""),
            "attachment_a_name": att_names.get(code, ""),
            "mapip_name": mapip_names.get(code, ""),
        }
        for code in sorted(set(form_names) | set(mapip_names) | set(att_names))
    ]

    write_csv(OUT / "cdcr-grant-programs-by-institution.csv", mapip,
              ["facility_code", "institution", "grant_program", "provider", "tpw_member"])
    write_csv(OUT / "cdcr-attachment-a-institutions.csv", att_a,
              ["facility_code", "institution", "underserved",
               "houses_EOP", "houses_MHCB", "houses_RHU"])
    write_csv(OUT / "facility-crosswalk.csv", crosswalk,
              ["facility_code", "tpw_form_name", "attachment_a_name", "mapip_name"])
    write_csv(OUT / "tpw-members.csv", members, ["member", "website"])

    institutions = {r["institution"] for r in mapip}
    providers = {r["provider"] for r in mapip}
    print(f"institutions with grant programs: {len(institutions)}; distinct providers: {len(providers)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
