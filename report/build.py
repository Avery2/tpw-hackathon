#!/usr/bin/env python3
"""
build.py -- TPW Collective Impact Report 2026 (print prototype)

Stdlib only. Reads ../data/tpw-collective-impact.csv, cleans it, computes the
defensible aggregate, hand-authors inline SVG figures, emits one self-contained
report.html (inline CSS, base64 PNG logos, zero external references) and prints
it to US-Letter PDF with headless Chrome.

    python3 report/build.py

PAGE PLAN (the requested report/work/02-spec.md was absent at build time; this
plan was authored from report/work/01-facts.md and the task brief):

   01  Cover (dark)
   02  Contents / About this report / evidence classes
   03  Executive summary
   04  The ask in the state's words (RFA s.16)            fig 1  have-vs-need matrix
   05  The money and the rules (s.4 s.9 s.11)
   06  Coverage: 14 of 31 institutions                     fig 2  31-institution dot grid
   07  What the sheet holds                                fig 3  row-accounting funnel
   08  The defensible core                                 fig 4  hours by facility (stacked)
   09  Completion                                          fig 5  rate dumbbell vs benchmark
   10  Hours are a floor                                   fig 6  delivered vs ceiling
   11  Data-quality ledger (D1-D16)
   12  The missing join key (RFA s.15)                     fig 7  linkage diagram
   13  A model, not a finding                              fig 8  modelled outcome panel
   14  From 1,261 starts to zero outcomes                  fig 9  evidence-chain waterfall
   15  What we would build next
   16  Colophon (dark)

Every figure in the output is either (a) computed here from the CSV, (b) quoted
verbatim from the facts inventory, or (c) explicitly labelled a model/scenario.
"""

import base64
import csv
import json
import os
import subprocess
import sys
from collections import OrderedDict, defaultdict
from statistics import mean, median
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CSV_PATH = os.path.join(REPO, "data", "tpw-collective-impact.csv")
FAC_PATH = os.path.join(REPO, "data", "intake", "facilities.json")
HTML_PATH = os.path.join(HERE, "report.html")
PDF_PATH = os.path.join(HERE, "TPW-Collective-Impact-Report-2026.pdf")
LOGO_LIGHT = os.path.join(HERE, "assets", "tpw-logo-color-c.png")
LOGO_DARK = os.path.join(HERE, "assets", "tpw-logo-reverse-c.png")

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

MISSING = {"", "TBD", "#VALUE!", "#N/A", "N/A"}

FG = "#111111"
PAPER = "#FAF7F2"
GOLD = "#F4C963"
GREEN = "#66C184"
DEEP = "#0E0E0E"

# --------------------------------------------------------------------------
# tiny helpers
# --------------------------------------------------------------------------


def esc(s):
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def norm(s):
    return (s or "").replace("\u2019", "'").replace("\u00a0", " ").strip()


def num(x):
    """Coerce a spreadsheet cell. Blank / TBD / #VALUE! -> None (never 0)."""
    x = norm(x)
    if x in MISSING:
        return None
    try:
        return int(float(x))
    except ValueError:
        return None


def nfmt(n):
    return f"{n:,}"


def pct(a, b, dp=1):
    return f"{(a / b * 100):.{dp}f}%"


def clip(text, n):
    text = text.strip()
    return text if len(text) <= n else text[: n - 1].rstrip(" ,") + "\u2026"


def parse_date(s):
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return __import__("datetime").datetime.strptime(norm(s), fmt)
        except ValueError:
            pass
    return None


# Facility display names. Keys are exact CSV values with curly quotes normalised.
FAC_SHORT = {
    "Avenal State Prison (ASP)": ("ASP", "Avenal State Prison"),
    "California Correctional Institution (CCI)": ("CCI", "California Correctional Institution"),
    "Kern Valley State Prison (KVSP)": ("KVSP", "Kern Valley State Prison"),
    "Correctional Training Facility (CTF)": ("CTF", "Correctional Training Facility"),
    "San Quentin Rehabilitation Center (SQ)": ("SQ", "San Quentin Rehabilitation Center"),
    "California State Prison, Los Angeles County (LAC)": ("LAC", "California State Prison, Los Angeles County"),
    "California Institution for Women (CIW)": ("CIW", "California Institution for Women"),
    "Valley State Prison (VSP)": ("VSP", "Valley State Prison"),
    "Mule Creek State Prison (MCSP)": ("MCSP", "Mule Creek State Prison"),
    "California Medical Facility (CMF)": ("CMF", "California Medical Facility"),
    "Richard J. Donovan Correctional Facility (RJD)": ("RJD", "Richard J. Donovan Correctional Facility"),
    "Salinas Valley State Prison (SVSP)": ("SVSP", "Salinas Valley State Prison"),
    "Substance Abuse Treatment Facility and State Prison, Corcoran (SATF-CSP, Corcoran)": (
        "SATF",
        "Substance Abuse Treatment Facility, Corcoran",
    ),
    "Central California Women's Facility (CCWF)": ("CCWF", "Central California Women's Facility"),
}

WOMENS = {"CIW", "CCWF"}

ORG_ORDER = ["Defy Ventures", "GRIP Training Institute"]
ORG_COLOR = {"Defy Ventures": GOLD, "GRIP Training Institute": GREEN}


# --------------------------------------------------------------------------
# 1. load + clean + aggregate
# --------------------------------------------------------------------------


def load():
    with open(CSV_PATH, newline="", encoding="utf-8") as fh:
        raw = list(csv.reader(fh))
    header, body = raw[0], raw[1:]

    def phantom(r):
        return (
            not any(norm(c) for c in r[:10])
            and not any(norm(c) for c in r[11:])
            and norm(r[10]) == "0"
        )

    phantoms = [r for r in body if phantom(r)]
    fac_rows = [r for r in body if norm(r[0])]
    sample_rows = [r for r in fac_rows if norm(r[12]).upper() == "SAMPLE DATA"]
    empty_rows = [
        r
        for r in fac_rows
        if not any(norm(r[i]) for i in (5, 6, 7, 8, 9))
        and norm(r[12]).upper() != "SAMPLE DATA"
    ]
    inprog = [r for r in fac_rows if norm(r[4]) == "In Progress"]
    tbd = [
        r
        for r in fac_rows
        if norm(r[4]) == "Completed"
        and norm(r[12]).upper() != "SAMPLE DATA"
        and num(r[9]) is None
    ]

    def defensible(r):
        return (
            norm(r[4]) == "Completed"
            and all(num(r[i]) is not None for i in (7, 8, 9))
            and norm(r[12]).upper() != "SAMPLE DATA"
        )

    D = [r for r in fac_rows if defensible(r)]

    def rec(r):
        code, short = FAC_SHORT[norm(r[0])]
        return {
            "raw": r,
            "facility": norm(r[0]),
            "code": code,
            "short": short,
            "yard": norm(r[1]),
            "org": norm(r[2]),
            "program": norm(r[3]),
            "status": norm(r[4]),
            "start": parse_date(r[5]),
            "end": parse_date(r[6]),
            "course_h": num(r[7]),
            "participants": num(r[8]),
            "completions": num(r[9]),
            "ph": num(r[10]),
            "year": norm(r[11]),
        }

    recs = [rec(r) for r in D]

    # integrity checks on the raw file
    mism = [x for x in recs if x["ph"] != x["completions"] * x["course_h"]]
    if mism:
        raise SystemExit(f"L = J*H mismatch on {len(mism)} rows")
    over = [x for x in recs if x["completions"] > x["participants"]]
    if over:
        raise SystemExit("completions exceed starts on some row")

    tot = lambda k: sum(x[k] for x in recs)
    participants, completions = tot("participants"), tot("completions")
    course_hours, ph = tot("course_h"), tot("ph")
    ceiling = sum(x["participants"] * x["course_h"] for x in recs)

    fac = OrderedDict()
    for x in recs:
        f = fac.setdefault(
            x["code"],
            {
                "code": x["code"],
                "short": x["short"],
                "name": x["facility"],
                "cycles": 0,
                "participants": 0,
                "completions": 0,
                "course_h": 0,
                "ph": 0,
                "by_org": defaultdict(int),
                "orgs": set(),
            },
        )
        f["cycles"] += 1
        f["participants"] += x["participants"]
        f["completions"] += x["completions"]
        f["course_h"] += x["course_h"]
        f["ph"] += x["ph"]
        f["by_org"][x["org"]] += x["ph"]
        f["orgs"].add(x["org"])
    fac = list(fac.values())
    for f in fac:
        f["rate"] = f["completions"] / f["participants"] * 100
        f["single"] = f["participants"] > 0 and f["cycles"] == 1
    fac_by_parts = sorted(fac, key=lambda f: (-f["participants"], f["code"]))
    fac_by_rate = sorted(fac, key=lambda f: (-f["rate"], f["code"]))

    years = OrderedDict()
    for y in ("2024", "2025"):
        Y = [x for x in recs if x["year"] == y]
        years[y] = {
            "cycles": len(Y),
            "participants": sum(x["participants"] for x in Y),
            "completions": sum(x["completions"] for x in Y),
            "ph": sum(x["ph"] for x in Y),
            "rate": sum(x["completions"] for x in Y) / sum(x["participants"] for x in Y) * 100,
        }

    orgs = OrderedDict()
    for name in ORG_ORDER:
        O = [x for x in recs if x["org"] == name]
        orgs[name] = {
            "cycles": len(O),
            "participants": sum(x["participants"] for x in O),
            "completions": sum(x["completions"] for x in O),
            "ph": sum(x["ph"] for x in O),
            "rate": sum(x["completions"] for x in O) / sum(x["participants"] for x in O) * 100,
            "program": O[0]["program"] if O else "",
            "course_h": O[0]["course_h"] if O else 0,
        }

    durations = [(x["end"] - x["start"]).days for x in recs if x["start"] and x["end"]]

    with open(FAC_PATH, encoding="utf-8") as fh:
        all_fac = json.load(fh)["facilities"]

    s = {
        "header": header,
        "lines": len(raw),
        "body": len(body),
        "phantoms": len(phantoms),
        "fac_rows": len(fac_rows),
        "sample_rows": len(sample_rows),
        "empty_rows": len(empty_rows),
        "inprog": len(inprog),
        "tbd": len(tbd),
        "real_cycles": len(fac_rows) - len(sample_rows) - len(empty_rows),
        "defensible": len(recs),
        "recs": recs,
        "participants": participants,
        "completions": completions,
        "course_hours": course_hours,
        "ph": ph,
        "ceiling": ceiling,
        "gap": ceiling - ph,
        "gap_pct": (ceiling - ph) / ceiling * 100,
        "delivered_pct": ph / ceiling * 100,
        "rate": completions / participants * 100,
        "phcm": ph / completions,
        "per_cycle_parts": participants / len(recs),
        "per_cycle_comp": completions / len(recs),
        "durations": {
            "n": len(durations),
            "min": min(durations),
            "median": median(durations),
            "mean": round(mean(durations)),
            "max": max(durations),
        },
        "fac": fac,
        "fac_by_parts": fac_by_parts,
        "fac_by_rate": fac_by_rate,
        "years": years,
        "orgs": orgs,
        "all_fac": all_fac,
        "blank_yards": sum(1 for r in fac_rows if not norm(r[1])),
        "end_2026": sum(1 for x in recs if x["end"] and x["end"].year == 2026),
        "max_end": max(x["end"] for x in recs if x["end"]),
        "prog_years": sorted({x["year"] for x in recs if x["year"]}),
        "n_orgs": len({x["org"] for x in recs}),
        "n_programs": len({x["program"] for x in recs}),
        "covered_codes": {x["code"] for x in recs},
    }

    # ---- assertions against the verified facts inventory (fail loudly) ----
    checks = [
        (s["lines"], 104, "physical lines"),
        (s["body"], 103, "body rows"),
        (s["phantoms"], 66, "phantom rows"),
        (s["fac_rows"], 37, "facility rows"),
        (s["defensible"], 31, "defensible cycles"),
        (s["participants"], 1261, "participants"),
        (s["completions"], 739, "completions"),
        (s["course_hours"], 4376, "sum course hours"),
        (s["ph"], 103064, "participant hours"),
        (s["ceiling"], 182984, "hour ceiling"),
        (s["gap"], 79920, "hour gap"),
        (s["n_orgs"], 2, "organisations"),
        (len(fac), 14, "facilities"),
        (len(all_fac), 31, "CA prison constants"),
        (round(s["rate"], 1), 58.6, "completion rate"),
    ]
    for got, want, label in checks:
        if got != want:
            raise SystemExit(f"FACT CHECK FAILED: {label}: got {got!r}, expected {want!r}")
    return s


