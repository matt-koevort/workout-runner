import test from "node:test";
import assert from "node:assert/strict";
import { buildFixtureCycle } from "./fixture-cycle.js";
import { emptyRunnerState } from "../dist/src/storage/types.js";
import { normalizeRunnerState } from "../dist/src/storage/db.js";

const cycle = buildFixtureCycle();

test("legacy persisted state is upgraded without losing cycle, results, draft or preferences", () => {
  const first = cycle.sessions[0];
  const legacy = {
    cycle,
    results: {
      schemaVersion: "1.0",
      kind: "results",
      results: [{
        workoutId: `${first.sessionId}-historical`,
        cycleId: cycle.cycleId,
        sessionId: first.sessionId,
        revision: 2,
        status: "complete",
        exercises: [],
        legacyField: "kept for export compatibility",
      }],
    },
    draft: {
      workoutId: first.sessionId,
      cycleId: cycle.cycleId,
      sessionId: first.sessionId,
      prescriptionSnapshot: first,
      startedAt: "2026-09-06T10:00:00.000Z",
      status: "in-progress",
      actuals: {},
      collapsedBlocks: [first.blocks[0].blockId],
      notes: ["remember setup"],
    },
    sessionsSinceBackup: 3,
    lastBackupAt: "2026-09-05T10:00:00.000Z",
  };

  const migrated = normalizeRunnerState(legacy);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.stateVersion, 2);
  assert.equal(migrated.state.cycle?.cycleId, cycle.cycleId);
  assert.equal(migrated.state.results.results[0].workoutId, `${first.sessionId}-historical`);
  assert.equal(migrated.state.results.results[0].legacyField, "kept for export compatibility");
  assert.equal(migrated.state.draft?.sessionId, first.sessionId);
  assert.deepEqual(migrated.state.draft?.collapsedBlocks, [first.blocks[0].blockId]);
  assert.equal(migrated.state.sessionsSinceBackup, 3);
  assert.equal(migrated.state.lastBackupAt, legacy.lastBackupAt);
});

test("malformed persisted fields fall back safely while retaining a usable cycle", () => {
  const legacy = {
    cycle,
    results: { schemaVersion: "old", kind: "results", results: [null, { nope: true }, { workoutId: "w", cycleId: cycle.cycleId, sessionId: "s", status: "complete" }] },
    draft: { broken: true },
    sessionsSinceBackup: "not-a-number",
  };
  const migrated = normalizeRunnerState(legacy);
  assert.equal(migrated.state.cycle?.cycleId, cycle.cycleId);
  assert.equal(migrated.state.results.results.length, 1);
  assert.equal(migrated.state.results.results[0].workoutId, "w");
  assert.deepEqual(migrated.state.results.results[0].exercises, []);
  assert.equal(migrated.state.draft, undefined);
  assert.equal(migrated.state.sessionsSinceBackup, 0);
  assert.equal(migrated.state.stateVersion, 2);
  assert.match(migrated.warning, /saved results were unreadable/);
});

test("empty state is versioned for newly installed browsers", () => {
  assert.deepEqual(emptyRunnerState(), { stateVersion: 2, results: { schemaVersion: "1.0", kind: "results", results: [] }, sessionsSinceBackup: 0 });
});
