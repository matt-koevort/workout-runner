import test from "node:test";
import assert from "node:assert/strict";
import { buildFixtureCycle } from "./fixture-cycle.js";
import { applyImport } from "../dist/src/app/imports.js";
import { coreSessions, nextCoreSession, sessionStatus, sessionsForWeek } from "../dist/src/app/sequence.js";
import { currentInterval, makeTimer, timerRemaining } from "../dist/src/timers/timers.js";
import { stateToBundle } from "../dist/src/storage/db.js";

const cycle = buildFixtureCycle();
const base = { cycle, results: { schemaVersion: "1.0", kind: "results", results: [] }, sessionsSinceBackup: 0 };

test("core sequence advances only after explicit complete or skip", () => {
  const first = coreSessions(cycle)[0];
  assert.equal(nextCoreSession(cycle, base.results)?.sessionId, first.sessionId);
  const complete = { ...base, results: { ...base.results, results: [{ workoutId: first.sessionId, cycleId: cycle.cycleId, sessionId: first.sessionId, revision: 1, status: "in-progress", exercises: [] }] } };
  assert.equal(nextCoreSession(cycle, complete.results)?.sessionId, first.sessionId, "in-progress cannot advance");
  complete.results.results[0].status = "complete";
  assert.notEqual(nextCoreSession(cycle, complete.results)?.sessionId, first.sessionId);
});

test("week browser returns only the selected week's sessions in order", () => {
  assert.deepEqual(sessionsForWeek(cycle, 1).map((session) => session.weekNumber), [1, 1, 1, 1, 1]);
  assert.deepEqual(sessionsForWeek(cycle, 2).map((session) => session.sequence), [1, 2, 3, 4, 5]);
  assert.deepEqual(sessionsForWeek(cycle, 99), []);
});

test("session statuses distinguish upcoming, active, complete and skipped", () => {
  const [first, second, third] = coreSessions(cycle);
  const results = { results: [
    { workoutId: second.sessionId, cycleId: cycle.cycleId, sessionId: second.sessionId, revision: 1, status: "complete", exercises: [] },
    { workoutId: third.sessionId, cycleId: cycle.cycleId, sessionId: third.sessionId, revision: 1, status: "skipped", exercises: [] },
  ] };
  assert.equal(sessionStatus(first, results), "upcoming");
  assert.equal(sessionStatus(second, results), "completed");
  assert.equal(sessionStatus(third, results), "skipped");
  assert.equal(sessionStatus(first, results, first.sessionId), "in-progress");
});

test("out-of-order completion does not skip the earliest incomplete session", () => {
  const [first, second] = coreSessions(cycle);
  const results = { results: [{ workoutId: second.sessionId, cycleId: cycle.cycleId, sessionId: second.sessionId, revision: 1, status: "complete", exercises: [] }] };
  assert.equal(nextCoreSession(cycle, results)?.sessionId, first.sessionId);
});

test("malformed imports are atomic", () => {
  const original = JSON.stringify(base);
  assert.throws(() => applyImport(base, { kind: "cycle", schemaVersion: "1.0", cycleId: "broken" }), /Invalid cycle/);
  assert.equal(JSON.stringify(base), original);
});

test("timer restoration uses timestamps rather than a decrementing counter", () => {
  const timer = makeTimer("rest", 90, 1_000);
  assert.equal(timerRemaining(timer, 31_000), 60);
  const emom = makeTimer("emom", 180, 1_000, { intervalSeconds: 60, rounds: 3 });
  assert.equal(currentInterval(emom, 62_000).round, 2);
});

test("export bundle round-trips cycle and results without bundled user data", () => {
  const state = { ...base, results: { ...base.results, results: [{ workoutId: "w", cycleId: cycle.cycleId, sessionId: coreSessions(cycle)[0].sessionId, revision: 1, status: "complete", exercises: [] }] } };
  const bundle = stateToBundle(state);
  assert.equal(bundle?.kind, "cycle-bundle");
  const restored = JSON.parse(JSON.stringify(bundle));
  const next = applyImport({ results: { schemaVersion: "1.0", kind: "results", results: [] }, sessionsSinceBackup: 0 }, restored);
  assert.equal(next.cycle?.cycleId, cycle.cycleId);
  assert.equal(next.results.results.length, 1);
});
