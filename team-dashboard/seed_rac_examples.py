"""Create-only synthetic submissions with RAC threshold examples."""
import json
import urllib.error
import urllib.request
from seed_sample_data import BASE, KEY, encode, FACILITIES

examples = [
    ('org-1', 'Org 1', 'rac-restorative-intensive', 'Restorative Practices Intensive', 'ASP', ['North'], 104, 24, 20),
    ('org-1', 'Org 1', 'rac-community-leadership', 'Community Leadership', 'SQ', ['North'], 52, 22, 18),
    ('org-2', 'Org 2', 'rac-reentry-skills', 'Reentry Skills Intensive', 'SAC', ['South'], 156, 24, 20),
    ('org-2', 'Org 2', 'rac-peer-mentoring', 'Peer Mentoring', 'SOL', ['South'], 208, 18, 15),
]

if __name__ == '__main__':
    for org_id, org_name, program_id, name, code, yards, hours, participants, completed in examples:
        program = dict(id=program_id, name=name, status='Completed', startDate='2026-01-15', endDate='2026-10-20',
            courseHours=hours, participants=participants, participantsCompleted=completed,
            assignments=[dict(code=code, yards=yards)])
        data = dict(schemaVersion=1, source='dashboard-rac-example', synthetic=True,
            orgId=org_id, organization=org_name, submittedAt='2026-10-24T20:00:00Z',
            reportingPeriod=dict(quarter=4, year=2026),
            prisons=[dict(code=code, name=FACILITIES[code], yards=yards)], programs=[program],
            totals=dict(programs=1, courseHours=hours, participants=participants,
                participantsCompleted=completed, participantHoursDelivered=hours*completed))
        request = urllib.request.Request(f'{BASE}/submissions?documentId=sample-{program_id}&key={KEY}',
            data=json.dumps({'fields':{k:encode(v) for k,v in data.items()}}).encode(),
            headers={'Content-Type':'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=20) as response: json.load(response)
            print(f'Created {org_name}: {name} — {min(40, hours//52*10)*completed} estimated credit days')
        except urllib.error.HTTPError as error:
            if error.code == 409: print('Preserved existing example:', program_id)
            else: raise RuntimeError(error.read().decode()) from error
