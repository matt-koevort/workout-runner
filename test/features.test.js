import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixtureCycle } from './fixture-cycle.js';
import { activeWeekFor, nextCoreSession, previousExerciseResult, formatActual, performedRows, restorePerformedRows, setHasActual } from '../dist/src/app/sequence.js';
import { normalizeRunnerState, stateToBundle } from '../dist/src/storage/db.js';
import { applyImport } from '../dist/src/app/imports.js';
import { emptyRunnerState } from '../dist/src/storage/types.js';
import { validateResults } from '../dist/src/domain/validation.js';
const cycle = buildFixtureCycle();
const w1 = cycle.sessions[0], w3 = cycle.sessions.find(s => s.weekNumber === 3);
const item = w3.blocks[0].items[0];
const result = (session, status='complete', date='2026-09-01T12:00:00Z') => ({workoutId:session.sessionId,sessionId:session.sessionId,cycleId:cycle.cycleId,revision:1,status,completedAt:date,prescriptionSnapshot:session,exercises:[]});
test('active week selects later work without silently skipping earlier work, draft overrides selection', () => {
 const results={results:[result(w3,'skipped')]};
 assert.equal(activeWeekFor(cycle,results),3);
 assert.equal(nextCoreSession(cycle,results,undefined,3).weekNumber,3);
 assert.equal(nextCoreSession(cycle,results,w1.sessionId,3).sessionId,w1.sessionId);
 assert.equal(results.results.length,1);
 const later=cycle.sessions.filter(s=>s.weekNumber>=3).map(s=>result(s));
 assert.equal(nextCoreSession(cycle,{results:later},undefined,3).sessionId,w1.sessionId);
 assert.equal(nextCoreSession(cycle,{results:cycle.sessions.map(s=>result(s))}),undefined);
});
test('previous actuals prefer latest completed occurrence and ignore current, future and empty results', () => {
 const prior=cycle.sessions.find(s=>s.weekNumber===2 && s.sequence===1);
 const future=cycle.sessions.find(s=>s.weekNumber===4 && s.sequence===1);
 const old=result(w1); old.exercises=[{exerciseId:'legacy',name:`  ${item.name.toUpperCase()}  `,sets:[{setNumber:1,reps:0,load:20,unit:'lb',loadBasis:'per-side',rir:0,rpe:8,durationSeconds:0,distanceMeters:0,note:'Synthetic'}]}];
 const newer=result(prior,'complete','2026-09-02T12:00:00Z');newer.exercises=[{exerciseId:item.comparisonExerciseId ?? item.exerciseId,name:item.name,sets:[{setNumber:1,reps:5}]}];
 const upcoming=result(future,'complete','2026-09-03T12:00:00Z');upcoming.exercises=newer.exercises;
 const current=result(w3,'complete','2026-09-04T12:00:00Z'); current.exercises=newer.exercises;
 assert.equal(previousExerciseResult({results:[old,newer,upcoming,current]},w3,item.exerciseId,'2026-09-05T00:00:00Z',cycle),newer.exercises[0]);
 newer.exercises[0].sets=[{setNumber:1}];
 assert.equal(previousExerciseResult({results:[old,newer,upcoming]},w3,item.exerciseId,'2026-09-05T00:00:00Z',cycle),old.exercises[0]);
 assert.equal(previousExerciseResult({results:[old]},w3,item.exerciseId,'2026-08-01T00:00:00Z'),undefined);
 assert.match(formatActual(old.exercises[0].sets[0]),/20 lb · per-side · 0 reps · 0 RIR · 8 RPE · 0s · 0m · Synthetic/);
 assert.equal(setHasActual({setNumber:1,reps:0}),true);assert.equal(setHasActual({setNumber:1}),false);
});
test('legacy sparse rows expand; explicit performed layouts preserve zero, reduced and extra rows', () => {
 const prescribed={...item,sets:2};
 assert.deepEqual(restorePerformedRows(prescribed,[{setNumber:2,reps:0}]),[{setNumber:1},{setNumber:2,reps:0}]);
 for(const rows of [[],[{setNumber:1,reps:0}],[{setNumber:1},{setNumber:2},{setNumber:3,load:0}]]) {
  assert.deepEqual(restorePerformedRows(prescribed,rows,1),rows);
  assert.deepEqual(performedRows(prescribed,rows),rows);
  const r={...result(w3),setLayoutVersion:1,actuals:{[item.exerciseId]:rows},exercises:[{exerciseId:item.exerciseId,name:item.name,sets:rows}]};
  const state={...emptyRunnerState(),cycle,activeWeek:3,results:{schemaVersion:'1.0',kind:'results',results:[r]},draft:{workoutId:'draft',cycleId:cycle.cycleId,sessionId:w3.sessionId,prescriptionSnapshot:w3,startedAt:'2026-09-05T12:00:00Z',status:'in-progress',actuals:{[item.exerciseId]:rows},setLayoutVersion:1,collapsedBlocks:[],notes:[]}};
  const normalized=normalizeRunnerState(JSON.parse(JSON.stringify(state))).state;
  assert.deepEqual(normalized.draft.actuals[item.exerciseId],rows);assert.equal(normalized.activeWeek,3);
  assert.equal(validateResults(state.results).valid,true);
  const restored=applyImport(emptyRunnerState(),stateToBundle(state));
  assert.deepEqual(restored.results.results[0],r);
  assert.deepEqual(r.prescriptionSnapshot,w3);
 }
});
test('upgrading legacy draft preserves populated sparse sets and completed history exactly', () => {
 const history=result(w1);history.exercises=[{exerciseId:'old',name:'Old',sets:[{setNumber:1,reps:0}]}];
 const original=JSON.stringify(history);
 const state={cycle,results:{results:[history]},draft:{sessionId:w3.sessionId,prescriptionSnapshot:w3,actuals:{[item.exerciseId]:[{setNumber:2,reps:0}]}}};
 const normalized=normalizeRunnerState(state);
 assert.equal(normalized.migrated,true);assert.equal(normalized.state.draft.setLayoutVersion,1);
 assert.equal(normalized.state.draft.actuals[item.exerciseId].length,Math.max(item.sets ?? 1,2));
 assert.equal(normalized.state.draft.actuals[item.exerciseId][1].reps,0);
 assert.equal(JSON.stringify(normalized.state.results.results[0]),original);
});
test('exercise comparison lineage connects renamed exercises across several occurrences',()=>{
 const linked=structuredClone(cycle);const one=linked.sessions[0],three=linked.sessions.find(s=>s.weekNumber===3),five=linked.sessions.find(s=>s.weekNumber===5);
 const e1=one.blocks[0].items[0],e3=three.blocks[0].items[0],e5=five.blocks[0].items[0];e3.comparisonExerciseId=e1.exerciseId;e5.comparisonExerciseId=e3.exerciseId;
 const r=result(one);r.exercises=[{exerciseId:e1.exerciseId,name:'Old display name',sets:[{setNumber:1,reps:7}]}];
 assert.equal(previousExerciseResult({results:[r]},five,e5.exerciseId,'2026-09-05T00:00:00Z',linked),r.exercises[0]);
});
test('completion ordering compares instants across timezone offsets',()=>{
 const prior=cycle.sessions.find(s=>s.weekNumber===2 && s.sequence===1);
 const a=result(w1,'complete','2026-09-01T11:00:00+02:00');const b=result(prior,'complete','2026-09-01T10:00:00Z');
 for(const [r,reps] of [[a,1],[b,2]])r.exercises=[{exerciseId:item.exerciseId,name:item.name,sets:[{setNumber:1,reps}]}];
 assert.equal(previousExerciseResult({results:[a,b]},w3,item.exerciseId,'2026-09-01T11:00:00Z',cycle).sets[0].reps,2);
 assert.equal(activeWeekFor(cycle,{results:[a,b]}),2);
});
