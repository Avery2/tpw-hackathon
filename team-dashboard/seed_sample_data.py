"""Create-only synthetic Firestore fixtures for the dashboard. Standard library only.
Run explicitly: python3 team-dashboard/seed_sample_data.py
Existing documents are never overwritten. No real organization or participant data.
"""
import json
import urllib.error
import urllib.request

BASE = 'https://firestore.googleapis.com/v1/projects/tpw-hackathon/databases/(default)/documents'
KEY = 'AIzaSyCI-GZSIwSNzJq8R3WockZ9guTsZLGwrsY'
STAMP = '2026-10-24T18:00:00Z'
FACILITIES = {
    'ASP': 'Avenal State Prison (ASP)',
    'SQ': 'San Quentin Rehabilitation Center (SQ)',
    'SAC': 'California State Prison, Sacramento (SAC)',
    'SOL': 'California State Prison, Solano (SOL)',
}

def program(id, name, status, code, yards, hours, participants, completed):
    return dict(id=id, name=name, status=status,
                assignments=[dict(code=code, yards=yards)],
                startDate='2026-09-01', endDate='2026-12-15',
                courseHours=hours, participants=participants, participantsCompleted=completed)


def fixtures():
    groups = {
        'org-1': [
            program('restorative-dialogue', 'Restorative Dialogue', 'In Progress', 'ASP', ['North', 'South'], 24, 32, 18),
            program('creative-pathways', 'Creative Pathways', 'Completed', 'SQ', ['North'], 18, 24, 21),
            program('life-skills', 'Life Skills Workshop', 'Planned', 'ASP', ['South'], 12, 20, 0),
        ],
        'org-2': [
            program('wellness', 'Mindfulness & Wellness', 'In Progress', 'SAC', ['North'], 16, 28, 12),
            program('career-readiness', 'Career Readiness', 'Completed', 'SOL', ['South'], 30, 22, 19),
            program('peer-leadership', 'Peer Leadership', 'Planned', 'SAC', ['South'], 20, 18, 0),
        ],
    }
    for org_id, programs in groups.items():
        name = 'Org 1' if org_id == 'org-1' else 'Org 2'
        yield f'orgs/{org_id}', dict(name=name, synthetic=True, createdAt=STAMP,
            description='Sample organization with fictional program data for exploring the dashboard.',
            programCatalog=[dict(id=p['id'], name=p['name']) for p in programs])
        for i, batch in enumerate([programs[:2], programs[2:]], 1):
            codes = sorted({a['code'] for p in batch for a in p['assignments']})
            prisons = [dict(code=code, name=FACILITIES[code], yards=sorted({y for p in batch for a in p['assignments'] if a['code'] == code for y in a['yards']})) for code in codes]
            totals = dict(programs=len(batch), courseHours=sum(p['courseHours'] for p in batch),
                participants=sum(p['participants'] for p in batch), participantsCompleted=sum(p['participantsCompleted'] for p in batch),
                participantHoursDelivered=sum(p['courseHours'] * p['participantsCompleted'] for p in batch))
            yield f'submissions/sample-{org_id}-{i}', dict(schemaVersion=1, source='dashboard-sample', synthetic=True,
                orgId=org_id, organization=name, submittedAt=STAMP, programs=batch, prisons=prisons, totals=totals)


def encode(value):
    if isinstance(value, bool): return {'booleanValue': value}
    if isinstance(value, str): return {'stringValue': value}
    if isinstance(value, int): return {'integerValue': str(value)}
    if isinstance(value, float): return {'doubleValue': value}
    if isinstance(value, list): return {'arrayValue': {'values': [encode(item) for item in value]}}
    return {'mapValue': {'fields': {key: encode(item) for key, item in value.items()}}}


def seed():
    for path, data in fixtures():
        collection, id = path.split('/')
        request = urllib.request.Request(f'{BASE}/{collection}?documentId={id}&key={KEY}',
            data=json.dumps({'fields': {key: encode(value) for key, value in data.items()}}).encode(),
            headers={'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                json.load(response)
            print('Created', path)
        except urllib.error.HTTPError as error:
            if error.code == 409: print('Already exists; preserved', path)
            else: raise RuntimeError(error.read().decode()) from error

if __name__ == '__main__':
    seed()
