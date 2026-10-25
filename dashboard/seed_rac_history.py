"""Add create-only synthetic history for the RAC example programs."""
import json
import urllib.request
import urllib.error
from seed_sample_data import BASE, KEY, encode, FACILITIES
from seed_rac_examples import examples
from seed_history import DATES

if __name__ == '__main__':
    created = 0
    for org_id, org_name, program_id, name, code, yards, hours, participants, completed in examples:
        for i, day in enumerate(DATES):
            progress = (i + 2) / (len(DATES) + 2)
            count = max(1, round(completed * progress))
            enrolled = max(count, round(participants * progress))
            program = dict(id=program_id, name=name, status='In Progress', startDate='2026-01-15', endDate='2026-10-20',
                courseHours=hours, participants=enrolled, participantsCompleted=count, assignments=[dict(code=code, yards=yards)])
            data = dict(schemaVersion=1,source='dashboard-rac-history',synthetic=True,orgId=org_id,organization=org_name,
                submittedAt=day+'T20:00:00Z',programs=[program],prisons=[dict(code=code,name=FACILITIES[code],yards=yards)],
                totals=dict(programs=1,courseHours=hours,participants=enrolled,participantsCompleted=count,participantHoursDelivered=hours*count))
            url=f'{BASE}/submissions?documentId=history-{program_id}-{day}&key={KEY}'
            req=urllib.request.Request(url,data=json.dumps({'fields':{k:encode(v) for k,v in data.items()}}).encode(),headers={'Content-Type':'application/json'},method='POST')
            try:
                with urllib.request.urlopen(req,timeout=20) as response: json.load(response)
                created += 1
            except urllib.error.HTTPError as error:
                if error.code != 409: raise RuntimeError(error.read().decode()) from error
    print(f'Created {created} historical RAC program submissions. Latest records unchanged.')
