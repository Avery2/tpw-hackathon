import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSubmission} from '../../server/validation.js';
const fixture=()=>({organization:'Test organization',reportingPeriod:{year:2026,quarter:4},prisons:[{code:'SQ',name:'Facility',yards:['North']}],programs:[{name:'Program',status:'Completed',startDate:'2026-10-01',endDate:'2026-10-31',courseHours:104,participants:20,participantsCompleted:15,assignments:[{code:'SQ',yards:['North']}]}]});
test('recomputes totals rather than trusting caller totals',()=>{const d=fixture();d.totals={participants:999};assert.equal(validateSubmission(d).totals.participants,20);assert.equal(validateSubmission(d).totals.participantHoursDelivered,1560);});
test('rejects completions greater than enrolled',()=>{const d=fixture();d.programs[0].participantsCompleted=21;assert.throws(()=>validateSubmission(d),/cannot exceed/);});
test('rejects an assignment outside the selected facilities',()=>{const d=fixture();d.programs[0].assignments[0].yards=['Other'];assert.throws(()=>validateSubmission(d),/must belong/);});
test('rejects negative counts, impossible dates, invalid quarters',()=>{for(const edit of [d=>d.programs[0].participants=-1,d=>d.programs[0].startDate='2026-02-30',d=>d.reportingPeriod.quarter=5]){const d=fixture();edit(d);assert.throws(()=>validateSubmission(d));}});
