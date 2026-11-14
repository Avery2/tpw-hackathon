"""Create-only fictional organizations and quarterly submissions for the dashboard.
Run explicitly. Existing records are preserved; repeat runs do not duplicate them.
"""
import json
import urllib.request
import urllib.error
from seed_sample_data import BASE, KEY, encode, FACILITIES

PREFIXES=['Community','New Horizons','Pathways','Together','Second Chance','Restorative','Bridge','Hope','Forward','Renewal','Open Door','Resilience']
SUFFIXES=['Collective','Initiative','Network','Project','Foundation','Partners','Alliance','Center','Works','Connection']
PROGRAMS=[('Life Skills',52),('Restorative Dialogue',104),('Creative Expression',24),('Career Readiness',78),('Peer Leadership',156)]

def create(collection,id,data):
    req=urllib.request.Request(f'{BASE}/{collection}?documentId={id}&key={KEY}',data=json.dumps({'fields':{k:encode(v) for k,v in data.items()}}).encode(),headers={'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=20) as response: json.load(response)
        return 1
    except urllib.error.HTTPError as error:
        if error.code==409:return 0
        raise RuntimeError(error.read().decode()) from error

if __name__=='__main__':
    org_count=record_count=0
    facilities=list(FACILITIES)
    for i in range(120):
        org_id=f'demo-org-{i+1:03d}'
        name=f'{PREFIXES[i//10]} {SUFFIXES[i%10]}'
        catalog=[dict(id=f'program-{j+1}',name=PROGRAMS[(i+j)%len(PROGRAMS)][0]) for j in range(2+i%2)]
        org_count+=create('orgs',org_id,dict(name=name,description='Fictional organization for dashboard demonstrations.',synthetic=True,source='organization-directory-seed',createdAt='2025-01-01T18:00:00Z',programCatalog=catalog))
        for quarter in [1,2,3]:
            # Deliberate reporting gaps let the tracker demonstrate follow-up lists.
            if (quarter==3 and i%5==0) or (quarter==2 and i%9==0):continue
            month=quarter*3
            end=f'2026-{month:02d}-'+('31' if quarter==1 else '30')
            programs=[];locations={}
            for j,entry in enumerate(catalog):
                code=facilities[(i+j)%len(facilities)];yard='North' if (i+j)%2==0 else 'South'
                count=12+(i*7+j*3+quarter*2)%35
                completed=round(count*(.58+((i+j+quarter)%7)*.05))
                programs.append(dict(id=entry['id'],name=entry['name'],status='Completed',startDate=f'2026-{(quarter-1)*3+1:02d}-05',endDate=end,courseHours=PROGRAMS[(i+j)%len(PROGRAMS)][1],participants=count,participantsCompleted=completed,assignments=[dict(code=code,yards=[yard])]))
                location=locations.setdefault(code,dict(code=code,name=FACILITIES[code],yards=[]))
                if yard not in location['yards']:location['yards'].append(yard)
            data=dict(schemaVersion=1,source='organization-directory-seed',synthetic=True,orgId=org_id,organization=name,reportingPeriod=dict(quarter=quarter,year=2026),submittedAt=end+'T18:00:00Z',prisons=list(locations.values()),programs=programs,
                totals=dict(programs=len(programs),courseHours=sum(p['courseHours'] for p in programs),participants=sum(p['participants'] for p in programs),participantsCompleted=sum(p['participantsCompleted'] for p in programs),participantHoursDelivered=sum(p['courseHours']*p['participantsCompleted'] for p in programs)))
            record_count+=create('submissions',f'demo-{org_id}-2026-q{quarter}',data)
        if (i+1)%30==0:print(f'Processed {i+1}/120 organizations',flush=True)
    print(f'Created {org_count} organizations and {record_count} quarterly submissions.',flush=True)
