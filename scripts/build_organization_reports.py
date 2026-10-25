#!/usr/bin/env python3
"""Build static, explicitly synthetic organization PDF previews; never contacts Firebase.

Uses the dashboard's checked-in demo fixtures, not live submissions. Requires Chrome
(CHROME_BIN overrides the macOS default). Run from any directory:
    python3 scripts/build_organization_reports.py
The combined TPW PDF is a separately preserved prototype, not built by this script.
"""
import html
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'report' / 'organizations'
CHROME = os.environ.get('CHROME_BIN', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
spec = importlib.util.spec_from_file_location('demo_fixtures', ROOT / 'dashboard/seed_sample_data.py')
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    records = list(fixtures.fixtures())
    for key in ('org-1', 'org-2'):
        submissions = [data for path, data in records if path.startswith('submissions/') and data['orgId'] == key]
        assert submissions and all(data['synthetic'] for data in submissions)
        programs = [p for data in submissions for p in data['programs']]
        enrolled = sum(p['participants'] for p in programs)
        completed = sum(p['participantsCompleted'] for p in programs)
        hours = sum(p['participantsCompleted'] * p['courseHours'] for p in programs)
        prisons = len({a['code'] for p in programs for a in p['assignments']})
        name = html.escape(submissions[0]['organization'])
        rows = ''.join(f'<tr><td><b>{html.escape(p["name"])}</b><small>{html.escape(p["status"])}</small></td><td>{html.escape(", ".join(a["code"] for a in p["assignments"]))}</td><td>{p["participants"]}</td><td>{p["participantsCompleted"]}</td><td>{p["courseHours"]}</td><td>{p["participantsCompleted"] * p["courseHours"]:,}</td></tr>' for p in programs)
        bars = ''.join(f'<div class="bar-row"><span>{html.escape(p["name"])}</span><div class="track"><div style="width:{p["participantsCompleted"] / p["participants"] * 100:.2f}%"></div></div><b>{p["participantsCompleted"]} / {p["participants"]}</b></div>' for p in programs)
        document = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>{name} — Annual report preview 2026</title>
<style>
@font-face{{font-family:Degular;src:url('../../assets/fonts/degular-text-500.woff2')}}
@font-face{{font-family:Degular;src:url('../../assets/fonts/degular-text-700.woff2');font-weight:700}}
@font-face{{font-family:Rubik;src:url('../../assets/fonts/rubik-one.woff2')}}
@page{{size:Letter;margin:0}}*{{box-sizing:border-box}}body{{margin:0;color:#000;font:12px/1.35 Degular,Arial,sans-serif}}main{{padding:35px 42px}}header{{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:18px}}header img{{width:175px}}.badge{{background:#edca72;padding:7px 12px;border-radius:20px;font-weight:700}}.eyebrow{{text-transform:uppercase;letter-spacing:1.8px;font-weight:700;font-size:11px;margin-top:24px;color:#5d8d67}}h1{{font:32px/1.1 Rubik,Arial,sans-serif;margin:8px 0 12px}}h2{{font:16px Rubik,Arial,sans-serif;margin:24px 0 12px}}p{{margin:9px 0}}.intro{{font-size:15px;max-width:590px}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:#7cc089;padding:20px;margin:22px 0}}.metrics strong{{font:27px Rubik,Arial,sans-serif;display:block}}.metrics span{{font-size:12px}}table{{width:100%;border-collapse:collapse;font-size:11px}}th{{text-align:right;border-bottom:2px solid #000;padding:9px 5px}}td{{text-align:right;padding:10px 5px;border-bottom:1px solid #ddd}}th:first-child,td:first-child{{text-align:left;width:29%}}small{{display:block;color:#555;font-size:10px;margin-top:3px}}.bar-row{{display:grid;grid-template-columns:170px 1fr 60px;gap:12px;align-items:center;margin:10px 0}}.track{{height:15px;background:#eee}}.track div{{height:15px;background:#5d8d67}}.note{{background:#f5f6f3;border-left:4px solid #5d8d67;padding:12px 16px;margin-top:20px}}footer{{margin-top:22px;border-top:1px solid #aaa;padding-top:10px;color:#555;font-size:10px;display:flex;justify-content:space-between}}
main{{padding:28px 38px}}header img{{width:150px}}header{{padding-bottom:12px}}h1{{font-size:28px}}h2{{margin-top:18px}}.eyebrow{{margin-top:18px}}.intro{{font-size:14px}}.metrics{{padding:16px;margin:18px 0}}td{{padding:8px 5px}}.note{{padding:10px 14px;margin-top:16px}}footer{{margin-top:16px}}
</style><main><header><img src="../../assets/img/logo.png" alt="Transformative Programming Works"><span class="badge">SYNTHETIC DEMO · NOT FOR PUBLICATION</span></header>
<div class="eyebrow">Annual report preview · 2026</div><h1>{name}<br>Our programs, together.</h1>
<p class="intro">Community-based programs create space for healing in California prisons. This preview shows how an organization’s program information can become a clear, shareable account of its work.</p>
<p><b>Fictional organization. Made-up figures.</b> Fixed snapshot from the dashboard demo fixtures dated October 24, 2026; not a complete annual account and not connected to live dashboard updates.</p>
<div class="metrics"><div><strong>{len(programs)}</strong><span>Programs</span></div><div><strong>{prisons}</strong><span>Facilities</span></div><div><strong>{enrolled}</strong><span>Program enrollments</span></div><div><strong>{hours:,}</strong><span>Participant-hours completed</span></div></div>
<h2>What our programs delivered · demo figures</h2>
<table><thead><tr><th>Program / status</th><th>Facility</th><th>Enrolled</th><th>Completed</th><th>Course hours</th><th>Participant-hours</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Completion by program · demo figures</h2>{bars}
<p><b>{completed} of {enrolled} enrollments completed ({completed / enrolled:.1%}).</b> Includes planned and in-progress programs, so this is a snapshot ratio, not a final annual completion rate.</p>
<div class="note"><b>What these numbers do—and do not—tell us</b><p>Enrollments count program places, not unique people. Participant-hours equal completions × course hours; partial attendance is not measured. These activity figures do not establish changes in return to prison, release dates, or public savings.</p><p><b>Source:</b> dashboard/seed_sample_data.py, synthetic Org {key[-1]} fixtures. Live data was not used. This public prototype contains no real member organization’s private report.</p></div>
<footer><span>Transformative Programming Works · Hack for Social Impact prototype</span><span>2026 · {name} · 1 / 1</span></footer></main></html>'''
        source = OUT / f'{key}-annual-report-2026.html'
        pdf = OUT / f'{key}-annual-report-2026.pdf'
        source.write_text(document)
        with tempfile.TemporaryDirectory(prefix='tpw-report-chrome-') as profile:
            subprocess.run([CHROME, '--headless', '--no-sandbox', '--disable-gpu', f'--user-data-dir={profile}', '--no-pdf-header-footer', '--allow-file-access-from-files', f'--print-to-pdf={pdf}', source.as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        assert pdf.read_bytes().startswith(b'%PDF-')
        print(f'{key}: {enrolled} enrollments, {completed} completions, {hours} participant-hours → {pdf.relative_to(ROOT)}')


if __name__ == '__main__':
    build()
