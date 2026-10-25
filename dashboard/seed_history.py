"""Create-only synthetic participant history for the dashboard graph.
Run: python3 dashboard/seed_history.py. Existing documents are preserved.
"""
import json
import urllib.request
from seed_sample_data import BASE, KEY, STAMP, fixtures, encode

# Historical snapshots precede the latest seeded reports. Counts are enrollments.
DATES = ['2026-05-01', '2026-05-15', '2026-06-01', '2026-06-15',
         '2026-07-01', '2026-07-15', '2026-08-01', '2026-08-15',
         '2026-09-01', '2026-09-15', '2026-10-01', '2026-10-15']
FACTORS = {
    'org-1': [.18, .24, .31, .37, .43, .40, .52, .61, .68, .77, .85, .94],
    'org-2': [.12, .19, .26, .34, .39, .46, .44, .56, .65, .72, .84, .93],
}

def historical_fixtures():
    records = list(fixtures())
    for org_id, factors in FACTORS.items():
        originals = [value for path, value in records if path.startswith('submissions/') and value['orgId'] == org_id]
        for day, factor in zip(DATES, factors):
            programs = json.loads(json.dumps([p for doc in originals for p in doc['programs']]))
            for program in programs:
                program['participants'] = max(1, round(program['participants'] * factor))
                program['participantsCompleted'] = min(program['participants'], round(program['participantsCompleted'] * factor))
                program['status'] = 'In Progress'
                program['startDate'] = '2026-04-01'
                program['endDate'] = '2026-10-24'
            prisons = {}
            for doc in originals:
                for prison in doc['prisons']:
                    entry = prisons.setdefault(prison['code'], dict(code=prison['code'], name=prison['name'], yards=[]))
                    entry['yards'] = sorted(set(entry['yards']) | set(prison['yards']))
            yield f'history-{org_id}-{day}', dict(
                schemaVersion=1, source='dashboard-history', synthetic=True,
                orgId=org_id, organization=originals[0]['organization'],
                submittedAt=day+'T18:00:00Z', prisons=list(prisons.values()), programs=programs,
                totals=dict(programs=len(programs), courseHours=sum(p['courseHours'] for p in programs),
                    participants=sum(p['participants'] for p in programs),
                    participantsCompleted=sum(p['participantsCompleted'] for p in programs),
                    participantHoursDelivered=sum(p['courseHours']*p['participantsCompleted'] for p in programs)))

if __name__ == '__main__':
    import urllib.error
    created = 0
    for id, data in historical_fixtures():
        request = urllib.request.Request(f'{BASE}/submissions?documentId={id}&key={KEY}',
            data=json.dumps({'fields': {key:encode(value) for key,value in data.items()}}).encode(),
            headers={'Content-Type':'application/json'},method='POST')
        try:
            with urllib.request.urlopen(request,timeout=20) as response: json.load(response)
            created += 1
        except urllib.error.HTTPError as error:
            if error.code != 409: raise RuntimeError(error.read().decode()) from error
    print(f'Created {created} historical submissions across {len(DATES)} dates for two organizations.')
