import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { indexedDB } from 'fake-indexeddb';
import { buildFixtureCycle } from './fixture-cycle.js';
import { emptyRunnerState } from '../dist/src/storage/types.js';
import { loadStateDetailed, saveState } from '../dist/src/storage/db.js';

const waitFor = async predicate => {
 const deadline=Date.now()+3000;
 while(Date.now()<deadline){ if(await predicate())return; await new Promise(resolve=>setTimeout(resolve,5)); }
 assert.fail('Expected persisted edit did not arrive');
};
test('actual input saves before blur without a tick, preserves zero and handles rapid edits in order',async()=>{
 const window=new Window({url:'http://localhost:4173/'});
 window.document.body.innerHTML='<div id="app"></div>';
 window.HTMLElement.prototype.scrollIntoView=()=>{};
 globalThis.window=window;globalThis.document=window.document;globalThis.indexedDB=indexedDB;
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const cycle=buildFixtureCycle();const session=cycle.sessions[0];const exercise=session.blocks.flatMap(b=>b.items).find(i=>i.sets===2);
 const draft={workoutId:session.sessionId,cycleId:cycle.cycleId,sessionId:session.sessionId,prescriptionSnapshot:session,startedAt:'2026-09-01T12:00:00Z',status:'in-progress',setLayoutVersion:1,actuals:{[exercise.exerciseId]:[{setNumber:1,completed:true},{setNumber:2}]},collapsedBlocks:[],notes:[]};
 await saveState({...emptyRunnerState(),cycle,draft});
 // Run the built application; Node needs only the browser CSS import removed.
 const entry=new URL('../dist/src/app/autosave-test-main.mjs',import.meta.url);
 await writeFile(entry,(await readFile(new URL('../dist/src/app/main.js',import.meta.url),'utf8')).replace('import "./styles.css";',''));
 try {
  await import(entry.href);
  await waitFor(()=>document.querySelector('[data-action="resume"]'));
  document.querySelector('[data-action="resume"]').click();
  const input=document.querySelector(`[data-exercise="${exercise.exerciseId}"][data-set="1"][data-field="reps"]`);
  assert.ok(input);await new Promise(resolve=>window.requestAnimationFrame(resolve));input.focus();
  const edit=value=>{input.value=value;input.dispatchEvent(new window.Event('input',{bubbles:true}));};
  const saved=async()=> (await loadStateDetailed()).state.draft.actuals[exercise.exerciseId][0];
  edit('0');await waitFor(async()=> (await saved()).reps===0);
  assert.ok(document.activeElement===input,"typing must keep focus");assert.equal(document.querySelector('[data-action="set-complete"]'),null);
  assert.equal((await saved()).completed,true,'legacy completion flag survives actual edits');
  for(const value of ['1','12','123','1234'])edit(value);
  await waitFor(async()=> (await saved()).reps===1234);
  edit('.');await new Promise(resolve=>setTimeout(resolve,20));assert.equal((await saved()).reps,1234);
  edit('');await waitFor(async()=> (await saved()).reps===undefined);
  assert.ok(document.activeElement===input,"typing must keep focus");
  const note=document.querySelector(`[data-exercise="${exercise.exerciseId}"][data-field="note"]`);
  note.value='Synthetic note';note.dispatchEvent(new window.Event('input',{bubbles:true}));
  await waitFor(async()=> (await saved()).note==='Synthetic note');
  assert.equal((await loadStateDetailed()).state.results.results[0].exercises.find(e=>e.exerciseId===exercise.exerciseId).sets[0].note,'Synthetic note');
 } finally { await unlink(entry);await window.happyDOM.close(); }
});
