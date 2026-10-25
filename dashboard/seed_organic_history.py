"""Backfill synthetic organizations and vary their generated quarterly history.
Only touches records explicitly marked synthetic from our organization seed.
"""
import copy
import hashlib
import json
import random
import urllib.request
from seed_sample_data import BASE, KEY, encode

ROOT='projects/tpw-hackathon/databases/(default)/documents'
def request(url,body):
    req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
def decode(v):
    if 'stringValue' in v:return v['stringValue']
    if 'booleanValue' in v:return v['booleanValue']
    if 'integerValue' in v:return int(v['integerValue'])
    if 'doubleValue' in v:return v['doubleValue']
    if 'arrayValue' in v:return [decode(x) for x in v['arrayValue'].get('values',[])]
    if 'mapValue' in v:return {k:decode(x) for k,x in v['mapValue'].get('fields',{}).items()}
    return None

def totals(programs):
    return dict(programs=len(programs),courseHours=sum(p['courseHours'] for p in programs),participants=sum(p['participants'] for p in programs),participantsCompleted=sum(p['participantsCompleted'] for p in programs),participantHoursDelivered=sum(p['courseHours']*p['participantsCompleted'] for p in programs))

if __name__=='__main__':
    rows=request(BASE+':runQuery?key='+KEY,{'structuredQuery':{'from':[{'collectionId':'submissions'}],'where':{'fieldFilter':{'field':{'fieldPath':'source'},'op':'EQUAL','value':{'stringValue':'organization-directory-seed'}}}}})
    records=[]
    for row in rows:
        if 'document' not in row:continue
        doc=row['document'];data={k:decode(v) for k,v in doc['fields'].items()}
        if data.get('synthetic') is True:records.append((doc['name'],data))
    grouped={}
    for name,data in records:grouped.setdefault(data['orgId'],[]).append((name,data))
    writes=[]
    # Broad growth with quarter-to-quarter changes rather than a smooth straight line.
    factors=[.58,.64,.61,.69,.73,.78,.74,.84,.89,.94,1.0]
    season_rates=[.70,.74,.67,.77,.73,.79,.70,.78,.75,.80,.76]
    for org_id,entries in grouped.items():
        latest=max(entries,key=lambda item:item[1]['submittedAt'])[1]
        for index in range(11):
            year=2024+index//4;quarter=index%4+1
            if year==2026:
                match=next(((name,data) for name,data in entries if data['reportingPeriod']=={'year':year,'quarter':quarter}),None)
                if match is None:continue # Preserve intentionally missing reports.
                name,record=match;record=copy.deepcopy(record)
            else:
                record=copy.deepcopy(latest);name=f'{ROOT}/submissions/history-{org_id}-{year}-q{quarter}'
                record.update(source='organization-quarterly-history',reportingPeriod=dict(year=year,quarter=quarter))
            seed=int(hashlib.sha256(f'{org_id}-{index}'.encode()).hexdigest()[:16],16)
            rng=random.Random(seed)
            # Latest source figures stay the anchor; earlier periods vary around them.
            for p,anchor in zip(record['programs'],latest['programs']):
                p['participants']=max(6,round(anchor['participants']*factors[index]*rng.uniform(.88,1.12)))
                rate=max(.4,min(.94,season_rates[index]+rng.uniform(-.09,.09)))
                p['participantsCompleted']=min(p['participants'],round(p['participants']*rate))
                p['startDate']=f'{year}-{(quarter-1)*3+1:02d}-05'
                p['endDate']=f'{year}-{quarter*3:02d}-'+('31' if quarter in [1,4] else '30')
                p['status']='Completed'
            record['submittedAt']=record['programs'][0]['endDate']+'T18:00:00Z';record['totals']=totals(record['programs'])
            assert all(0<=p['participantsCompleted']<=p['participants'] for p in record['programs'])
            writes.append({'update':{'name':name,'fields':{k:encode(v) for k,v in record.items()}}})
    for start in range(0,len(writes),100):
        request(BASE+':commit?key='+KEY,{'writes':writes[start:start+100]})
        print(f'Saved {min(start+100,len(writes))}/{len(writes)} synthetic quarter records',flush=True)
    print(f'Updated history for {len(grouped)} fictional organizations; reporting gaps preserved.')