# --------------------------------------------------------------------------
# 2. hand-authored SVG figures
# --------------------------------------------------------------------------


def svg(w, h, body, label):
    return (
        f'<svg class="chart" viewBox="0 0 {w} {h}" preserveAspectRatio="xMinYMin meet" '
        f'role="img" aria-label="{esc(label)}">{body}</svg>'
    )


def chart_have_need(s):
    """Fig 1 -- what the state requires vs. what the sheet captures."""
    rows = [
        ("Expenditures", 1, "no"),
        ("Institution", 1, "yes"),
        ("Number of participants", 1, "yes"),
        ("Populations served", 1, "half"),
        ("Program / curriculum", 0, "yes"),
        ("Course hours per participant", 0, "yes"),
        ("Completions", 0, "yes"),
        ("Program year", 0, "yes"),
        ("Cycle duration", 0, "yes"),
        ("Participant identifier", 0, "no"),
        ("Demographics", 0, "no"),
        ("Outcome / incident data", 0, "no"),
    ]
    W, RH, TOP = 780, 29, 60
    H = TOP + RH * len(rows) + 62
    cx1, cx2 = 452, 646
    o = []
    o.append(
        f'<text class="c-head" x="{cx1}" y="18" text-anchor="middle">RFA \u00a716</text>'
        f'<text class="c-head" x="{cx1}" y="32" text-anchor="middle">requires</text>'
        f'<text class="c-head" x="{cx2}" y="18" text-anchor="middle">Collective Impact</text>'
        f'<text class="c-head" x="{cx2}" y="32" text-anchor="middle">sheet has</text>'
    )
    for i, (label, required, state) in enumerate(rows):
        y = TOP + i * RH
        absent_required = required and state == "no"
        if absent_required:
            o.append(
                f'<rect x="-6" y="{y - 4}" width="772" height="{RH - 1}" fill="{GOLD}" opacity="0.16"/>'
            )
        o.append(
            f'<line x1="0" y1="{y + RH - 6}" x2="760" y2="{y + RH - 6}" '
            f'stroke="#111" stroke-opacity="0.10" stroke-width="1"/>'
            f'<text class="c-lbl" x="0" y="{y + 15}">{esc(label)}</text>'
        )

        def mark(cx, present):
            cy = y + 10
            if present == "yes":
                return f'<circle cx="{cx}" cy="{cy}" r="6.6" fill="{GREEN}"/>'
            if present == "half":
                return (
                    f'<circle cx="{cx}" cy="{cy}" r="6.6" fill="{GOLD}"/>'
                    f'<path d="M {cx} {cy - 6.6} A 6.6 6.6 0 0 0 {cx} {cy + 6.6} Z" fill="none"/>'
                    f'<line x1="{cx}" y1="{cy - 6.6}" x2="{cx}" y2="{cy + 6.6}" stroke="#111" stroke-width="1.1"/>'
                )
            return (
                f'<circle cx="{cx}" cy="{cy}" r="6.2" fill="none" stroke="#111" '
                f'stroke-opacity="0.38" stroke-width="1.3"/>'
            )

        if required:
            o.append(mark(cx1, "yes"))
        else:
            o.append(f'<text class="c-dash" x="{cx1}" y="{y + 14}" text-anchor="middle">\u00b7</text>')
        o.append(mark(cx2, state))

    ly = TOP + RH * len(rows) + 26
    o.append(
        f'<circle cx="6" cy="{ly - 4}" r="6" fill="{GREEN}"/>'
        f'<text class="c-sm" x="20" y="{ly}">field present</text>'
        f'<circle cx="140" cy="{ly - 4}" r="6" fill="{GOLD}"/>'
        f'<text class="c-sm" x="154" y="{ly}">inferable only</text>'
        f'<circle cx="278" cy="{ly - 4}" r="5.6" fill="none" stroke="#111" stroke-opacity="0.38" stroke-width="1.3"/>'
        f'<text class="c-sm" x="292" y="{ly}">absent</text>'
        f'<text class="c-sm" x="760" y="{ly}" text-anchor="end">2 of 4 required fields are missing</text>'
    )
    return svg(W, H, "".join(o), "Matrix comparing the four RFA section 16 reporting fields with the fields in the Collective Impact sheet")


