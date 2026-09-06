const cycleId = "fixture-six-week-cycle";

function exercise(id, name, role, prescription, loadBasis = "none", extra = {}) {
  return {
    exerciseId: id,
    name,
    role,
    prescription,
    progression: "Progress with clean technique and the smallest practical change.",
    loadBasis,
    ...extra,
  };
}

function block(sessionId, order, kind, label, items, extra = {}) {
  return { blockId: `${sessionId}-b${order}`, kind, label, order, items, ...extra };
}

function lineage(week, kind, sequence) {
  if (kind !== "strength") return { variant: "endurance", comparison: week === 1 ? "baseline" : "progresses", comparisonWeek: week === 1 ? undefined : week - 1 };
  if (week === 1) return { variant: "odd", comparison: "baseline" };
  if (week === 2) return { variant: "even", comparison: "baseline" };
  const comparisonWeek = week === 6 ? 4 : week === 5 ? 3 : week === 4 ? 2 : 1;
  return {
    variant: week === 6 ? "deload" : week % 2 === 0 ? "even" : "odd",
    comparison: week === 6 ? "deloads" : "progresses",
    comparisonWeek,
    comparisonSessionId: `${cycleId}-w${comparisonWeek}-s${String(sequence).padStart(2, "0")}`,
  };
}

function strength(week, sequence, name, mainName, mainLoadBasis, accessories, lower = false) {
  const id = `${cycleId}-w${week}-s${String(sequence).padStart(2, "0")}`;
  const main = exercise(`${id}-main`, mainName, "main", week === 1 ? "Establish a load for 4x8 @3 RIR" : "4x8-10 at the prior earned load @2 RIR", mainLoadBasis, {
    sets: 4,
    reps: week === 1 ? 8 : "8-10",
    targetRir: week === 1 ? 3 : 2,
    restSeconds: 120,
    plannedLoad: { kind: "none" },
  });
  const blocks = [
    block(id, 1, "preparation", "Preparation", [exercise(`${id}-prep`, "Session preparation", "warmup", "Easy cardio; mobility; ramp-up sets")]),
    block(id, 2, "main", `Main lift — ${mainName}`, [main]),
  ];
  if (lower) {
    blocks.push(
      block(id, 3, "accessory", "Hip bridge — straight sets", [accessories[0]], { rounds: 3, restAfterRoundSeconds: 90, format: "straight sets" }),
      block(id, 4, "accessory", "Hamstring curl + leg extension — alternate", [accessories[1], accessories[2]], { rounds: 3, restAfterRoundSeconds: 75, format: "alternate; complete both movements before resting" }),
      block(id, 5, "accessory", "Split-stance tolerance work — straight sets", [accessories[3]], { rounds: 2, restAfterRoundSeconds: 60, format: "straight sets" }),
    );
  } else {
    blocks.push(
      block(id, 3, "accessory", "Primary pair", accessories.slice(0, 2), { rounds: 3, restAfterRoundSeconds: 90, format: "superset; complete both movements before resting" }),
      block(id, 4, "accessory", "Secondary pair", accessories.slice(2, 4), { rounds: 2, restAfterRoundSeconds: 75, format: "superset; complete both movements before resting" }),
      block(id, 5, "arm", "Direct arm work — before conditioning", [
        exercise(`${id}-curl`, "Cable curl", "arm", "2x10-15 @1-2 RIR", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 1.5, restSeconds: 45 }),
        exercise(`${id}-triceps`, "Rope triceps pressdown", "arm", "2x10-15 @1-2 RIR", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 1.5, restSeconds: 45 }),
      ], { rounds: 2, restAfterRoundSeconds: 45 }),
    );
    if (week !== 6) blocks.push(block(id, 6, "finisher", "Finisher — 10-minute AMRAP", [exercise(`${id}-condition-1`, "Push-up", "conditioning", "8 reps", "none", { progression: week <= 2 ? "Establish a repeatable baseline score; future appearances progress from it." : "Progress from the comparison score without reaching failure." }), exercise(`${id}-condition-2`, "Band row", "conditioning", "12 reps", "none", { progression: week <= 2 ? "Establish a repeatable baseline score; future appearances progress from it." : "Progress from the comparison score without reaching failure." })], { format: "10-minute AMRAP", durationMinutes: 10 }));
  }
  return { sessionId: id, cycleId, weekNumber: week, sequence, name, kind: "strength", targetDurationMinutes: lower ? 45 : 50, blocks, mainLift: main, lineage: lineage(week, "strength", sequence), notes: ["Record actual work and keep blank fields unrecorded."] };
}

function swim(week) {
  const id = `${cycleId}-w${week}-s02`;
  const intervalItems = ["300 m easy", "4x50 m smooth", "10x100 m steady", "4x50 m relaxed", "100 m easy"].map((prescription, index) => exercise(`${id}-swim-${index + 1}`, "Freestyle interval", "interval", prescription));
  return { sessionId: id, cycleId, weekNumber: week, sequence: 2, name: "Swim — freestyle intervals", kind: "swim", targetDurationMinutes: 45, blocks: [
    block(id, 1, "preparation", "Pool preparation", [exercise(`${id}-prep`, "Easy freestyle", "warmup", "Settle technique")]),
    block(id, 2, "interval", "Main swim", intervalItems),
    block(id, 3, "cooldown", "Cool-down", [], { format: "Easy freestyle cool-down" }),
  ], lineage: lineage(week, "swim", 2), notes: ["totalMeters=1800", "Use a 25 m pool and protect technique."] };
}

