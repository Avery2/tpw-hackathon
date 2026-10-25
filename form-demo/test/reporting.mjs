import assert from 'node:assert/strict';
import { currentReportingPeriod } from '../js/reporting-period.js';
import { checkinDraft } from '../../dashboard/js/checkin-data.js';
const cases = [
  ['2026-01-01T07:59:59Z',4,2025], ['2026-01-01T08:00:00Z',1,2026],
  ['2026-04-01T06:59:59Z',1,2026], ['2026-04-01T07:00:00Z',2,2026],
  ['2026-07-01T06:59:59Z',2,2026], ['2026-07-01T07:00:00Z',3,2026],
  ['2026-10-01T06:59:59Z',3,2026], ['2026-10-01T07:00:00Z',4,2026],
  ['2027-01-01T07:59:59Z',4,2026], ['2027-01-01T08:00:00Z',1,2027]
];
for (const [date,quarter,year] of cases) assert.deepEqual(currentReportingPeriod(new Date(date)), {quarter,year});
const sample = {org:{id:'org-1',name:'Synthetic Test'},submissions:[{
  id:'old',submittedAt:'2025-11-01T00:00:00Z',reportingPeriod:{quarter:4,year:2025},
  prisons:[{code:'SQ',name:'San Quentin',yards:['North']}],programs:[{
    id:'stable-program',name:'Synthetic Program',status:'Completed',notes:'Old quarter context',
    assignments:[{code:'SQ',yards:['North']}],participants:99,participantsCompleted:90,courseHours:10
  }]
}]};
const draft = checkinDraft(sample, new Date('2026-10-25T05:00:00Z'));
assert.deepEqual(draft.reportingPeriod,{quarter:4,year:2026});
assert.equal(draft.programs[0].id,'stable-program');assert.equal(draft.programs[0].needsReview,true);
const values = draft.programs[0].values;
assert.equal(Object.entries(values).find(([key])=>key.endsWith('[scheduled_status]'))[1],'');
assert.equal(Object.entries(values).find(([key])=>key.endsWith('[notes]'))[1],'');
assert.equal(Object.entries(values).find(([key])=>key.endsWith('[participants]'))[1],'0');
assert.deepEqual(checkinDraft({org:sample.org,submissions:[]},new Date('2027-01-01T07:59:59Z')).reportingPeriod,{quarter:4,year:2026});
console.log('PASS 10 California quarter-boundary cases; current-quarter check-in, stable IDs, no Planned default, no old notes/counts carried forward.');
