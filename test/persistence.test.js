import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { buildFixtureCycle } from './fixture-cycle.js';
import { loadStateDetailed, saveState, recoveryData } from '../dist/src/storage/db.js';
globalThis.indexedDB = indexedDB;
globalThis.window = globalThis;
const cycle = buildFixtureCycle(); const session = cycle.sessions[0]; const item = session.blocks[0].items[0];
const open = version => new Promise((resolve,reject)=> { const request=indexedDB.open('workout-runner',version); request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); });
const write = async (db,value) => { await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'singleton');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close(); };
test('real IndexedDB v1 upgrade preserves nonempty history and sparse draft; explicit layouts survive saves', async () => {
 const history={workoutId:'protected',cycleId:cycle.cycleId,sessionId:session.sessionId,revision:1,status:'complete',exercises:[{exerciseId:item.exerciseId,name:item.name,sets:[{setNumber:1,reps:0}]}],prescriptionSnapshot:session};
 await write(await open(1),{cycle,results:{results:[history]},draft:{sessionId:session.sessionId,workoutId:'draft',prescriptionSnapshot:session,actuals:{[item.exerciseId]:[{setNumber:2,reps:0}]}}});
 const loaded=await loadStateDetailed();assert.equal(loaded.warning,undefined);assert.deepEqual(loaded.state.results.results[0],history);
 assert.equal(loaded.state.draft.actuals[item.exerciseId][1].reps,0);assert.equal(loaded.state.draft.setLayoutVersion,1);
 const db=await open(2);assert.equal(db.version,2);db.close();
 loaded.state.activeWeek=3;loaded.state.draft.actuals[item.exerciseId]=[];await saveState(loaded.state);
 const reopened=await loadStateDetailed();assert.deepEqual(reopened.state.draft.actuals[item.exerciseId],[]);assert.equal(reopened.state.activeWeek,3);assert.deepEqual(reopened.state.results.results[0],history);
 reopened.state.draft.actuals[item.exerciseId]=[{setNumber:1},{setNumber:2},{setNumber:3,reps:0}];await saveState(reopened.state);
 assert.deepEqual((await loadStateDetailed()).state.draft.actuals[item.exerciseId],reopened.state.draft.actuals[item.exerciseId]);
});
test('damaged originals remain exportable and a colliding draft cannot rewrite protected history',async()=>{
 const raw={stateVersion:2,cycle,results:{results:[null,{workoutId:'protected',cycleId:cycle.cycleId,sessionId:session.sessionId,revision:1,status:'complete',exercises:[]}]},draft:{workoutId:'protected',sessionId:session.sessionId,prescriptionSnapshot:session,actuals:{}}};
 await write(await open(2),raw);
 const loaded=await loadStateDetailed();assert.match(loaded.warning,/protected historical result/);assert.equal(loaded.state.draft,undefined);assert.equal(loaded.state.results.results.length,1);
 assert.deepEqual(await recoveryData(),raw);assert.equal((await loadStateDetailed()).state.results.results[0].status,'complete');assert.deepEqual(await recoveryData(),raw);
});