function run(week) {
  const id = `${cycleId}-w${week}-s05`;
  return { sessionId: id, cycleId, weekNumber: week, sequence: 5, name: "Run — controlled intervals", kind: "run", targetDurationMinutes: 40, blocks: [
    block(id, 1, "preparation", "Run preparation", [exercise(`${id}-warmup`, "Easy run and strides", "warmup", "Easy warm-up and relaxed strides")]),
    block(id, 2, "interval", "Controlled intervals", [exercise(`${id}-main`, "Run interval main set", "interval", "Repeatable intervals at controlled effort")]),
    block(id, 3, "cooldown", "Cool-down", [exercise(`${id}-cooldown`, "Easy run or walk", "recovery", "Easy conversational effort")]),
  ], lineage: lineage(week, "run", 5), notes: ["Use a low-impact substitute if needed."] };
}

export function buildFixtureCycle() {
  const sessions = [];
  for (let week = 1; week <= 6; week += 1) {
    const upperA = `${cycleId}-w${week}-s01`;
    const upperB = `${cycleId}-w${week}-s04`;
    sessions.push(
      strength(week, 1, "Upper A — horizontal push/pull", "Barbell bench press", "establish-by-rir", [
        exercise(`${upperA}-press`, "Incline press", "accessory", "3x8-12 @2 RIR", "smallest-practical-increase", { sets: 3, reps: "8-12", targetRir: 2 }),
        exercise(`${upperA}-row`, "Supported row", "accessory", "3x8-12 @2 RIR", "smallest-practical-increase", { sets: 3, reps: "8-12", targetRir: 2 }),
        exercise(`${upperA}-fly`, "Cable fly", "accessory", "2x12-15 @2 RIR", "smallest-practical-increase", { sets: 2, reps: "12-15", targetRir: 2 }),
        exercise(`${upperA}-face`, "Face pull", "accessory", "2x12-15 @2 RIR", "smallest-practical-increase", { sets: 2, reps: "12-15", targetRir: 2 }),
      ]),
      swim(week),
      strength(week, 3, "Lower — simple lower-body work", "Leg press", "establish-by-rir", [
        exercise(`${cycleId}-w${week}-s03-bridge`, "Hip bridge", "accessory", "3x8-12 @2 RIR", "smallest-practical-increase", { sets: 3, reps: "8-12", targetRir: 2 }),
        exercise(`${cycleId}-w${week}-s03-curl`, "Hamstring curl", "accessory", "3x10-15 @2 RIR", "smallest-practical-increase", { sets: 3, reps: "10-15", targetRir: 2 }),
        exercise(`${cycleId}-w${week}-s03-extension`, "Leg extension", "accessory", "3x10-15 @2 RIR", "smallest-practical-increase", { sets: 3, reps: "10-15", targetRir: 2 }),
        exercise(`${cycleId}-w${week}-s03-split`, "Split-stance tolerance work", "accessory", "2x8/side @3 RIR", "bodyweight-or-tolerance", { sets: 2, reps: 8, repsPerSide: true, targetRir: 3 }),
      ], true),
      strength(week, 4, "Upper B — vertical push/pull", "Barbell strict press", "range", [
        exercise(`${upperB}-pull`, "Pull-up", "accessory", "3x6-10 @2 RIR", "bodyweight-or-tolerance", { sets: 3, reps: "6-10", targetRir: 2 }),
        exercise(`${upperB}-lateral`, "Lateral raise", "accessory", "3x10-15 @2 RIR", "smallest-practical-increase", { sets: 3, reps: "10-15", targetRir: 2 }),
        exercise(`${upperB}-row`, "Cable row", "accessory", "2x10-12 @2 RIR", "smallest-practical-increase", { sets: 2, reps: "10-12", targetRir: 2 }),
        exercise(`${upperB}-rear`, "Rear-delt fly", "accessory", "2x12-15 @2 RIR", "smallest-practical-increase", { sets: 2, reps: "12-15", targetRir: 2 }),
      ]),
      run(week),
    );
  }
  return {
    schemaVersion: "1.0", kind: "cycle", cycleId, name: "Example Six-Week Cycle", status: "planned", startDate: "2025-01-06", lengthWeeks: 6, revision: 1,
    previousCycle: null, primaryGoal: "general strength and fitness", enduranceGoal: "maintain aerobic capacity",
    weeks: [1, 2, 3, 4, 5, 6].map((weekNumber) => ({ weekNumber, label: weekNumber === 6 ? "Deload" : `Build ${weekNumber}`, phase: weekNumber === 6 ? "deload" : "build" })),
    sessions, optionalRecovery: { name: "Optional recovery", kind: "recovery", optional: true, choices: ["Easy walk", "Easy bike", "Mobility"] },
    substitutions: [{ planned: "Barbell bench press", substitute: "Machine press", when: "The planned setup is unavailable" }],
    progressionRules: ["Add reps before load and keep technique consistent.", "Complete sessions in order."],
  };
}