def chart_coverage(s):
    """Fig 2 -- dot grid of the 31 CDCR institutions."""
    covered = {f["code"]: f for f in s["fac_by_parts"]}
    allf = s["all_fac"]
    order = [f["code"] for f in s["fac_by_parts"]] + [
        f["code"] for f in allf if f["code"] not in covered
    ]
    cols, x0, dx, y0, dy, r = 8, 44, 93, 62, 74, 21
    o = [
        '<text class="c-head" x="0" y="18">31 CDCR institutions</text>',
        f'<text class="c-head" x="780" y="18" text-anchor="end">'
        f'{len(covered)} with a defensible cycle \u00b7 {31 - len(covered)} with none</text>',
    ]
    for i, code in enumerate(order):
        cx = x0 + (i % cols) * dx
        cy = y0 + (i // cols) * dy
        f = covered.get(code)
        women = code in WOMENS
        if women:
            o.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r + 5}" fill="none" stroke="{GOLD}" stroke-width="2.4"/>'
            )
        if f:
            o.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{GREEN}"/>'
                f'<text class="c-dot" x="{cx}" y="{cy - 1}" text-anchor="middle">{code}</text>'
                f'<text class="c-dot2" x="{cx}" y="{cy + 13}" text-anchor="middle">'
                f'{f["cycles"]} cyc \u00b7 {f["participants"]}</text>'
            )
        else:
            o.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{PAPER}" stroke="#111" '
                f'stroke-opacity="0.22" stroke-width="1.2"/>'
                f'<text class="c-dot3" x="{cx}" y="{cy + 4}" text-anchor="middle">{code}</text>'
            )
    ly = y0 + ((len(order) - 1) // cols) * dy + 58
    o.append(
        f'<circle cx="10" cy="{ly - 4}" r="7" fill="{GREEN}"/>'
        f'<text class="c-sm" x="26" y="{ly}">at least one defensible cycle (n = {len(covered)})</text>'
        f'<circle cx="330" cy="{ly - 4}" r="7" fill="{PAPER}" stroke="#111" stroke-opacity="0.22"/>'
        f'<text class="c-sm" x="346" y="{ly}">no row in the dataset (n = {31 - len(covered)})</text>'
        f'<circle cx="640" cy="{ly - 4}" r="10" fill="none" stroke="{GOLD}" stroke-width="2.4"/>'
        f'<text class="c-sm" x="658" y="{ly}">women\u2019s facility</text>'
    )
    return svg(780, ly + 18, "".join(o), "Dot grid of the 31 California state prisons, 14 with at least one defensible program cycle and 17 with none")


def chart_funnel(s):
    """Fig 3 -- how 104 physical lines become 31 defensible cycles."""
    steps = [
        ("Physical lines in the file", 104, None, False),
        ("Header row", None, -1, True),
        ("Phantom formula rows", None, -66, True),
        ("Rows carrying a facility name", 37, None, False),
        ("SAMPLE DATA row", None, -1, True),
        ("Row with no data at all", None, -1, True),
        ("Real program cycles", 35, None, False),
        ("In Progress rows (submission rule)", None, -3, True),
        ("Completed cycle, completions TBD", None, -1, True),
        ("Defensible cycles", 31, None, "final"),
    ]
    W, RH, TOP = 780, 32, 54
    H = TOP + RH * len(steps) + 30
    x0, xmax = 262, 636
    scale = (xmax - x0) / 104.0
    o = [
        '<text class="c-head" x="0" y="16">CSV line accounting</text>',
        f'<text class="c-head" x="780" y="16" text-anchor="end">count</text>',
    ]
    prev = None
    for i, (label, val, delta, kind) in enumerate(steps):
        y = TOP + i * RH
        barmid = y + 7
        if delta is None:
            cur = val
            frac = cur / 104.0
            fill = GREEN if kind == "final" else "#111"
            op = 0.92 if kind != "final" else 1.0
            o.append(
                f'<rect x="{x0}" y="{y - 2}" width="{cur * scale:.2f}" height="18" fill="{fill}" opacity="{op}"/>'
                f'<text class="c-num" x="760" y="{barmid + 5}" text-anchor="end">{cur}</text>'
            )
            if kind == "final":
                o.append(
                    f'<text class="c-inv" x="{x0 + 10}" y="{barmid + 4}">defensible set</text>'
                )
            prev = cur
        else:
            new = prev + delta
            xx = x0 + new * scale
            ww = abs(delta) * scale
            o.append(
                f'<rect x="{xx:.2f}" y="{y - 2}" width="{ww:.2f}" height="18" fill="{GOLD}" opacity="0.95"/>'
                f'<text class="c-goldnum" x="760" y="{barmid + 5}" text-anchor="end">{delta}</text>'
            )
            if ww < 26:
                o.append(
                    f'<line x1="{xx + ww + 4:.2f}" y1="{barmid}" x2="{xx + ww + 14:.2f}" y2="{barmid}" '
                    f'stroke="#111" stroke-opacity="0.25"/>'
                )
            prev = new
        cls = "c-lbl" if delta is not None else "c-lbl"
        o.append(f'<text class="{cls}" x="0" y="{barmid + 4}">{esc(label)}</text>')
    o.append(
        f'<line x1="{x0}" y1="{TOP - 8}" x2="{x0}" y2="{TOP + RH * len(steps) - 8}" stroke="#111" stroke-opacity="0.18"/>'
    )
    o.append(
        f'<text class="c-sm" x="0" y="{H - 8}">Gold = rows removed at this step. '
        f'Counting rows naively overstates cycles by 3.4\u00d7 (104 \u00f7 31).</text>'
    )
    return svg(W, H, "".join(o), "Waterfall from 104 physical CSV lines down to 31 defensible program cycles")


def chart_hours_by_facility(s):
    """Fig 4 -- participant hours delivered by facility, stacked by organisation."""
    rows = sorted(s["fac"], key=lambda f: -f["ph"])
    W, RH, TOP = 780, 27, 62
    H = TOP + RH * len(rows) + 44
    x0, xmax = 344, 664
    vmax = max(f["ph"] for f in rows)
    scale = (xmax - x0) / vmax
    o = [
        '<text class="c-head" x="0" y="14">Facility</text>',
        '<text class="c-head" x="780" y="14" text-anchor="end">participant-hours</text>',
        f'<rect x="344" y="24" width="10" height="10" fill="{GOLD}"/>',
        '<text class="c-sm" x="360" y="33">Defy Ventures</text>',
        f'<rect x="470" y="24" width="10" height="10" fill="{GREEN}"/>',
        '<text class="c-sm" x="486" y="33">GRIP Training Institute</text>',
        f'<text class="c-sm" x="780" y="33" text-anchor="end">cycle count in grey</text>',
    ]
    for i, f in enumerate(rows):
        y = TOP + i * RH
        o.append(
            f'<line x1="0" y1="{y + RH - 7}" x2="780" y2="{y + RH - 7}" stroke="#111" stroke-opacity="0.08"/>'
            f'<text class="c-code" x="0" y="{y + 12}">{f["code"]}</text>'
            f'<text class="c-fac" x="52" y="{y + 12}">{esc(clip(f["short"], 40))}</text>'
            f'<text class="c-tiny" x="330" y="{y + 12}" text-anchor="end">\u00d7{f["cycles"]}</text>'
        )
        xx = x0
        for org in ORG_ORDER:
            v = f["by_org"].get(org, 0)
            if not v:
                continue
            w = v * scale
            o.append(
                f'<rect x="{xx:.2f}" y="{y}" width="{max(w - 1.6, 0.8):.2f}" height="15" '
                f'fill="{ORG_COLOR[org]}"/>'
            )
            xx += w
        o.append(
            f'<text class="c-num" x="780" y="{y + 12}" text-anchor="end">{nfmt(f["ph"])}</text>'
        )
    o.append(
        f'<text class="c-sm" x="0" y="{H - 10}">Bars are participant-hours actually credited (completions \u00d7 course hours). '
        f'Ordered by hours, not by rate.</text>'
    )
    return svg(W, H, "".join(o), "Horizontal stacked bars of participant hours delivered at each of 14 facilities, split between two organisations")


def chart_completion(s):
    """Fig 5 -- completion rate per facility against the 58.6% benchmark."""
    rows = s["fac_by_rate"]
    W, RH, TOP = 780, 31, 54
    H = TOP + RH * len(rows) + 52
    x0, x1 = 292, 690
    scale = (x1 - x0) / 100.0
    bench = s["rate"]
    bx = x0 + bench * scale
    o = ['<text class="c-head" x="0" y="16">Facility \u00b7 cycles</text>']
    for t in (0, 25, 50, 75, 100):
        x = x0 + t * scale
        o.append(
            f'<line x1="{x:.1f}" y1="{TOP - 8}" x2="{x:.1f}" y2="{TOP + RH * len(rows) - 10}" '
            f'stroke="#111" stroke-opacity="0.09"/>'
            f'<text class="c-axis" x="{x:.1f}" y="{TOP - 16}" text-anchor="middle">{t}%</text>'
        )
    o.append(
        f'<line x1="{bx:.1f}" y1="{TOP - 10}" x2="{bx:.1f}" y2="{TOP + RH * len(rows) - 10}" '
        f'stroke="{GOLD}" stroke-width="2"/>'
        f'<text class="c-goldhead" x="{bx + 6:.1f}" y="{TOP - 16}">benchmark 58.6%</text>'
    )
    for i, f in enumerate(rows):
        y = TOP + i * RH
        doty = y + 9
        fx = x0 + f["rate"] * scale
        o.append(
            f'<line x1="{min(bx, fx):.1f}" y1="{doty}" x2="{max(bx, fx):.1f}" y2="{doty}" '
            f'stroke="#111" stroke-opacity="0.28" stroke-width="1.2"/>'
            f'<text class="c-code" x="0" y="{doty + 4}">{f["code"]}</text>'
            f'<text class="c-tiny" x="74" y="{doty + 4}">{f["cycles"]} cyc \u00b7 n={f["participants"]}'
            f'{"  *" if f["single"] else ""}</text>'
            f'<circle cx="{bx:.1f}" cy="{doty}" r="3.6" fill="{GOLD}"/>'
            f'<circle cx="{fx:.1f}" cy="{doty}" r="6.4" fill="{GREEN}"/>'
            f'<text class="c-num" x="760" y="{doty + 4}" text-anchor="end">{f["rate"]:.1f}%</text>'
        )
    o.append(
        f'<text class="c-sm" x="0" y="{H - 22}">* single cycle: a rate, not yet a pattern. '
        f'The benchmark is the pooled rate for all 31 cycles.</text>'
        f'<text class="c-sm" x="0" y="{H - 8}">Bars run from the facility rate to the benchmark; '
        f'the gold dot is the benchmark, the green dot the facility.</text>'
    )
    return svg(W, H, "".join(o), "Dumbbell chart of completion rate at each facility against the 58.6 percent pooled benchmark")


def chart_floor(s):
    """Fig 6 -- delivered hours versus the mathematical ceiling."""
    W, H = 780, 292
    x0, x1, y, h = 18, 762, 96, 74
    span = x1 - x0
    scale = span / s["ceiling"]
    w1 = s["ph"] * scale
    o = [
        '<defs><pattern id="hatchFloor" width="7" height="7" patternUnits="userSpaceOnUse" '
        'patternTransform="rotate(45)">'
        f'<rect width="7" height="7" fill="{GOLD}" opacity="0.22"/>'
        f'<line x1="0" y1="0" x2="0" y2="7" stroke="{GOLD}" stroke-width="2.4"/></pattern></defs>',
        '<text class="c-head" x="0" y="20">If every starter finished every hour</text>',
        f'<text class="c-head" x="780" y="20" text-anchor="end">{nfmt(s["ceiling"])} h \u00b7 ceiling</text>',
        f'<rect x="{x0}" y="{y}" width="{w1:.2f}" height="{h}" fill="{GREEN}"/>',
        f'<rect x="{x0 + w1:.2f}" y="{y}" width="{span - w1:.2f}" height="{h}" fill="url(#hatchFloor)" '
        f'stroke="{GOLD}" stroke-width="1"/>',
        f'<text class="c-invbig" x="{x0 + 16}" y="{y + 30}">{nfmt(s["ph"])} h delivered</text>',
        f'<text class="c-inv" x="{x0 + 16}" y="{y + 50}">{s["delivered_pct"]:.1f}% of the ceiling \u00b7 739 completers</text>',
        f'<text class="c-goldbig" x="{x0 + w1 + 16:.2f}" y="{y + 30}">{nfmt(s["gap"])} h never delivered</text>',
        f'<text class="c-sm" x="{x0 + w1 + 16:.2f}" y="{y + 50}">{s["gap_pct"]:.1f}% \u00b7 522 starters who did not finish</text>',
        # scale
        f'<line x1="{x0}" y1="{y + h + 18}" x2="{x1}" y2="{y + h + 18}" stroke="#111" stroke-opacity="0.3"/>',
    ]
    for t in (0, 50000, 100000, 150000):
        xt = x0 + t * scale
        o.append(
            f'<line x1="{xt:.1f}" y1="{y + h + 13}" x2="{xt:.1f}" y2="{y + h + 23}" stroke="#111" stroke-opacity="0.3"/>'
            f'<text class="c-axis" x="{xt:.1f}" y="{y + h + 38}" text-anchor="middle">{t // 1000}k</text>'
        )
    o.append(
        f'<text class="c-axis" x="{x1}" y="{y + h + 38}" text-anchor="end">183k</text>'
        f'<text class="c-head" x="0" y="{H - 46}">How the ceiling is built</text>'
        f'<text class="c-sm" x="0" y="{H - 26}">'
        f'\u03a3 (participants \u00d7 course hours) over the 31 defensible cycles = {nfmt(s["ceiling"])} h. '
        f'Reported hours count completers only, because the calculated column is J \u00d7 H.</text>'
        f'<text class="c-sm" x="0" y="{H - 8}">'
        f'The {nfmt(s["gap"])}-hour difference is the honest measure of non-completion. '
        f'It is not a loss of funding; it is a loss of finished programming.</text>'
    )
    return svg(W, H, "".join(o), "Stacked bar showing 103,064 participant hours delivered against a 182,984 hour ceiling, with a 79,920 hour gap")


def chart_linkage(s):
    """Fig 7 -- why the records cannot be joined."""
    W, H = 780, 372
    o = [
        '<defs><marker id="arrLink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
        'orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#111" fill-opacity="0.45"/></marker></defs>',
        '<text class="c-head" x="0" y="14">What we hold</text>',
        f'<text class="c-head" x="780" y="14" text-anchor="end">What we would need to join to</text>',
    ]

    def box(x, y, w, h, lines, fill=PAPER, stroke="#111", sw=1.2, op=1.0):
        out = [
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="{sw}" opacity="{op}"/>'
        ]
        ty = y + 24
        for i, (txt, cls) in enumerate(lines):
            out.append(f'<text class="{cls}" x="{x + 14}" y="{ty}">{txt}</text>')
            ty += 18
        return "".join(out)

    o.append(
        box(
            0,
            34,
            250,
            150,
            [
                ("TPW SHEET", "c-boxhead"),
                ("13 cycle-level fields", "c-sm"),
                ("31 defensible cycles", "c-sm"),
                ("1,261 participants", "c-sm"),
                ("0 individual identifiers", "c-goldsm"),
                ("0 outcome fields", "c-goldsm"),
            ],
        )
    )
    o.append(
        box(
            512,
            20,
            268,
            100,
            [
                ("CDCR INSTITUTIONAL", "c-boxhead"),
                ("INCIDENT DATA", "c-boxhead"),
                ("the join the glossary names", "c-sm"),
            ],
        )
    )
    o.append(
        box(
            512,
            196,
            268,
            92,
            [
                ("PAROLE & RECIDIVISM", "c-boxhead"),
                ("RECORDS", "c-boxhead"),
                ("the outcome the sector claims", "c-sm"),
            ],
        )
    )
    # connectors
    o.append(
        f'<line x1="250" y1="109" x2="336" y2="109" stroke="#111" stroke-opacity="0.45" '
        f'stroke-dasharray="5 4"/>'
        f'<line x1="438" y1="70" x2="512" y2="70" stroke="#111" stroke-opacity="0.45" '
        f'stroke-dasharray="5 4" marker-end="url(#arrLink)"/>'
        f'<line x1="438" y1="242" x2="512" y2="242" stroke="#111" stroke-opacity="0.45" '
        f'stroke-dasharray="5 4" marker-end="url(#arrLink)"/>'
        f'<path d="M 387 60 L 387 262" stroke="{GOLD}" stroke-width="2.4" stroke-dasharray="3 5"/>'
        f'<rect x="318" y="128" width="138" height="54" fill="{PAPER}" stroke="{GOLD}" stroke-width="1.6"/>'
        f'<text class="c-goldbox" x="387" y="150" text-anchor="middle">NO JOIN KEY</text>'
        f'<text class="c-tiny" x="387" y="166" text-anchor="middle">alias the record at</text>'
        f'<text class="c-tiny" x="387" y="177" text-anchor="middle">participant level</text>'
    )
    o.append(
        f'<rect x="0" y="300" width="780" height="56" fill="{GOLD}" opacity="0.18" stroke="{GOLD}" stroke-width="1.2"/>'
        f'<text class="c-boxhead" x="14" y="322">PROPOSED KEY \u2014 ALREADY SPECIFIED IN data/intake/schema.json</text>'
        f'<text class="c-sm" x="14" y="342">HMAC-SHA256 participant token \u00b7 128-bit hex \u00b7 cohort floor of 5 before any release</text>'
    )
    return svg(W, H, "".join(o), "Diagram showing the TPW cycle-level record unable to join to CDCR incident or parole records because no participant key exists")


def chart_model(s):
    """Fig 8 -- the modelled outcome panel (explicitly a model)."""
    W, H = 780, 356
    x0, x1 = 34, 744
    people = s["completions"]
    base_rate, prog_rate = 0.44, 0.21
    base = round(people * base_rate)
    prog = round(people * prog_rate)
    avoided = round(people * (base_rate - prog_rate))
    half = round(people * (base_rate - prog_rate) / 2)
    vmax = 350
    scale = (x1 - x0) / vmax

    def X(v):
        return x0 + v * scale

    o = [
        '<defs><pattern id="hatchModel" width="7" height="7" patternUnits="userSpaceOnUse" '
        'patternTransform="rotate(45)">'
        f'<rect width="7" height="7" fill="#111" opacity="0.05"/>'
        f'<line x1="0" y1="0" x2="0" y2="7" stroke="#111" stroke-opacity="0.30" stroke-width="1.4"/>'
        "</pattern></defs>",
        '<text class="c-head" x="0" y="16">People expected to return to prison, 3-year horizon</text>',
        f'<text class="c-head" x="780" y="16" text-anchor="end">{nfmt(people)} completers \u00b7 people</text>',
    ]
    # bracket
    o.append(
        f'<path d="M {X(prog)} 52 L {X(prog)} 42 L {X(base)} 42 L {X(base)} 52" fill="none" stroke="{GOLD}" stroke-width="1.6"/>'
        f'<rect x="{(X(prog) + X(base)) / 2 - 74:.1f}" y="26" width="148" height="16" fill="{PAPER}"/>'
        f'<text class="c-goldhead" x="{(X(prog) + X(base)) / 2:.1f}" y="39" text-anchor="middle">'
        f"{nfmt(avoided)} avoided \u00b7 the claim</text>"
    )
    # baseline bar
    o.append(
        f'<rect x="{X(0)}" y="66" width="{X(base) - X(0):.1f}" height="56" fill="url(#hatchModel)" stroke="#111" stroke-opacity="0.35"/>'
        f'<text class="c-lbl" x="{X(0) + 8}" y="88">TPW published baseline: 44% return in 3 years</text>'
        f'<text class="c-bignum" x="{X(base) - 8:.1f}" y="108" text-anchor="end">{nfmt(base)}</text>'
    )
    # program bar
    o.append(
        f'<rect x="{X(0)}" y="138" width="{X(prog) - X(0):.1f}" height="56" fill="{GREEN}"/>'
        f'<text class="c-lbl" x="{X(0) + 8}" y="160">TPW published CBO effect: 21% return</text>'
        f'<text class="c-bignum" x="{X(prog) - 8:.1f}" y="180" text-anchor="end">{nfmt(prog)}</text>'
    )
    # axis
    o.append(
        f'<line x1="{X(0)}" y1="208" x2="{X(vmax)}" y2="208" stroke="#111" stroke-opacity="0.35"/>'
    )
    for t in (0, 100, 200, 300):
        o.append(
            f'<line x1="{X(t):.1f}" y1="203" x2="{X(t):.1f}" y2="213" stroke="#111" stroke-opacity="0.35"/>'
            f'<text class="c-axis" x="{X(t):.1f}" y="228" text-anchor="middle">{t}</text>'
        )
    o.append(
        f'<text class="c-head" x="0" y="258">Sensitivity: how much of the 23-point effect is real?</text>'
    )
    # sensitivity track
    tr_x0, tr_x1, tr_y = X(0), X(200), 300
    tr_scale = (tr_x1 - tr_x0) / 200.0
    o.append(
        f'<line x1="{tr_x0}" y1="{tr_y}" x2="{tr_x1}" y2="{tr_y}" stroke="#111" stroke-opacity="0.25"/>'
    )
    for v, lab, fill in (
        (0, "no effect\n0 avoided", "none"),
        (half, "half effect\n85 avoided", GOLD),
        (avoided, "full effect\n170 avoided", "#111"),
    ):
        cx = tr_x0 + v * tr_scale
        o.append(
            f'<circle cx="{cx:.1f}" cy="{tr_y}" r="7" fill="{fill}" stroke="#111" stroke-width="1.4"/>'
        )
        lines = lab.split("\n")
        o.append(
            f'<text class="c-sm" x="{cx:.1f}" y="{tr_y + 24}" text-anchor="middle">{lines[0]}</text>'
            f'<text class="c-num" x="{cx:.1f}" y="{tr_y + 40}" text-anchor="middle">{lines[1]}</text>'
        )
    return svg(W, H, "".join(o), "Model panel comparing 325 expected returns under a 44 percent baseline with 155 under a 21 percent program effect, a difference of 170 people")


def chart_chain(s):
    """Fig 9 -- from 1,261 starts to zero observed outcomes."""
    W, H = 780, 340
    y0, y1 = 268, 52
    vmax = 1300
    scale = (y0 - y1) / vmax
    cols = [
        ("starts", 1261, "1,261", "started a\ndefensible cycle", GREEN, 0, 1261),
        ("drop1", 522, "\u2212522", "did not\ncomplete", GOLD, 739, 1261),
        ("comp", 739, "739", "completed", GREEN, 0, 739),
        ("drop2", 739, "\u2212739", "have no outcome\nrecord", GOLD, 0, 739),
        ("zero", 0, "0", "outcome\nobservations", "none", 0, 0),
    ]
    cw, gap, startx = 96, 44, 42
    o = [
        '<text class="c-head" x="0" y="16">The evidence chain, end to end</text>',
        f'<line x1="{startx - 10}" y1="{y0}" x2="760" y2="{y0}" stroke="#111" stroke-opacity="0.3"/>',
    ]
    for t in (0, 500, 1000):
        yy = y0 - t * scale
        o.append(
            f'<line x1="{startx - 16}" y1="{yy:.1f}" x2="760" y2="{yy:.1f}" stroke="#111" stroke-opacity="0.07"/>'
            f'<text class="c-axis" x="{startx - 22}" y="{yy + 4:.1f}" text-anchor="end">{t}</text>'
        )
    for i, (key, val, big, cap, fill, lo, hi) in enumerate(cols):
        x = startx + i * (cw + gap)
        top = y0 - hi * scale
        hgt = (hi - lo) * scale
        if key in ("drop1", "drop2"):
            o.append(
                f'<line x1="{x + cw / 2}" y1="{y0 - (hi if key == "drop1" else 739) * scale:.1f}" '
                f'x2="{x + cw / 2}" y2="{y0 - (lo if key == "drop1" else 0) * scale:.1f}" '
                f'stroke="#111" stroke-opacity="0.2" stroke-dasharray="2 4"/>'
            )
        if key == "zero":
            o.append(
                f'<rect x="{x}" y="{y0 - 5}" width="{cw}" height="5" fill="{PAPER}" stroke="#111" stroke-width="1.4"/>'
                f'<text class="c-bignum" x="{x + cw / 2}" y="{y0 - 22}" text-anchor="middle">0</text>'
            )
        else:
            o.append(
                f'<rect x="{x}" y="{top:.1f}" width="{cw}" height="{max(hgt, 2):.1f}" fill="{fill}" opacity="0.95"/>'
            )
            o.append(
                f'<text class="c-bignum" x="{x + cw / 2}" y="{top - 12:.1f}" text-anchor="middle">{big}</text>'
            )
        o.append(
            f'<text class="c-sm" x="{x + cw / 2}" y="{y0 + 22}" text-anchor="middle">'
            f'{cap.split(chr(10))[0]}</text>'
        )
        if "\n" in cap:
            o.append(
                f'<text class="c-sm" x="{x + cw / 2}" y="{y0 + 35}" text-anchor="middle">'
                f'{cap.split(chr(10))[1]}</text>'
            )
    o.append(
        f'<text class="c-sm" x="0" y="{H - 8}">Every completion loses its identity at the cycle boundary. '
        f'The chain does not narrow to zero because the people stop; it narrows because the record cannot follow them.</text>'
    )
    return svg(W, H, "".join(o), "Waterfall from 1,261 program starts through 739 completions to zero observed outcome records")


# --------------------------------------------------------------------------
# 3. stylesheet
# --------------------------------------------------------------------------

CSS = r"""
@page { size: letter; margin: 0; }

* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

html, body { margin: 0; padding: 0; }
body {
  background: #ffffff;
  color: #111111;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 9.3pt;
  line-height: 1.55;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

:root {
  --ink: #111111;
  --deep: #0E0E0E;
  --paper: #FAF7F2;
  --gold: #F4C963;
  --green: #66C184;
  --ink-70: rgba(17,17,17,.70);
  --ink-55: rgba(17,17,17,.55);
  --ink-40: rgba(17,17,17,.42);
  --rule: rgba(17,17,17,.15);
}

.page {
  position: relative;
  width: 8.5in;
  height: 11in;
  overflow: hidden;
  background: #FAF7F2;
  padding: 0.72in 0.8in 0.62in 0.8in;
  break-after: page;
  page-break-after: always;
}
.page:last-child { break-after: auto; page-break-after: auto; }
.page.dark { background: #0E0E0E; color: #FAF7F2; }

/* ---------- typography ---------- */
.serif { font-family: "Iowan Old Style", "Charter", Georgia, serif; }
.kicker {
  font-size: 7.3pt; letter-spacing: .17em; text-transform: uppercase;
  font-weight: 700; color: rgba(17,17,17,.58); margin: 0 0 .09in;
}
.kicker.gold { color: #F4C963; }
.kicker .num { color: #111; margin-right: .07in; }
h1.display {
  font-family: "Iowan Old Style", "Charter", Georgia, serif;
  font-weight: 400; font-size: 25.5pt; line-height: 1.09;
  letter-spacing: -0.012em; margin: .02in 0 .1in;
}
h1.cover {
  font-family: "Iowan Old Style", "Charter", Georgia, serif;
  font-weight: 400; font-size: 52pt; line-height: 0.98;
  letter-spacing: -0.022em; margin: 0 0 .2in; max-width: 6.1in;
}
h3 { font-size: 9.4pt; font-weight: 700; margin: .14in 0 .05in; letter-spacing: 0; }
p { margin: 0 0 .085in; }
.lede {
  font-family: "Iowan Old Style", "Charter", Georgia, serif;
  font-size: 12.2pt; line-height: 1.44; margin: 0 0 .15in; color: #111;
}
.small { font-size: 8.2pt; line-height: 1.5; }
.tiny { font-size: 7.1pt; line-height: 1.45; }
.muted { color: rgba(17,17,17,.62); }
.dark .muted { color: rgba(250,247,242,.62); }
b, strong { font-weight: 700; }
.serif-num { font-family: "Iowan Old Style", Georgia, serif; font-size: 1.06em; }
a { color: inherit; text-decoration: none; }
h2 + .lede { margin-top: -.02in; }

/* ---------- grid ---------- */
.grid { display: grid; grid-template-columns: repeat(12, 1fr); column-gap: .16in; row-gap: 0; }
.c3 { grid-column: span 3; } .c4 { grid-column: span 4; } .c5 { grid-column: span 5; }
.c6 { grid-column: span 6; } .c7 { grid-column: span 7; } .c8 { grid-column: span 8; }
.c9 { grid-column: span 9; } .c12 { grid-column: span 12; }
.rule-top { border-top: 1.3px solid #111; padding-top: .09in; }
.rule-thin { border-top: .6px solid rgba(17,17,17,.25); }
.dark .rule-top { border-top-color: #FAF7F2; }
.mt { margin-top: .16in; } .mt-s { margin-top: .09in; } .mt-l { margin-top: .26in; }

/* ---------- stats ---------- */
.stats { display: flex; border-top: 1.3px solid #111; border-bottom: 1.3px solid #111; margin: .04in 0 .2in; }
.stat { flex: 1; padding: .1in .1in .11in 0; border-right: .6px solid rgba(17,17,17,.22); }
.stat:last-child { border-right: 0; }
.stat b {
  display: block; font-family: "Iowan Old Style", Georgia, serif; font-weight: 400;
  font-size: 20.5pt; line-height: 1; letter-spacing: -0.015em; margin-bottom: .04in;
}
.stat span { display: block; font-size: 6.5pt; letter-spacing: .11em; text-transform: uppercase; color: rgba(17,17,17,.58); }
.stats.tight .stat b { font-size: 17pt; }

/* ---------- pull quote / verbatim ---------- */
.pull {
  border-top: 1.6px solid #111; padding-top: .1in; margin: .16in 0 0;
  font-family: "Iowan Old Style", Georgia, serif; font-size: 14.5pt;
  line-height: 1.26; letter-spacing: -0.005em;
}
.pull cite {
  display: block; font-family: "Helvetica Neue", Arial, sans-serif; font-style: normal;
  font-size: 6.8pt; letter-spacing: .13em; text-transform: uppercase;
  color: rgba(17,17,17,.55); margin-top: .1in;
}
.pull .q { font-style: normal; }
.verbatim {
  border-left: 2.6px solid #F4C963; padding: .02in 0 .02in .17in;
  font-family: "Iowan Old Style", Georgia, serif; font-size: 9.5pt; line-height: 1.46;
}
.verbatim p { margin: 0 0 .08in; }
.verbatim p:last-child { margin-bottom: 0; }
.cite-src {
  font-size: 6.8pt; letter-spacing: .1em; text-transform: uppercase;
  color: rgba(17,17,17,.55); margin-top: .07in;
}

/* ---------- figures ---------- */
figure { margin: 0; }
figure .head {
  display: flex; justify-content: space-between; align-items: baseline;
  border-top: 1.3px solid #111; padding-top: .055in; margin-bottom: .07in;
}
figure .head .t { font-size: 7.2pt; letter-spacing: .15em; text-transform: uppercase; font-weight: 700; }
figure .head .n { font-size: 7.2pt; letter-spacing: .15em; text-transform: uppercase; color: rgba(17,17,17,.55); }
.chart { display: block; width: 100%; height: auto; overflow: visible; }
figcaption {
  display: flex; justify-content: space-between; gap: .2in;
  border-top: .6px solid rgba(17,17,17,.28); margin-top: .07in; padding-top: .045in;
  font-size: 6.6pt; line-height: 1.4; color: rgba(17,17,17,.58); letter-spacing: .015em;
}
figcaption .src { max-width: 5.2in; }
figcaption .tag {
  font-weight: 700; letter-spacing: .11em; text-transform: uppercase; white-space: nowrap;
  color: rgba(17,17,17,.72);
}

/* ---------- svg text ---------- */
.c-lbl { font: 400 12px "Helvetica Neue", Arial, sans-serif; fill: #111; }
.c-fac { font: 400 11px "Helvetica Neue", Arial, sans-serif; fill: rgba(17,17,17,.66); }
.c-code { font: 700 11px "Helvetica Neue", Arial, sans-serif; fill: #111; letter-spacing: .04em; }
.c-sm { font: 400 10.4px "Helvetica Neue", Arial, sans-serif; fill: rgba(17,17,17,.66); }
.c-tiny { font: 400 9.4px "Helvetica Neue", Arial, sans-serif; fill: rgba(17,17,17,.55); }
.c-num { font: 500 11px "Helvetica Neue", Arial, sans-serif; fill: #111; font-variant-numeric: tabular-nums; }
.c-axis { font: 400 9.2px "Helvetica Neue", Arial, sans-serif; fill: rgba(17,17,17,.48); }
.c-head { font: 700 8.9px "Helvetica Neue", Arial, sans-serif; fill: rgba(17,17,17,.5); letter-spacing: .13em; text-transform: uppercase; }
.c-boxhead { font: 700 9.4px "Helvetica Neue", Arial, sans-serif; fill: #111; letter-spacing: .11em; }
.c-inv { font: 400 10.4px "Helvetica Neue", Arial, sans-serif; fill: rgba(255,255,255,.9); }
.c-invbig { font: 700 16px "Helvetica Neue", Arial, sans-serif; fill: #ffffff; }
.c-goldnum { font: 700 11.5px "Helvetica Neue", Arial, sans-serif; fill: #B98414; font-variant-numeric: tabular-nums; }
.c-goldhead { font: 700 9.2px "Helvetica Neue", Arial, sans-serif; fill: #A8791A; letter-spacing: .1em; }
.c-goldsm { font: 400 10.4px "Helvetica Neue", Arial, sans-serif; fill: #A8791A; }
.c-goldbig { font: 700 16px "Helvetica Neue", Arial, sans-serif; fill: #8C6412; }
.c-goldbox { font: 700 10px "Helvetica Neue", Arial, sans-serif; fill: #8C6412; letter-spacing: .12em; }
.c-bignum { font: 400 22px "Iowan Old Style", Georgia, serif; fill: #111; font-variant-numeric: tabular-nums; }
.c-dot { font: 700 10.2px "Helvetica Neue", Arial, sans-serif; fill: #0E0E0E; letter-spacing: .02em; }
.c-dot2 { font: 400 7.4px "Helvetica Neue", Arial, sans-serif; fill: rgba(14,14,14,.72); }
.c-dot3 { font: 400 10.2px "Helvetica Neue", Arial, sans-serif; fill: rgba(17,17,17,.5); letter-spacing: .02em; }
.c-dash { font: 700 13px "Helvetica Neue", Arial, sans-serif; fill: rgba(17,17,17,.25); }

/* ---------- tables ---------- */
table.t { width: 100%; border-collapse: collapse; font-size: 8.1pt; line-height: 1.38; }
table.t caption {
  caption-side: top; text-align: left; font-size: 6.9pt; letter-spacing: .14em;
  text-transform: uppercase; font-weight: 700; padding-bottom: .05in;
}
table.t thead th {
  font-size: 6.5pt; letter-spacing: .11em; text-transform: uppercase; font-weight: 700;
  text-align: left; vertical-align: bottom; padding: 0 .07in .05in 0;
  border-bottom: 1.2px solid #111;
}
table.t tbody td { padding: .043in .07in .043in 0; border-bottom: .5px solid rgba(17,17,17,.16); vertical-align: top; }
table.t tbody tr:last-child td { border-bottom: 1.2px solid #111; }
table.t .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.t .code { font-weight: 700; letter-spacing: .03em; white-space: nowrap; }
table.t tbody tr.sum td { background: rgba(244,201,99,.20); font-weight: 700; border-bottom: 1.2px solid #111; }
table.t .sev {
  display: inline-block; font-size: 5.9pt; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; padding: .012in .045in .006in; white-space: nowrap;
}
.sev.b { background: #111; color: #FAF7F2; }
.sev.d { background: #F4C963; color: #111; }
.sev.c { border: .7px solid rgba(17,17,17,.4); color: rgba(17,17,17,.62); }
.ledger td.def { font-weight: 500; }
.ledger td.fix { color: rgba(17,17,17,.7); }

/* ---------- contents ---------- */
.toc { margin: .02in 0 0; }
.toc .row {
  display: flex; align-items: baseline; gap: .07in;
  padding: .052in 0; border-bottom: .5px solid rgba(17,17,17,.13);
}
.toc .row .no { font-size: 6.8pt; letter-spacing: .1em; color: rgba(17,17,17,.45); width: .24in; }
.toc .row .tt { font-size: 9.1pt; }
.toc .row .dots { flex: 1; border-bottom: .5px dotted rgba(17,17,17,.3); transform: translateY(-.03in); }
.toc .row .pg { font-size: 8.4pt; font-weight: 700; }

/* ---------- components ---------- */
.class-box { border-top: 1.3px solid #111; padding-top: .08in; }
.class-row { display: flex; gap: .1in; padding: .055in 0; border-bottom: .5px solid rgba(17,17,17,.14); }
.class-row .tagc {
  flex: 0 0 .78in; font-size: 6.3pt; letter-spacing: .1em; text-transform: uppercase;
  font-weight: 700; padding-top: .012in;
}
.class-row .tagc.m { color: #1F7A44; }
.class-row .tagc.p { color: #8C6412; }
.class-row .tagc.x { color: #111; }
.class-row .tx { font-size: 8pt; line-height: 1.42; color: rgba(17,17,17,.78); }

.card { border-top: 1.3px solid #111; padding-top: .075in; }
.card .no {
  font-family: "Iowan Old Style", Georgia, serif; font-size: 15pt; color: #A8791A;
  line-height: 1; display: block; margin-bottom: .03in;
}
.card h4 { font-size: 9.2pt; font-weight: 700; margin: 0 0 .035in; line-height: 1.25; }
.card p { font-size: 8pt; line-height: 1.45; margin: 0 0 .04in; color: rgba(17,17,17,.8); }
.card .cite { font-size: 6.4pt; letter-spacing: .08em; text-transform: uppercase; color: rgba(17,17,17,.5); }

.points { display: flex; gap: .12in; margin: .04in 0 .14in; }
.point {
  flex: 1; border-top: 1.3px solid #111; padding-top: .06in;
}
.point .n {
  font-family: "Iowan Old Style", Georgia, serif; font-size: 21pt; line-height: 1;
  display: block; margin-bottom: .03in;
}
.point .n small { font-size: 10pt; }
.point .d { font-size: 7.2pt; letter-spacing: .06em; text-transform: uppercase; color: rgba(17,17,17,.6); line-height: 1.35; }

.timeline { display: flex; border-top: 1.3px solid #111; padding-top: .1in; position: relative; }
.tl { flex: 1; position: relative; padding-right: .09in; }
.tl:before {
  content: ""; position: absolute; top: -.1in; left: 0; width: .075in; height: .075in;
  background: #111; transform: translateY(-.005in);
}
.tl.key:before { background: #F4C963; }
.tl .d { font-size: 6.9pt; font-weight: 700; letter-spacing: .04em; margin-bottom: .02in; }
.tl .l { font-size: 6.9pt; line-height: 1.32; color: rgba(17,17,17,.68); }

.note-box {
  border: 1px solid rgba(17,17,17,.32); padding: .1in .12in; background: rgba(244,201,99,.13);
}
.note-box.green { background: rgba(102,193,132,.13); border-color: rgba(31,122,68,.35); }
.note-box .h {
  font-size: 6.6pt; letter-spacing: .13em; text-transform: uppercase; font-weight: 700;
  margin-bottom: .04in; color: rgba(17,17,17,.75);
}
.note-box p { font-size: 7.9pt; line-height: 1.45; margin: 0; color: rgba(17,17,17,.82); }

.model-badge {
  display: inline-block; background: #F4C963; color: #111; font-size: 7pt; font-weight: 700;
  letter-spacing: .16em; text-transform: uppercase; padding: .028in .085in .022in; margin-bottom: .1in;
}
.assume { counter-reset: a; margin: 0; padding: 0; list-style: none; }
.assume li {
  counter-increment: a; position: relative; padding-left: .24in; font-size: 7.6pt;
  line-height: 1.42; margin-bottom: .048in; color: rgba(17,17,17,.82);
}
.assume li:before {
  content: counter(a, decimal-leading-zero); position: absolute; left: 0; top: 0;
  font-size: 6.4pt; font-weight: 700; letter-spacing: .06em; color: #A8791A;
}

/* ---------- folio ---------- */
.folio {
  position: absolute; left: .8in; right: .8in; bottom: .34in;
  display: flex; justify-content: space-between; align-items: baseline;
  border-top: .6px solid rgba(17,17,17,.22); padding-top: .045in;
  font-size: 6.3pt; letter-spacing: .13em; text-transform: uppercase; color: rgba(17,17,17,.45);
}
.folio .pn { font-variant-numeric: tabular-nums; letter-spacing: .06em; color: rgba(17,17,17,.72); font-weight: 700; }
.dark .folio { border-top-color: rgba(250,247,242,.28); color: rgba(250,247,242,.45); }
.dark .folio .pn { color: rgba(250,247,242,.8); }

/* ---------- cover ---------- */
.cover { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
.cover .top { display: flex; justify-content: space-between; align-items: flex-start; }
.cover .top img { width: 2.02in; height: 1.156in; }
.cover .meta { text-align: right; font-size: 6.4pt; letter-spacing: .14em; text-transform: uppercase; color: rgba(250,247,242,.6); line-height: 1.7; }
.cover .deck {
  font-family: "Iowan Old Style", Georgia, serif; font-size: 13.6pt; line-height: 1.4;
  max-width: 5.3in; color: rgba(250,247,242,.86); margin: .14in 0 0;
}
.cover .goldline { width: 1.1in; height: 3px; background: #F4C963; margin: 0 0 .16in; }
.cover .tags { font-size: 7.3pt; letter-spacing: .13em; text-transform: uppercase; color: #F4C963; margin-top: .16in; }
.cover .foot { border-top: 1px solid rgba(250,247,242,.3); padding-top: .1in; display: flex; gap: .26in; }
.cover .foot div { flex: 1; }
.cover .foot .k { font-size: 6pt; letter-spacing: .14em; text-transform: uppercase; color: rgba(250,247,242,.45); margin-bottom: .02in; }
.cover .foot .v { font-size: 7.6pt; line-height: 1.4; color: rgba(250,247,242,.86); }
.section-no {
  font-family: "Iowan Old Style", Georgia, serif; font-size: 10pt; color: #A8791A;
  letter-spacing: .08em;
}
"""

# --------------------------------------------------------------------------
# 4. page furniture
# --------------------------------------------------------------------------


def folio(n, left="Transformative Programming Works \u00b7 Collective Impact Report 2026"):
    return (
        f'<div class="folio"><span>{esc(left)}</span>'
        f'<span>2026</span><span class="pn">{n:02d}</span></div>'
    )


def page(n, body, cls="", left="Transformative Programming Works \u00b7 Collective Impact Report 2026"):
    return (
        f'<section class="page {cls}" id="p{n}">'
        f"{body}{folio(n, left) if n else ''}</section>"
    )


def figure(num, title, svg_markup, source, tag="Data"):
    return (
        f'<figure><div class="head"><span class="t">{esc(title)}</span>'
        f'<span class="n">Fig. {num}</span></div>{svg_markup}'
        f'<figcaption><span class="src">{source}</span>'
        f'<span class="tag">{esc(tag)}</span></figcaption></figure>'
    )


def img_uri(path):
    with open(path, "rb") as fh:
        return "data:image/png;base64," + base64.b64encode(fh.read()).decode("ascii")


# --------------------------------------------------------------------------
# 5. pages
# --------------------------------------------------------------------------


def p_cover():
    logo = img_uri(LOGO_DARK)
    body = f"""
<div class="cover">
  <div class="top">
    <img src="{logo}" alt="Transformative Programming Works" width="2500" height="1431">
    <div class="meta">Collective Impact<br>Report<br>2026</div>
  </div>
  <div>
    <div class="goldline"></div>
    <div class="kicker gold">A prototype foundation report</div>
    <h1 class="cover">The Evidence<br>We Already Have</h1>
    <p class="deck">What 31 completed program cycles can prove about community-based
    rehabilitation in California prisons &mdash; and what they cannot.</p>
    <div class="tags">31 cycles &#183; 1,261 participants &#183; 739 completions &#183; 58.6%</div>
  </div>
  <div class="foot">
    <div><div class="k">Prepared for</div><div class="v">The RIGHT Grant 4.0<br>policy window</div></div>
    <div><div class="k">Data pull</div><div class="v">June 2026<br>Collective Impact sheet</div></div>
    <div><div class="k">Basis</div><div class="v">31 defensible cycles<br>2 organizations</div></div>
    <div><div class="k">Publisher</div><div class="v">TPW &#183; EIN 99-2553658</div></div>
  </div>
</div>
"""
    return page(1, body, cls="dark")


def p_contents():
    toc = [
        ("01", "The ask in the state\u2019s words", 4),
        ("02", "The money and the rules", 5),
        ("03", "Coverage: 14 of 31 institutions", 6),
        ("04", "What the sheet actually holds", 7),
        ("05", "The defensible core", 8),
        ("06", "Completion, and the n = 1 problem", 9),
        ("07", "Hours are a floor, not a total", 10),
        ("08", "The data-quality ledger", 11),
        ("09", "The missing join key", 12),
        ("10", "A model, not a finding", 13),
        ("11", "From 1,261 starts to zero outcomes", 14),
        ("12", "What we would build next", 15),
        ("13", "Sources and colophon", 16),
    ]
    rows = "".join(
        f'<div class="row"><span class="no">{n}</span><span class="tt">{esc(t)}</span>'
        f'<span class="dots"></span><span class="pg">{p}</span></div>'
        for n, t, p in toc
    )
    body = f"""
<div class="kicker"><span class="num">00</span> Contents</div>
<h1 class="display">A report about the difference<br>between activity and change.</h1>

<div class="grid mt">
  <div class="c7">
    <div class="toc">{rows}</div>
  </div>
  <div class="c5">
    <div class="class-box">
      <div class="kicker" style="margin-bottom:.06in">Three classes of number</div>
      <div class="class-row">
        <div class="tagc m">Measured</div>
        <div class="tx">Computed from the 31-cycle defensible subset of the
        Collective Impact sheet. Reproducible from the CSV by
        <span class="serif-num">build.py</span>.</div>
      </div>
      <div class="class-row">
        <div class="tagc p">Published</div>
        <div class="tx">A TPW public claim, quoted verbatim. Not verified in this
        repository, and not usable as evidence of program effect.</div>
      </div>
      <div class="class-row">
        <div class="tagc x">Modelled</div>
        <div class="tx">Arithmetic performed on published claims. Labelled at the
        point of use. It is an illustration of a claim, never a finding.</div>
      </div>
    </div>

    <div class="note-box mt">
      <div class="h">One exclusion worth naming</div>
      <p>The single highest completion rate in the file &mdash; 25 of 28, or 89.3% &mdash;
      belongs to the row marked <b>SAMPLE DATA</b>. It is a worked example, not a
      program. It is excluded from every figure in this report.</p>
    </div>
  </div>
</div>

<div class="grid mt-l">
  <div class="c4 rule-top">
    <h3 style="margin-top:0">Scope</h3>
    <p class="small">One artefact: the TPW Collective Impact data sheet as submitted
    for the June 2026 pull. The report asks what that sheet can prove today, what it
    cannot, and what it would take to close the gap between the two.</p>
  </div>
  <div class="c4 rule-top">
    <h3 style="margin-top:0">Sources</h3>
    <p class="small">The Collective Impact CSV (13 fields, 104 lines) &#183; the
    TPW Data Glossary and Submission Instructions, June 2026 &#183; the CDCR RIGHT
    Grant 4.0 RFA &#183; the 31-facility constants tab &#183; TPW&#8217;s published
    site copy.</p>
  </div>
  <div class="c4 rule-top">
    <h3 style="margin-top:0">Method</h3>
    <p class="small">A cycle is defensible if its status is Completed, its course
    hours, participants and completions all parse as integers, and it is not the
    sample row. That leaves 31 of 104 lines. Sums never interpolate a missing
    value.</p>
  </div>
</div>
"""
    return page(2, body, left="Contents \u00b7 Method")


def p_exec(s):
    stats = [
        (nfmt(s["defensible"]), "defensible cycles"),
        (nfmt(s["participants"]), "participants served"),
        (nfmt(s["completions"]), "completions"),
        (pct(s["completions"], s["participants"]), "completion rate"),
        (nfmt(s["ph"]), "participant-hours"),
    ]
    stat_html = "".join(f"<div class='stat'><b>{a}</b><span>{b}</span></div>" for a, b in stats)
    findings = [
        (
            "The state asks for less than the sector already collects.",
            "Section 16 requires four things. The sheet supplies two of them and adds "
            "five more that nobody asked for. The gap is not collection. It is "
            "credibility, analysis and a third party.",
        ),
        (
            "The state forbids self-evaluation.",
            "Section 15 bars grant recipients from evaluating their own programs for "
            "external publication and requires an independent research entity. That "
            "sentence is a market definition, and TPW is on the right side of it.",
        ),
        (
            "The money is allocated by budget size, not by merit.",
            "$19.4 million divided by total qualifying points. Points are 1, 2 or 3 "
            "according to organisational budget. A small CBO carries one third the "
            "weight of a large one before a single bonus point is awarded.",
        ),
        (
            "103,064 hours is a floor, not a total.",
            "Reported hours count completers only. Against the 182,984-hour ceiling "
            "the sheet is 56.3% delivered: 79,920 hours and 522 people short. Nobody "
            "in the sector publishes this number.",
        ),
        (
            "The record has no key.",
            "No participant identifier, no demographics, no outcome field. Sixteen "
            "defects are catalogued in this report; every one of them is fixable in "
            "the sheet, not in the field.",
        ),
    ]
    items = "".join(
        f'<div class="grid" style="margin-bottom:.11in"><div class="c1" style="grid-column:span 1">'
        f'<span class="serif-num" style="color:#A8791A;font-size:8.4pt">{i:02d}</span></div>'
        f'<div style="grid-column:span 11"><h3 style="margin:0 0 .02in">{esc(h)}</h3>'
        f'<p class="small" style="margin:0;color:rgba(17,17,17,.8)">{esc(t)}</p></div></div>'
        for i, (h, t) in enumerate(findings, 1)
    )
    body = f"""
<div class="kicker"><span class="num">00</span> Executive summary</div>
<h1 class="display">The sector can already count activity.<br>It cannot yet count change.</h1>
<p class="lede">This is the first collective impact report built from TPW&#8217;s own
submission sheet. It is deliberately narrow: it reports only what the sheet can
carry, names every number it cannot carry, and shows exactly where the join
to outcome data breaks.</p>

<div class="stats">{stat_html}</div>

<div class="grid">
  <div class="c7">
    <div class="kicker" style="margin-bottom:.08in">Five findings</div>
    {items}
  </div>
  <div class="c5">
    <div style="padding-left:.2in;border-left:.6px solid rgba(17,17,17,.2)">
      <div class="pull">
        <span class="q">&#8220;While we are driven by a sense of humanity, but we are
        grounded in data.&#8221;</span>
        <cite>Transformative Programming Works &#183; public site, verbatim (sic)</cite>
      </div>
      <p class="tiny mt" style="color:rgba(17,17,17,.68)">The sentence is the brief.
      This report tests whether the data can carry the weight the sentence puts on
      it. At cycle level it can. At participant level it cannot yet.</p>

      <div class="rule-top mt">
        <div class="kicker" style="margin-bottom:.04in">What this report is not</div>
        <p class="tiny" style="color:rgba(17,17,17,.72);margin:0">It is not an
        evaluation. It contains no outcome measurement, no recidivism figure and no
        cost-effectiveness claim. The only modelled page is labelled as a model and
        rests entirely on published, unverified percentages.</p>
      </div>
    </div>
  </div>
</div>
"""
    return page(3, body, left="Executive summary")


def p_ask():
    body = f"""
<div class="kicker"><span class="num">01</span> The ask in the state&#8217;s words</div>
<h1 class="display">CDCR asks for four fields.<br>The sheet cannot supply two of them.</h1>

<div class="grid">
  <div class="c7">
    <div class="verbatim">
      <p><b>16. REPORTING REQUIREMENTS</b></p>
      <p>Each grant recipient shall be required to submit annual reports, and a final
      summary is also required report detailing the expenditure of grant funds
      including a summary of how the resources of this grant funding enhanced their
      ability to deliver In-Prison programming.</p>
      <p><b>a. Annual Report</b> &#8212; Each grant recipient shall submit an annual
      report to CDCR that details the expenditures of their grant, <b>to include the
      institution the funds were utilized, the number of participants, and
      populations served.</b></p>
    </div>
    <div class="cite-src">RIGHT Grant 4.0 RFA &#183; &#167;16 Reporting Requirements, p. 11 &#183; verbatim</div>
  </div>
  <div class="c5">
    <div class="rule-top">
      <p class="small" style="margin-top:0">Strip the prose and exactly four data
      points are required: <b>expenditure</b>, <b>institution</b>, <b>number of
      participants</b>, <b>populations served</b>. No outcome, no recidivism, no
      completion rate, no hours.</p>
      <p class="small">The Collective Impact sheet carries institution and participant
      count. It has no expenditure field at all, and no populations-served field
      &mdash; the closest proxy is knowing which two facilities are women&#8217;s
      prisons. The state asks for less than TPW collects, and the sheet still misses
      half of it.</p>
      <p class="small" style="margin-bottom:0">That is the first honest finding:
      before the sector can be asked for outcomes, its own reporting form has to
      clear the state&#8217;s minimum.</p>
    </div>
  </div>
</div>

<div class="mt-l">
{figure(
    "1",
    "What the state requires, and what the sheet captures",
    chart_have_need(None),
    "Source: RIGHT Grant 4.0 RFA &#167;16 (p. 11); <i>data/tpw-collective-impact.csv</i>, header row, 13 fields. "
    "A field is &#8220;present&#8221; only if it exists as a column; inference from free text does not count.",
    "Measured &#183; document",
)}
</div>
"""
    return page(4, body, left="01 \u00b7 The ask")


def p_money(s):
    pool = 19_400_000
    per_point = pool / 120
    body = f"""
<div class="kicker"><span class="num">02</span> The money and the rules</div>
<h1 class="display">$19.4 million, divided by points,<br>decided by budget size.</h1>

<div class="grid">
  <div class="c6">
    <div class="verbatim">
      <p><b>4. FUNDING DESCRIPTION</b></p>
      <p>This project will provide $19.4 million to support eligible community-based,
      nonprofit organizations for the purpose of delivering trauma-informed,
      rehabilitative and/or restorative justice programming in CDCR institutions.</p>
    </div>
    <div class="cite-src">RIGHT Grant 4.0 RFA &#183; &#167;4, p. 2 &#183; verbatim</div>

    <div class="verbatim mt">
      <p><b>9. FUNDING</b></p>
      <p>Eligible organizations shall be awarded grants based on qualifying points as
      specified within this section. <b>The total funding available shall be divided by
      the total points awarded to all eligible organizations, resulting in a dollar
      value for each point.</b> Each eligible organization will receive funding
      corresponding with the total points awarded.</p>
    </div>
    <div class="cite-src">RIGHT Grant 4.0 RFA &#183; &#167;9, pp. 4&#8211;5 &#183; verbatim</div>
  </div>

  <div class="c6">
    <div class="kicker" style="margin-bottom:.05in">The allocation ladder</div>
    <div class="points">
      <div class="point"><span class="n">1</span><div class="d">Under<br>$250,000</div></div>
      <div class="point"><span class="n">2</span><div class="d">$250,000<br>to $500,000</div></div>
      <div class="point"><span class="n">3</span><div class="d">Above<br>$500,000</div></div>
      <div class="point"><span class="n">4</span><div class="d">Maximum,<br>with bonuses</div></div>
    </div>
    <p class="small">Points are set by the organisation&#8217;s current budget, or its
    average for the last two years, whichever is greater. Up to two half-points may
    be added for underserved institutions, for special populations (RHU, EOP/MHCB),
    and for programming in languages other than English &#8212; each applied once,
    capped at one extra point in total.</p>
    <p class="small" style="margin-bottom:0">The only quantitative discriminator in
    the formula is the size of the organisation. There is no quality term.</p>

    <div class="note-box mt">
      <div class="h">Scenario arithmetic &#183; not a forecast</div>
      <p>If all 120 member organisations qualified at one point each, the pool would
      be divided by 120: <b>$161,667 per point</b>. A three-point organisation would
      draw <b>$485,000</b>; a one-point CBO, $161,667. The real denominator is unknown
      until applications close on 30 November 2026 &#8212; this is division, not
      prediction.</p>
    </div>
  </div>
</div>

<div class="mt-l">
  <div class="kicker" style="margin-bottom:.07in">&#167;11 Summary of key events &#183; verbatim dates</div>
  <div class="timeline">
    <div class="tl"><div class="d">10/01/2026</div><div class="l">Application period opens</div></div>
    <div class="tl key"><div class="d">11/30/2026</div><div class="l">Applications due, 11:59 p.m.</div></div>
    <div class="tl"><div class="d">02/26/2027</div><div class="l">Tentative eligibility notice</div></div>
    <div class="tl"><div class="d">03/29/2027</div><div class="l">Resubmission period closes</div></div>
    <div class="tl"><div class="d">04/30/2027</div><div class="l">Final eligibility notice</div></div>
    <div class="tl"><div class="d">07/01/2027</div><div class="l">Funding period begins</div></div>
    <div class="tl"><div class="d">12/01/2029</div><div class="l">Funding period ends</div></div>
    <div class="tl"><div class="d">12/01/2030</div><div class="l">Final report due</div></div>
  </div>
  <p class="tiny mt-s" style="color:rgba(17,17,17,.6)">Two inconsistencies in the RFA
  table are worth flagging to CDCR: Annual Report #3 is due 02/01/2029, before the
  reporting period it covers ends on 12/01/2029; and the Final Report period opens
  05/01/2027, two months before funding begins.</p>
</div>
"""
    return page(5, body, left="02 \u00b7 The money")


def p_coverage(s):
    covered = [f["code"] for f in s["fac_by_parts"]]
    missing = [f["code"] for f in s["all_fac"] if f["code"] not in s["covered_codes"]]
    body = f"""
<div class="kicker"><span class="num">03</span> Coverage</div>
<h1 class="display">Fourteen of thirty-one institutions appear.<br>Seventeen have no row at all.</h1>
<p class="lede">The &#167;9 footnote defines an underserved institution as one with
&#8220;a lack of community-based programming services available.&#8221; That is a
coverage question, and coverage is the one thing this dataset can actually measure.</p>

{figure(
    "2",
    "The 31 CDCR institutions, by presence in the dataset",
    chart_coverage(s),
    "Source: <i>data/intake/facilities.json</i> (31-facility constants tab) joined to <i>data/tpw-collective-impact.csv</i>, "
    "31 defensible cycles. Cycle and participant counts are per facility, defensible subset only.",
    "Measured",
)}

<div class="grid mt-l">
  <div class="c4 rule-top">
    <h3 style="margin-top:0">14 of 31 is 45.2%</h3>
    <p class="small">Fourteen institutions carry at least one defensible cycle. The
    other seventeen &#8212; {esc(", ".join(missing))} &#8212; have no row.
    In a catalogue of 31 prisons, that is not a rounding error; it is the map of
    where the sector is absent.</p>
  </div>
  <div class="c4 rule-top">
    <h3 style="margin-top:0">What &#167;9 would need</h3>
    <p class="small">An application can claim the underserved-institution bonus once,
    worth half a point, for institutions that lack CBO programming. A verified
    coverage map is therefore directly worth funding &#8212; but only if coverage is
    computed per institution from submitted rows, not asserted.</p>
  </div>
  <div class="c4 rule-top">
    <h3 style="margin-top:0">The scale of the gap</h3>
    <p class="small">Of the 127 member organisations named on TPW&#8217;s own site,
    two appear in this dataset with real data, and a third appears only as the
    <b>SAMPLE DATA</b> row. The collective is far wider than its collective
    evidence.</p>
  </div>
</div>
"""
    return page(6, body, left="03 \u00b7 Coverage")


def p_instrument(s):
    body = f"""
<div class="kicker"><span class="num">04</span> The instrument</div>
<h1 class="display">One hundred and four lines.<br>Thirty-one usable cycles.</h1>
<p class="lede">The sheet is not one table. It is a submission form, a formula drag
and a worked example sharing a single tab &#8212; and counting rows naively
overstates the number of program cycles by a factor of 3.4.</p>

{figure(
    "3",
    "From 104 physical lines to 31 defensible cycles",
    chart_funnel(s),
    "Source: <i>data/tpw-collective-impact.csv</i>. Phantom rows are lines whose only non-blank cell is a literal 0 in the "
    "calculated participant-hours column, a spreadsheet formula artifact.",
    "Measured",
)}

<div class="grid mt-l">
  <div class="c6 rule-top">
    <div class="kicker" style="margin-bottom:.05in">The column-letter trap</div>
    <p class="small" style="margin-top:0">The glossary numbers the form A&#8211;N,
    fourteen columns, with <b>K = &#8220;Funded by RIGHT 2.0&#8221;</b>. The CSV drops
    column K, so it has thirteen columns and every letter after J shifts. In raw
    terms, participant hours are field 11 and program year is field 12 &#8212; not L
    and M.</p>
    <p class="small" style="margin-bottom:0">The consequence is not clerical.
    <b>Funding provenance cannot be determined from this data at all</b>, so no
    RIGHT-funded cycle can be separated from a non-RIGHT cycle.</p>
  </div>
  <div class="c6 rule-top">
    <div class="kicker" style="margin-bottom:.05in">A naming problem that costs 20&#215;</div>
    <p class="small" style="margin-top:0">Column H is labelled &#8220;Total
    Programming hours.&#8221; It does not mean total. It means the hours one
    participant accumulates by attending every session: 176 for CEO of Your New Life,
    104 for Guiding Rage Into Power, with no variance anywhere in the file.</p>
    <p class="small" style="margin-bottom:0">Read as a total, 176 becomes 7,920 for a
    45-person cohort. The proposed rename &#8212; <b>Course Hours (per
    Participant)</b> &#8212; is pending review by Rick Olesek and Kim Moore. It is a
    label change, not a new system, and it removes the sector&#8217;s easiest way to
    overstate itself.</p>
  </div>
</div>

<div class="grid mt">
  <div class="c12">
    <div class="note-box green">
      <div class="h">The eight fields the state never asked for</div>
      <p>Program name, schedule status, start and end dates, course hours, completions,
      program year and notes. Five of these are genuinely additive to &#167;16:
      curriculum, hours, completions, duration and reporting year. The sheet is
      already richer than the obligation. What it lacks is not ambition; it is a
      key and a third party.</p>
    </div>
  </div>
</div>
"""
    return page(7, body, left="04 \u00b7 The instrument")


def p_core(s):
    stats = [
        (nfmt(s["defensible"]), "cycles"),
        (nfmt(s["participants"]), "participants"),
        (nfmt(s["completions"]), "completions"),
        (pct(s["completions"], s["participants"]), "completion"),
        (nfmt(s["ph"]), "participant-hours"),
        (nfmt(s["course_hours"]), "course-hours"),
    ]
    stat_html = "".join(f"<div class='stat'><b>{a}</b><span>{b}</span></div>" for a, b in stats)
    y = s["years"]
    yrows = "".join(
        f"<tr><td class='code'>{yr}</td><td class='n'>{v['cycles']}</td>"
        f"<td class='n'>{nfmt(v['participants'])}</td><td class='n'>{nfmt(v['completions'])}</td>"
        f"<td class='n'>{nfmt(v['ph'])}</td><td class='n'>{v['rate']:.1f}%</td></tr>"
        for yr, v in y.items()
    )
    body = f"""
<div class="kicker"><span class="num">05</span> The measured core</div>
<h1 class="display">What the sheet can<br>actually support.</h1>
<p class="lede">Every figure on this spread excludes the sample row, the three
in-progress rows, the cycle with unknown completions and the empty row. What remains
is the only set of numbers in this report that may be quoted in public.</p>

<div class="stats tight">{stat_html}</div>

{figure(
    "4",
    "Participant-hours delivered by facility, split by organisation",
    chart_hours_by_facility(s),
    "Source: <i>data/tpw-collective-impact.csv</i>, defensible subset (31 cycles). Participant-hours = completions &#215; "
    "course hours. Colours identify the delivering organisation; a facility with both colours hosts both curricula.",
    "Measured",
)}

<div class="grid mt">
  <div class="c7 rule-top">
    <table class="t">
      <caption>Program year &#183; defensible subset</caption>
      <thead><tr><th>Year</th><th class="n">Cycles</th><th class="n">Participants</th>
      <th class="n">Completions</th><th class="n">Participant-hours</th><th class="n">Rate</th></tr></thead>
      <tbody>{yrows}</tbody>
    </table>
    <p class="tiny mt-s" style="color:rgba(17,17,17,.6)">Year is assigned by start date,
    per the glossary&#8217;s calculated field. Cycles that began in 2024 and ended in
    2026 sit in 2024.</p>
  </div>
  <div class="c5">
    <div class="rule-top">
      <h3 style="margin-top:0">The shape of a cycle</h3>
      <p class="small">Median duration is <b>{s["durations"]["median"]:.0f} days</b>
      (range {s["durations"]["min"]}&#8211;{s["durations"]["max"]}), mean
      {s["durations"]["mean"]}. A cycle carries <b>{s["per_cycle_parts"]:.1f}</b>
      starters and <b>{s["per_cycle_comp"]:.1f}</b> completions on average, and
      <b>{s["phcm"]:.1f}</b> participant-hours per completion.</p>
      <p class="small" style="margin-bottom:0">Two curricula only: CEO of Your New
      Life at 176 hours (Defy Ventures) and Guiding Rage Into Power at 104 hours (GRIP
      Training Institute). There is no variation in course length to analyse.</p>
    </div>
  </div>
</div>
"""
    return page(8, body, left="05 \u00b7 The measured core")


def p_completion(s):
    d, g = s["orgs"]["Defy Ventures"], s["orgs"]["GRIP Training Institute"]
    body = f"""
<div class="kicker"><span class="num">06</span> Completion</div>
<h1 class="display">Completion ranges from 32% to 82%.<br>At single-cycle facilities, it is a data point.</h1>
<p class="lede">The pooled rate is 58.6%. The spread around it is wide enough to be
interesting and thin enough to be dangerous: four of the fourteen facilities
contributed exactly one cycle.</p>

{figure(
    "5",
    "Completion rate by facility, against the pooled benchmark",
    chart_completion(s),
    "Source: <i>data/tpw-collective-impact.csv</i>, defensible subset (31 cycles). Rate = completions &#247; participants. "
    "Facilities ordered by rate. Single-cycle facilities are marked * and should not be read as performance.",
    "Measured",
)}

<div class="grid mt-l">
  <div class="c4 rule-top">
    <h3 style="margin-top:0">Defy 50.6% vs GRIP 69.3%</h3>
    <p class="small">That comparison is confounded twice over: the courses are 176
    and 104 hours, and removing four zero-completion rows lifts Defy from 40.4% to
    50.6% by taking 180 starters out of its denominator. The two figures are not
    measuring the same thing.</p>
  </div>
  <div class="c4 rule-top">
    <h3 style="margin-top:0">What the exclusions were</h3>
    <p class="small">Three <b>In Progress</b> rows and one <b>TBD</b>-completions row,
    each with 45 participants and no known completions. They are the difference
    between the raw sheet&#8217;s 52.0% and the defensible 58.6%.</p>
  </div>
  <div class="c4 rule-top">
    <h3 style="margin-top:0">A distinction that survives</h3>
    <p class="small">The year split is stable &#8212; 2024 at 58.4% and 2025 at 58.8%
    &#8212; and the facility spread survives the exclusion of every single-cycle site.
    Those two facts are the reportable ones.</p>
  </div>
</div>
"""
    return page(9, body, left="06 \u00b7 Completion")


def p_floor(s):
    body = f"""
<div class="kicker"><span class="num">07</span> The hours floor</div>
<h1 class="display">103,064 hours is not the total.<br>It is the floor.</h1>
<p class="lede">The calculated column is completions multiplied by course hours. A
participant who started and did not finish contributes zero hours to the sheet. The
sheet therefore reports the hours that finished, not the hours that were delivered.</p>

{figure(
    "6",
    "Delivered participant-hours against the mathematical ceiling",
    chart_floor(s),
    "Source: <i>data/tpw-collective-impact.csv</i>, defensible subset. Delivered = &#931;(completions &#215; course hours) = "
    f"{nfmt(s['ph'])} h. Ceiling = &#931;(participants &#215; course hours) = {nfmt(s['ceiling'])} h.",
    "Measured",
)}

<div class="grid mt-l">
  <div class="c4 rule-top">
    <div class="kicker" style="margin-bottom:.04in">The gap</div>
    <b class="serif" style="font-size:23pt;font-weight:400;line-height:1">{nfmt(s["gap"])}</b>
    <p class="small" style="margin-top:.05in">participant-hours never delivered
    &#8212; {s["gap_pct"]:.1f}% of what the same cycles could have produced if every
    starter finished.</p>
  </div>
  <div class="c4 rule-top">
    <div class="kicker" style="margin-bottom:.04in">The people</div>
    <b class="serif" style="font-size:23pt;font-weight:400;line-height:1">522</b>
    <p class="small" style="margin-top:.05in">starters who did not complete, out of
    1,261. The 79,920-hour gap is their unfinished programming, not lost funding.</p>
  </div>
  <div class="c4 rule-top">
    <div class="kicker" style="margin-bottom:.04in">Per completion</div>
    <b class="serif" style="font-size:23pt;font-weight:400;line-height:1">{s["phcm"]:.1f}</b>
    <p class="small" style="margin-top:.05in">participant-hours credited for each of
    the 739 completions &#8212; below both course lengths, which is what a
    completer-only count does.</p>
  </div>
</div>

<div class="pull mt">
  <span class="q">&#8220;They made me see that I am lovable and worthy of real love.&#8221;</span>
  <cite>Program participant &#183; TPW public site, verbatim</cite>
</div>
<p class="small mt-s" style="max-width:4.9in;color:rgba(17,17,17,.72)">The quote is the
reason the hour matters and also the reason the hour is not enough. Nothing in this
dataset connects a finished 104-hour cycle to what happened in the three years after
release. That is the next page but one.</p>
"""
    return page(10, body, left="07 \u00b7 The hours floor")
