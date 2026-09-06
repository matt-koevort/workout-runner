import test from "node:test";
import assert from "node:assert/strict";
import { buildCurrentCycle } from "../dist/src/domain/cycle-builder.js";
import { renderCycleMarkdown } from "../dist/src/domain/render.js";
import { blankSetIsUnrecorded, mergeResults } from "../dist/src/domain/results.js";
import { validateCycle } from "../dist/src/domain/validation.js";

test("current migration is a valid fully expanded six-week cycle", () => {
  const cycle = buildCurrentCycle();
  assert.equal(validateCycle(cycle).valid, true);
  assert.equal(cycle.lengthWeeks, 6);
  assert.equal(cycle.sessions.length, 30);
  for (let week = 1; week <= 6; week += 1) {
    const sessions = cycle.sessions.filter((session) => session.weekNumber === week);
    assert.deepEqual(sessions.map((session) => session.sequence), [1, 2, 3, 4, 5]);
    assert.deepEqual(sessions.map((session) => session.kind), ["strength", "swim", "strength", "strength", "run"]);
  }
});

test("bench starts unrecorded and never invents a load", () => {
  const cycle = buildCurrentCycle();
  const bench = cycle.sessions[0].mainLift;
  assert.ok(bench);
  assert.equal(bench.plannedLoad?.kind, "none");
  assert.equal(bench.loadBasis, "establish-by-rir");
  assert.match(bench.prescription, /Establish a load for 4x8 @3 RIR/);
});

test("strength lineage points to the intended prior odd/even instances", () => {
  const cycle = buildCurrentCycle();
  for (const sequence of [1, 3, 4]) {
    const w3 = cycle.sessions.find((session) => session.weekNumber === 3 && session.sequence === sequence);
    const w5 = cycle.sessions.find((session) => session.weekNumber === 5 && session.sequence === sequence);
    const w4 = cycle.sessions.find((session) => session.weekNumber === 4 && session.sequence === sequence);
    assert.equal(w3.lineage.comparisonWeek, 1);
    assert.equal(w5.lineage.comparisonWeek, 3);
    assert.equal(w4.lineage.comparisonWeek, 2);
  }
});

test("upper finishers are ten minutes and follow direct arm work; deload omits them", () => {
  const cycle = buildCurrentCycle();
  for (const session of cycle.sessions.filter((candidate) => candidate.kind === "strength" && candidate.name.startsWith("Upper"))) {
    const arm = session.blocks.find((block) => block.kind === "arm");
    const finisher = session.blocks.find((block) => block.kind === "finisher");
    if (session.weekNumber === 6) assert.equal(finisher, undefined);
    else { assert.equal(finisher.durationMinutes, 10); assert.ok(arm.order < finisher.order); }
  }
});

test("results merge is idempotent and conflict-safe by workoutId/revision", () => {
  const one = { schemaVersion: "1.0", kind: "results", results: [{ workoutId: "w1", cycleId: "c", sessionId: "s", revision: 1, status: "complete", exercises: [] }] };
  const same = mergeResults(one, one);
  assert.equal(same.ignored, 1);
  assert.deepEqual(same.conflicts, []);
  const newer = mergeResults(one, { ...one, results: [{ ...one.results[0], revision: 2, notes: ["updated"] }] });
  assert.equal(newer.replaced, 1);
  const conflict = mergeResults(one, { ...one, results: [{ ...one.results[0], notes: ["different"] }] });
  assert.deepEqual(conflict.conflicts, ["w1"]);
});

test("blank is not zero and Markdown rendering is deterministic", () => {
  assert.equal(blankSetIsUnrecorded({}), true);
  assert.equal(blankSetIsUnrecorded({ loadKg: 0, reps: 0 }), false);
  const cycle = buildCurrentCycle();
  assert.equal(renderCycleMarkdown(cycle), renderCycleMarkdown(cycle));
  assert.match(renderCycleMarkdown(cycle), /Week 6 — Deload/);
});
