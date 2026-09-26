import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('worker precaches subpath assets before activation and serves the complete shell offline',async()=>{
 const handlers={}, entries=new Map();let offline=false,activated=false;const added=[]; const cache={addAll:async urls=>{added.push(...urls);for(const url of urls) entries.set(url,new Response('cached '+url));},match:async request=>entries.get(typeof request==='string'?request:request.url),put:async(request,response)=>entries.set(typeof request==='string'?request:request.url,response)};
 const context={URL,Promise,Error,Response,self:{registration:{scope:'https://example.test/workout-runner/'},addEventListener:(type,fn)=>handlers[type]=fn,skipWaiting:async()=>{activated=true;},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['workout-runner-shell-v3','unrelated-cache'],delete:async key=>{assert.equal(key,'workout-runner-shell-v3');}},fetch:async()=>{if(offline)throw Error('offline');return new Response('<script src="./assets/app.js"></script><link href="./assets/app.css">');}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 let promise;handlers.install({waitUntil:p=>promise=p});await promise;assert.equal(activated,true);assert.ok(added.includes('https://example.test/workout-runner/assets/app.js'));assert.ok(added.includes('https://example.test/workout-runner/assets/app.css'));
 handlers.activate({waitUntil:p=>promise=p});await promise;offline=true;
 let response;handlers.fetch({request:{url:'https://example.test/workout-runner/',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.match(await (await response).text(),/index.html/);
 handlers.fetch({request:{url:'https://example.test/workout-runner/assets/app.js',method:'GET'},respondWith:p=>response=p});assert.match(await(await response).text(),/assets\/app.js/);
});
