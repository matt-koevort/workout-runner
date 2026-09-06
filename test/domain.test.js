import test from "node:test";
import assert from "node:assert/strict";
import { buildCurrentCycle } from "../dist/src/domain/cycle-builder.js";
import { renderCycleMarkdown } from "../dist/src/domain/render.js";
import { blankSetIsUnrecorded, mergeResults } from "../dist/src/domain/results.js";
import { validateCycle } from "../dist/src/domain/validation.js";
import { validateBundle, validateResults } from "../dist/src/domain/validation.js";
import { validateBundlePortable, validateResultsPortable } from "../dist/src/domain/portable-validation.js";

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

test("expanded accessory blocks preserve pair membership, rounds and lower logistics", () => {
  const cycle = buildCurrentCycle();
  const upper = cycle.sessions.find((session) => session.weekNumber === 1 && session.sequence === 1);
  const upperAccessories = upper.blocks.filter((block) => block.kind === "accessory");
  assert.deepEqual(upperAccessories.map((block) => [block.items.map((item) => item.name), block.rounds, block.restAfterRoundSeconds]), [
    [["Incline DB press", "Chest-supported DB row"], 3, 90],
    [["Low-to-high cable fly", "Cable face pull"], 2, 75],
  ]);
  const lower = cycle.sessions.find((session) => session.weekNumber === 1 && session.sequence === 3);
  assert.deepEqual(lower.blocks.filter((block) => block.kind === "accessory").map((block) => block.label), ["Hip thrust — straight sets", "Leg curl + leg extension — alternate", "Split squat tolerance work — straight sets"]);
  assert.equal(lower.blocks.some((block) => block.label === "Odd accessory pairing"), false);
});

test("main lift RIR fields agree with prescriptions and W1 remains a true baseline", () => {
  const cycle = buildCurrentCycle();
  for (const session of cycle.sessions.filter((candidate) => candidate.kind === "strength")) {
    const report = validateCycle(cycle);
    assert.equal(report.valid, true);
    const prescription = session.mainLift.prescription;
    const rir = [...prescription.matchAll(/(\d+(?:-\d+)?)\s*RIR/g)].at(-1)?.[1];
    if (rir) {
      const [min, max = min] = rir.split("-").map(Number);
      assert.ok(session.mainLift.targetRir >= min && session.mainLift.targetRir <= max, `${session.name} W${session.weekNumber} RIR mismatch`);
    }
  }
  const w1Upper = cycle.sessions.find((session) => session.weekNumber === 1 && session.sequence === 1);
  const prep = w1Upper.blocks.find((block) => block.kind === "preparation").items[0].prescription;
  assert.match(prep, /2 minutes easy row or SkiErg.*thread-the-needle.*band dislocates.*scapular push-ups.*band pull-aparts.*2-3 ramp-up sets/s);
  assert.match(w1Upper.blocks.find((block) => block.kind === "finisher").items[0].progression, /Establish a repeatable baseline/);
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

test("results schema round-trips rich actual fields and immutable prescription metadata", () => {
  const cycle = buildCurrentCycle();
  const session = cycle.sessions[0];
  const result = {
    workoutId: session.sessionId,
    cycleId: cycle.cycleId,
    sessionId: session.sessionId,
    revision: 1,
    cycleRevision: cycle.revision,
    status: "complete",
    startedAt: "2026-09-07T08:00:00.000Z",
    completedAt: "2026-09-07T08:47:00.000Z",
    prescriptionSnapshot: session,
    exercises: [{ exerciseId: session.mainLift.exerciseId, name: session.mainLift.name, sets: [{ setNumber: 1, loadKg: 80, load: 80, loadBasis: "barbell", unit: "kg", reps: 8, durationSeconds: 42, distanceMeters: 0, rir: 3, rpe: 7, completed: true, technique: "clean", note: "smooth" }] }],
    actuals: { [session.mainLift.exerciseId]: [{ setNumber: 1, load: 80, loadBasis: "barbell", unit: "kg", reps: 8, rir: 3, rpe: 7, completed: true, technique: "clean" }] },
    notes: ["felt good"],
  };
  const results = { schemaVersion: "1.0", kind: "results", results: [result] };
  const bundle = { schemaVersion: "1.0", kind: "cycle-bundle", exportedAt: "1970-01-01T00:00:00.000Z", bundleRevision: 1, cycle, results };
  assert.equal(validateResults(JSON.parse(JSON.stringify(results))).valid, true);
  assert.equal(validateBundle(JSON.parse(JSON.stringify(bundle))).valid, true);
  assert.equal(validateResultsPortable(JSON.parse(JSON.stringify(results))).valid, true);
  assert.equal(validateBundlePortable(JSON.parse(JSON.stringify(bundle))).valid, true);
});

test("results and bundles reject unknown fields in Node and browser validators", () => {
  const cycle = buildCurrentCycle();
  const session = cycle.sessions[0];
  const baseResult = { workoutId: session.sessionId, cycleId: cycle.cycleId, sessionId: session.sessionId, revision: 1, status: "in-progress", exercises: [{ exerciseId: "x", name: "x", sets: [{ setNumber: 1 }] }] };
  const withUnknownSet = { schemaVersion: "1.0", kind: "results", results: [{ ...baseResult, exercises: [{ ...baseResult.exercises[0], sets: [{ setNumber: 1, mystery: true }] }] }] };
  const withUnknownRoot = { schemaVersion: "1.0", kind: "results", results: [baseResult], unexpected: true };
  assert.equal(validateResults(withUnknownSet).valid, false);
  assert.equal(validateResults(withUnknownRoot).valid, false);
  assert.equal(validateResultsPortable(withUnknownSet).valid, false);
  assert.equal(validateResultsPortable(withUnknownRoot).valid, false);
  const bundle = { schemaVersion: "1.0", kind: "cycle-bundle", exportedAt: "now", cycle, results: { schemaVersion: "1.0", kind: "results", results: [baseResult] }, unexpected: true };
  assert.equal(validateBundle(bundle).valid, false);
  assert.equal(validateBundlePortable(bundle).valid, false);
});
