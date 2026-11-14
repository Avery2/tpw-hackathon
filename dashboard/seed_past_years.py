"""Create-only fictional quarterly history for 2024 and 2025."""
import json
import urllib.request
import urllib.error
from seed_sample_data import BASE, KEY, encode, fixtures, FACILITIES
from seed_rac_examples import examples

if __name__ == '__main__':
    source = list(fixtures())
    created = 0
    for org_id, org_name in [('org-1','Org 1'),('org-2','Org 2')]:
        originals = [p for path,doc in source if path.startswith('submissions/') and doc['orgId']==org_id for p in doc['programs']]
        for item in examples:
            owner,_,pid,name,code,yards,hours,enrolled,completed=item
            if owner==org_id:
                originals.append(dict(id=pid,name=name,courseHours=hours,participants=enrolled,participantsCompleted=completed,assignments=[dict(code=code,yards=yards)]))
        for year in [2024,2025]:
            for quarter in range(1,5):
                progress=((year-2024)*4+quarter)/12
                factor=.35+progress*.5
                programs=json.loads(json.dumps(originals))
                start=f'{year}-{(quarter-1)*3+1:02d}-01'
                end=f'{year}-{quarter*3:02d}-'+('31' if quarter in [1,4] else '30')
                for i,p in enumerate(programs):
                    p.update(status='Completed',startDate=start,endDate=end)
                    p['participants']=max(6,round(p['participants']*factor)+(quarter%2))
                    p['participantsCompleted']=min(p['participants'],max(5,round(p['participants']*(.64+.025*quarter+.02*(year-2024)))))
                locations={}
                for p in programs:
                    for assignment in p['assignments']:
                        code=assignment['code']
                        entry=locations.setdefault(code,dict(code=code,name=FACILITIES[code],yards=[]))
                        entry['yards']=sorted(set(entry['yards'])|set(assignment['yards']))
                data=dict(schemaVersion=1,source='dashboard-quarterly-history',synthetic=True,orgId=org_id,organization=org_name,
                    reportingPeriod=dict(quarter=quarter,year=year),submittedAt=end+'T18:00:00Z',programs=programs,prisons=list(locations.values()),
                    totals=dict(programs=len(programs),courseHours=sum(p['courseHours'] for p in programs),participants=sum(p['participants'] for p in programs),
                        participantsCompleted=sum(p['participantsCompleted'] for p in programs),participantHoursDelivered=sum(p['courseHours']*p['participantsCompleted'] for p in programs)))
                id=f'sample-quarter-{org_id}-{year}-q{quarter}'
                req=urllib.request.Request(f'{BASE}/submissions?documentId={id}&key={KEY}',data=json.dumps({'fields':{k:encode(v) for k,v in data.items()}}).encode(),headers={'Content-Type':'application/json'},method='POST')
                try:
                    with urllib.request.urlopen(req,timeout=20) as response: json.load(response)
                    created+=1
                except urllib.error.HTTPError as error:
                    if error.code!=409: raise RuntimeError(error.read().decode()) from error
    print(f'Created {created} quarterly submissions for 2024–2025 across both organizations.')
