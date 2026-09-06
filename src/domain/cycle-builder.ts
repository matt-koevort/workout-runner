import type {
  CycleDocument, ExercisePrescription, PlannedLoad, WorkoutBlock, WorkoutSession,
} from "./types.js";

const cycleId = "2026-09-07-hybrid-hypertrophy-base";

function ex(
  exerciseId: string,
  name: string,
  role: ExercisePrescription["role"],
  prescription: string,
  progression: string,
  loadBasis: ExercisePrescription["loadBasis"] = "none",
  extra: Partial<ExercisePrescription> = {},
): ExercisePrescription {
  return { exerciseId, name, role, prescription, progression, loadBasis, ...extra };
}

function block(sessionId: string, order: number, kind: WorkoutBlock["kind"], label: string, items: ExercisePrescription[], extra: Partial<WorkoutBlock> = {}): WorkoutBlock {
  return { blockId: `${sessionId}-${kind}`, kind, label, order, items, ...extra };
}

function preparationFor(name: string): string {
  if (name.startsWith("Upper A")) return "2 minutes easy row or SkiErg; thread-the-needle x8/side; band dislocates x12; scapular push-ups x10; band pull-aparts x15; then 2-3 ramp-up sets of barbell bench press.";
  if (name.startsWith("Upper B")) return "2 minutes easy row or bike; cat-cow x8; shoulder CARs x6/side; band external rotation x12/side; scapular pull-ups x8; then 2 ramp-up sets of strict press.";
  return "3 minutes easy bike; glute bridge x10; bodyweight hip hinge x10; low step-up x6/side; then one light ramp-up set each for leg press and the first secondary lift.";
}

function accessoryGroups(name: string, odd: boolean, accessories: ExercisePrescription[], deload: boolean): Array<{ label: string; items: ExercisePrescription[]; rounds: number; restAfterRoundSeconds: number; format?: string }> {
  if (name.startsWith("Lower")) {
    const groups = odd
      ? [
        { label: "Hip thrust — straight sets", items: accessories.slice(0, 1), rounds: 3, restAfterRoundSeconds: 90, format: "straight sets" },
        { label: "Leg curl + leg extension — alternate", items: accessories.slice(1, 3), rounds: 3, restAfterRoundSeconds: 75, format: "alternate; complete both movements before resting" },
        { label: "Split squat tolerance work — straight sets", items: accessories.slice(3, 4), rounds: 2, restAfterRoundSeconds: 60, format: "straight sets" },
      ]
      : [
        { label: "DB RDL or trap-bar deadlift — straight sets", items: accessories.slice(0, 1), rounds: 3, restAfterRoundSeconds: 90, format: "straight sets; do not superset" },
        { label: "Leg extension + leg curl — alternate", items: accessories.slice(1, 3), rounds: 3, restAfterRoundSeconds: 75, format: "alternate; complete both movements before resting" },
        { label: "Hip thrust — straight sets", items: accessories.slice(3, 4), rounds: 2, restAfterRoundSeconds: 75, format: "straight sets" },
      ];
    return deload ? groups.slice(0, 2) : groups;
  }
  const primaryLabel = `${odd ? "Odd" : "Even"} primary pair`;
  const secondaryLabel = `${odd ? "Odd" : "Even"} secondary pair`;
  return [
    { label: primaryLabel, items: accessories.slice(0, 2), rounds: deload ? 2 : 3, restAfterRoundSeconds: 90, format: "superset; complete both movements before resting" },
    { label: secondaryLabel, items: accessories.slice(2, 4), rounds: deload ? 1 : 2, restAfterRoundSeconds: 75, format: "superset; complete both movements before resting" },
  ];
}

function baselineFinisher(week: number, items: ExercisePrescription[]): ExercisePrescription[] {
  if (week !== 1 && week !== 2) return items;
  return items.map((item) => ({ ...item, progression: "Establish a repeatable baseline score at the prescribed effort; future appearances progress from this score." }));
}

const mainPlans = {
  bench: [
    { prescription: "Establish a load for 4x8 @3 RIR", loadBasis: "establish-by-rir" as const, plannedLoad: { kind: "none" as const } },
    { prescription: "4x9 at W1 load @2-3 RIR", loadBasis: "repeat-prior-earned" as const, plannedLoad: { kind: "relative" as const, reference: "W1 earned load" } },
    { prescription: "4x10 at W1 load @2 RIR", loadBasis: "repeat-prior-earned" as const, plannedLoad: { kind: "relative" as const, reference: "W1 earned load" } },
    { prescription: "If W3 was earned, add 2.5 kg; 4x8 @2 RIR", loadBasis: "smallest-practical-increase" as const, plannedLoad: { kind: "relative" as const, kg: 2.5, reference: "W3 earned load" } },
    { prescription: "4x9-10 at W4 load @1-2 RIR", loadBasis: "repeat-prior-earned" as const, plannedLoad: { kind: "relative" as const, reference: "W4 earned load" } },
    { prescription: "2x8 at 85-90% of W4 load @4 RIR", loadBasis: "percentage-of-reference" as const, plannedLoad: { kind: "relative" as const, percentOfReference: 0.875, reference: "W4 load" } },
  ],
  legPress: [
    { prescription: "4x8 @110 kg and 3 RIR", loadBasis: "absolute" as const, plannedLoad: { kind: "exact" as const, kg: 110 } },
    { prescription: "4x9 @110 kg and 2-3 RIR", loadBasis: "absolute" as const, plannedLoad: { kind: "exact" as const, kg: 110 } },
    { prescription: "4x10 @110 kg and 2 RIR", loadBasis: "absolute" as const, plannedLoad: { kind: "exact" as const, kg: 110 } },
    { prescription: "If W3 was earned, 4x8 @120 kg and 2 RIR", loadBasis: "absolute" as const, plannedLoad: { kind: "exact" as const, kg: 120 } },
    { prescription: "4x9-10 at W4 load @1-2 RIR", loadBasis: "repeat-prior-earned" as const, plannedLoad: { kind: "relative" as const, reference: "W4 load" } },
    { prescription: "2x8 @95-105 kg and 4 RIR", loadBasis: "range" as const, plannedLoad: { kind: "range" as const, minKg: 95, maxKg: 105 } },
  ],
  strictPress: [
    { prescription: "4x8 @35-37.5 kg and 3 RIR", loadBasis: "range" as const, plannedLoad: { kind: "range" as const, minKg: 35, maxKg: 37.5 } },
    { prescription: "4x9 at W1 load @2-3 RIR", loadBasis: "repeat-prior-earned" as const, plannedLoad: { kind: "relative" as const, reference: "W1 earned load" } },
    { prescription: "4x10 at W1 load @2 RIR", loadBasis: "repeat-prior-earned" as const, plannedLoad: { kind: "relative" as const, reference: "W1 earned load" } },
    { prescription: "If W3 was earned, 4x8 @40 kg and 2 RIR", loadBasis: "absolute" as const, plannedLoad: { kind: "exact" as const, kg: 40 } },
    { prescription: "4x9-10 at W4 load @1-2 RIR", loadBasis: "repeat-prior-earned" as const, plannedLoad: { kind: "relative" as const, reference: "W4 load" } },
    { prescription: "2x8 @32.5-35 kg and 4 RIR", loadBasis: "range" as const, plannedLoad: { kind: "range" as const, minKg: 32.5, maxKg: 35 } },
  ],
} as const;

function mainExercise(week: number, key: keyof typeof mainPlans, id: string, name: string): ExercisePrescription {
  const plan = mainPlans[key][week - 1];
  const rirMatches = [...plan.prescription.matchAll(/(\d+(?:-\d+)?)\s*RIR/g)].map((match) => match[1]);
  const rirText = rirMatches.at(-1) ?? "2";
  const rirParts = rirText.split("-").map(Number);
  return ex(id, name, "main", plan.prescription, "Add reps before load; only increase after every set earns the target RIR and clean technique.", plan.loadBasis, {
    plannedLoad: plan.plannedLoad,
    sets: plan.prescription.startsWith("2x") ? 2 : 4,
    reps: plan.prescription.includes("4x9-10") ? "9-10" : plan.prescription.match(/(?:4x|2x)(\d+)/)?.[1] ? Number(plan.prescription.match(/(?:4x|2x)(\d+)/)?.[1]) : undefined,
    targetRir: rirParts.length === 2 ? (rirParts[0] + rirParts[1]) / 2 : rirParts[0],
    restSeconds: 120,
  });
}

function lineage(week: number, kind: WorkoutSession["kind"], sequence: number): WorkoutSession["lineage"] {
  if (kind !== "strength") return { variant: "endurance", comparison: week === 1 ? "baseline" : "progresses", comparisonWeek: week === 1 ? undefined : week - 1 };
  if (week === 1) return { variant: "odd", comparison: "baseline" };
  if (week === 2) return { variant: "even", comparison: "baseline" };
  const comparisonWeek = week === 6 ? 4 : week === 5 ? 3 : week === 4 ? 2 : 1;
  const comparisonSequence = sequence;
  return {
    variant: week === 6 ? "deload" : week % 2 === 0 ? "even" : "odd",
    comparison: week === 6 ? "deloads" : week === 4 ? "progresses" : "progresses",
    comparisonWeek,
    comparisonSessionId: `${cycleId}-w${comparisonWeek}-s${String(comparisonSequence).padStart(2, "0")}`,
    reason: week === 6 ? "even selection at reduced volume and load; finisher omitted" : `progresses W${comparisonWeek} at the same role`,
  };
}

function strengthSession(week: number, sequence: number, name: string, main: ExercisePrescription, odd: boolean, targetDurationMinutes: number, accessories: ExercisePrescription[], arms: ExercisePrescription[], finisher?: { format: string; items: ExercisePrescription[] }): WorkoutSession {
  const id = `${cycleId}-w${week}-s${String(sequence).padStart(2, "0")}`;
  const deload = week === 6;
  const blocks: WorkoutBlock[] = [
    block(id, 1, "preparation", "Preparation", [ex(`${id}-prep-1`, "Session preparation", "warmup", preparationFor(name), "Complete this ordered sequence before working sets.")]),
    block(id, 2, "main", `Main lift — ${main.name}`, [main]),
  ];
  for (const group of accessoryGroups(name, odd, accessories, deload)) blocks.push(block(id, blocks.length + 1, "accessory", group.label, group.items, { rounds: group.rounds, restAfterRoundSeconds: group.restAfterRoundSeconds, format: group.format }));
  if (arms.length) blocks.push(block(id, blocks.length + 1, "arm", "Direct arm work — before conditioning", arms, { rounds: deload ? 1 : 2, restAfterRoundSeconds: 45 }));
  if (finisher && !deload) blocks.push(block(id, blocks.length + 1, "finisher", `Finisher — ${finisher.format}`, finisher.items, { format: finisher.format, durationMinutes: 10 }));
  const notes = ["Record actual load, reps and final-set RIR; blank means unrecorded, never zero."];
  if (name.startsWith("Lower")) notes.push("Record hip response during, later that day and the following morning; stop or substitute sharp, worsening or lingering pain.");
  return { sessionId: id, cycleId, weekNumber: week, sequence, name, kind: "strength", targetDurationMinutes, blocks, mainLift: main, lineage: lineage(week, "strength", sequence), notes };
}

function upperA(week: number): WorkoutSession {
  const id = `${cycleId}-w${week}-s01`;
  const odd = week % 2 === 1;
  const main = mainExercise(week, "bench", `${id}-bench`, "Barbell bench press");
  const accessories = odd
    ? [ex(`${id}-incline-db`, "Incline DB press", "accessory", "3x8-12 @2 RIR", "Add reps across all sets, then smallest practical load increase.", "smallest-practical-increase", { sets: 3, reps: "8-12", targetRir: 2, restSeconds: 90 }), ex(`${id}-chest-row`, "Chest-supported DB row", "accessory", "3x8-12 @2 RIR", "Add reps across all sets, then smallest practical load increase.", "smallest-practical-increase", { sets: 3, reps: "8-12", targetRir: 2, restSeconds: 90 }), ex(`${id}-fly`, "Low-to-high cable fly", "accessory", "2x12-15 @2 RIR", "Reach top of range before load.", "smallest-practical-increase", { sets: 2, reps: "12-15", targetRir: 2, restSeconds: 60 }), ex(`${id}-face-pull`, "Cable face pull", "accessory", "2x12-15 @2 RIR", "Reach top of range before load.", "smallest-practical-increase", { sets: 2, reps: "12-15", targetRir: 2, restSeconds: 60 })]
    : [ex(`${id}-floor-press`, "Neutral-grip DB floor press", "accessory", "3x8-12 @2 RIR", "Add reps across all sets, then smallest practical load increase.", "smallest-practical-increase", { sets: 3, reps: "8-12", targetRir: 2, restSeconds: 90 }), ex(`${id}-one-arm-row`, "One-arm DB row", "accessory", "3x10-12/side @2 RIR", "Add reps across all sets, then smallest practical load increase.", "smallest-practical-increase", { sets: 3, reps: "10-12", repsPerSide: true, targetRir: 2, restSeconds: 90 }), ex(`${id}-cable-press`, "Standing cable chest press", "accessory", "2x10-15 @2 RIR", "Reach top of range before load.", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 2, restSeconds: 60 }), ex(`${id}-straight-pulldown`, "Straight-arm cable pulldown", "accessory", "2x10-15 @2 RIR", "Reach top of range before load.", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 2, restSeconds: 60 })];
  const arms = odd ? [ex(`${id}-curl`, "One-arm low-cable curl; upper arm slightly in front", "arm", "2x10-15/side @1-2 RIR", "Reach top of range before load.", "smallest-practical-increase", { sets: 2, reps: "10-15", repsPerSide: true, targetRir: 1.5, restSeconds: 45 }), ex(`${id}-triceps`, "Rope triceps pressdown", "arm", "2x10-15 @1-2 RIR", "Reach top of range before load.", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 1.5, restSeconds: 45 })] : [ex(`${id}-curl`, "Standing rope cable curl; elbows slightly in front", "arm", "2x10-15 @1-2 RIR", "Reach top of range before load.", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 1.5, restSeconds: 45 }), ex(`${id}-triceps`, "Overhead rope triceps extension", "arm", "2x10-15 @1-2 RIR", "Reach top of range before load.", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 1.5, restSeconds: 45 })];
  const finisher = odd ? { format: "10-minute AMRAP", items: [ex(`${id}-pushups`, "Hand-release push-ups", "conditioning", "8 reps", "Beat the comparison score by 1-3 reps without failure.", "bodyweight-or-tolerance"), ex(`${id}-band-row`, "Anchored band rows", "conditioning", "12 reps", "Beat the comparison score by 1-3 reps without failure.", "bodyweight-or-tolerance"), ex(`${id}-hollow`, "Hollow hold", "conditioning", "20 seconds", "Beat the comparison score by 1-3 reps without failure.", "bodyweight-or-tolerance")] } : { format: "alternating EMOM for 10 minutes", items: [ex(`${id}-squeeze`, "Light DB squeeze press", "conditioning", "10 reps on odd minutes", "Add one rep per minute or a small load increase, not both.", "smallest-practical-increase"), ex(`${id}-renegade`, "Renegade rows", "conditioning", "8 total reps on even minutes", "Add one rep per minute or a small load increase, not both.", "smallest-practical-increase")] };
  return strengthSession(week, 1, "Upper A — horizontal push/pull", main, odd, 50, accessories, arms, { ...finisher, items: baselineFinisher(week, finisher.items) });
}

function lower(week: number): WorkoutSession {
  const id = `${cycleId}-w${week}-s03`;
  const odd = week % 2 === 1;
  const main = mainExercise(week, "legPress", `${id}-leg-press`, "Leg press");
  const accessories = odd ? [ex(`${id}-hip-thrust`, "Hip thrust", "accessory", "3x8-12 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 3, reps: "8-12", targetRir: 2, restSeconds: 90 }), ex(`${id}-leg-curl`, "Leg curl", "accessory", "3x10-15 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 3, reps: "10-15", targetRir: 2, restSeconds: 75 }), ex(`${id}-leg-extension`, "Leg extension", "accessory", "3x10-15 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 3, reps: "10-15", targetRir: 2, restSeconds: 75 }), ex(`${id}-split-squat`, "Split squat tolerance work", "accessory", "2x8/side @3 RIR; bodyweight or light DBs", "Progress only while hip remains pain-free.", "bodyweight-or-tolerance", { sets: 2, reps: 8, repsPerSide: true, targetRir: 3, restSeconds: 60 })] : [ex(`${id}-rdl`, "DB Romanian deadlift or simple trap-bar deadlift", "accessory", "3x8-10 @3 RIR (W2), 2 RIR (W4)", "Add reps then smallest load increase; no superset.", "smallest-practical-increase", { sets: 3, reps: "8-10", targetRir: week === 4 ? 2 : 3, restSeconds: 90 }), ex(`${id}-leg-extension`, "Leg extension", "accessory", "3x12-15 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 3, reps: "12-15", targetRir: 2, restSeconds: 75 }), ex(`${id}-leg-curl`, "Leg curl", "accessory", "3x12-15 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 3, reps: "12-15", targetRir: 2, restSeconds: 75 }), ex(`${id}-hip-thrust`, "Hip thrust", "accessory", "2x12-15 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "12-15", targetRir: 2, restSeconds: 75 })];
  return strengthSession(week, 3, "Lower — squat-free hypertrophy", main, odd, 45, accessories, []);
}

function upperB(week: number): WorkoutSession {
  const id = `${cycleId}-w${week}-s04`;
  const odd = week % 2 === 1;
  const main = mainExercise(week, "strictPress", `${id}-strict-press`, "Barbell strict press");
  const accessories = odd ? [ex(`${id}-pullup`, "Pull-up or assisted pull-up", "accessory", "3x6-10 @2 RIR", "Add reps; use assistance when needed to retain 2 RIR.", "bodyweight-or-tolerance", { sets: 3, reps: "6-10", targetRir: 2, restSeconds: 90 }), ex(`${id}-lateral`, "Lean-away DB lateral raise", "accessory", "3x10-15/side @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 3, reps: "10-15", repsPerSide: true, targetRir: 2, restSeconds: 75 }), ex(`${id}-row`, "Half-kneeling one-arm cable row", "accessory", "2x10-12/side @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "10-12", repsPerSide: true, targetRir: 2, restSeconds: 60 }), ex(`${id}-rear-delt`, "Cable rear-delt fly", "accessory", "2x12-15 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "12-15", targetRir: 2, restSeconds: 60 })] : [ex(`${id}-arnold`, "Seated Arnold press", "accessory", "3x8-12 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 3, reps: "8-12", targetRir: 2, restSeconds: 90 }), ex(`${id}-rear-row`, "Chest-supported rear-delt row", "accessory", "3x10-15 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 3, reps: "10-15", targetRir: 2, restSeconds: 90 }), ex(`${id}-pulldown`, "Neutral-grip lat pulldown", "accessory", "2x8-12 @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "8-12", targetRir: 2, restSeconds: 75 }), ex(`${id}-cable-lateral`, "Cable lateral raise", "accessory", "2x12-15/side @2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "12-15", repsPerSide: true, targetRir: 2, restSeconds: 60 })];
  const arms = odd ? [ex(`${id}-bayesian`, "Bayesian cable curl; upper arm behind torso", "arm", "2x10-15/side @1-2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "10-15", repsPerSide: true, targetRir: 1.5, restSeconds: 45 }), ex(`${id}-oh-triceps`, "Overhead rope triceps extension", "arm", "2x10-15 @1-2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 1.5, restSeconds: 45 })] : [ex(`${id}-incline-curl`, "Incline DB curl; upper arms behind torso", "arm", "2x10-15 @1-2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 1.5, restSeconds: 45 }), ex(`${id}-lying-triceps`, "Lying DB triceps extension", "arm", "2x10-15 @1-2 RIR", "Add reps then smallest load increase.", "smallest-practical-increase", { sets: 2, reps: "10-15", targetRir: 1.5, restSeconds: 45 })];
  const finisher = odd ? { format: "alternating EMOM for 10 minutes", items: [ex(`${id}-ski`, "SkiErg", "conditioning", "8-12 calories on odd minutes", "Add one calorie or rep per minute at RPE <=8.", "smallest-practical-increase"), ex(`${id}-push-press`, "Light DB push press", "conditioning", "8 total reps on even minutes", "Add one calorie or rep per minute at RPE <=8.", "smallest-practical-increase")] } : { format: "10-minute AMRAP", items: [ex(`${id}-db-push`, "Light alternating DB push press", "conditioning", "6 total reps", "Beat W2 by 1-3 reps or make one small load increase, not both.", "smallest-practical-increase"), ex(`${id}-gorilla`, "Gorilla rows", "conditioning", "8 total reps", "Beat W2 by 1-3 reps or make one small load increase, not both.", "smallest-practical-increase"), ex(`${id}-burpee`, "Burpees", "conditioning", "6 reps", "Beat W2 by 1-3 reps or make one small load increase, not both.", "bodyweight-or-tolerance")] };
  return strengthSession(week, 4, "Upper B — vertical push/pull", main, odd, 50, accessories, arms, { ...finisher, items: baselineFinisher(week, finisher.items) });
}

function swim(week: number): WorkoutSession {
  const id = `${cycleId}-w${week}-s02`;
  const sets: Record<number, string[]> = {
    1: ["300 m easy", "4x50 m smooth build, 20 s rest", "10x100 m @RPE 6, 30 s rest", "4x50 m alternating easy/strong, 20 s", "100 m easy"],
    2: ["300 m easy", "4x50 m drill or relaxed technique, 20 s", "6x200 m @RPE 6, 30 s", "2x50 m strong but smooth, 25 s", "100 m easy"],
    3: ["300 m easy", "4x50 m build, 20 s", "12x100 m; every third @RPE 7, others @RPE 6, 25-30 s", "4x50 m easy/strong, 20 s", "100 m easy"],
    4: ["300 m easy", "4x50 m technique, 20 s", "6x200 m @RPE 6-7, 25-30 s", "6x50 m @RPE 7, 25 s", "100 m easy"],
    5: ["300 m easy", "4x50 m build, 20 s", "3x400 m @RPE 6, 45 s", "6x50 m @RPE 7-8, 30 s", "200 m easy"],
    6: ["300 m easy", "4x50 m relaxed technique, 25 s", "8x100 m @RPE 5-6, 30 s", "4x50 m smooth, 25 s", "100 m easy"],
  };
  const totals = [1800, 1900, 2000, 2100, 2200, 1600];
  const items = sets[week].map((prescription, index) => ex(`${id}-swim-${index + 1}`, "Freestyle pool interval", "interval", prescription, "Progress by steadier splits, lower effort or shorter rest; do not chase distance at the expense of technique.", "none"));
  const blocks = [block(id, 1, "preparation", "Pool preparation", [ex(`${id}-prep`, "Easy freestyle", "warmup", "Use the first easy interval to settle technique", "Keep technique intact; add rest rather than swimming poorly.")]), block(id, 2, "interval", "Main swim", items), block(id, 3, "cooldown", "Cool-down", [], { format: "Easy freestyle cool-down" })];
  // Empty cooldown items are intentionally allowed by the runtime renderer; no phantom distance is recorded.
  return { sessionId: id, cycleId, weekNumber: week, sequence: 2, name: "Swim — freestyle intervals", kind: "swim", targetDurationMinutes: week === 6 ? 40 : 50, blocks, lineage: lineage(week, "swim", 2), notes: [`totalMeters=${totals[week - 1]}`, "25 m pool; record total time and main-set average pace."] };
}

function run(week: number): WorkoutSession {
  const id = `${cycleId}-w${week}-s05`;
  const mainSets = ["6x2 min, 2 min easy jog/walk — RPE 7", "8x1 min, 90 s easy — RPE 7-8", "5x3 min, 2 min easy — RPE 7", "10x1 min, 75 s easy — RPE 8", "4x5 min, 2 min easy — RPE 7-8", "6x1 min, 90 s easy — RPE 7"][week - 1];
  const total = ["38-42", "35-40", "40-45", "38-42", "45-50", "32-38"][week - 1];
  const items = [ex(`${id}-warmup`, "Easy run and strides", "warmup", "10 minutes easy + 3x20-second relaxed strides, at least 40 seconds easy between", "Let RPE govern; no pace mandate.", "none"), ex(`${id}-main`, "Run interval main set", "interval", mainSets, "Advance only if the final rep remains relaxed and no pain alters stride.", "none"), ex(`${id}-cooldown`, "Easy run or walk", "recovery", "5-10 minutes easy", "Keep conversational.", "none")];
  return { sessionId: id, cycleId, weekNumber: week, sequence: 5, name: "Run — controlled intervals", kind: "run", targetDurationMinutes: Number(total.split("-")[0]), blocks: [block(id, 1, "preparation", "Run preparation", [items[0]]), block(id, 2, "interval", "Controlled intervals", [items[1]]), block(id, 3, "cooldown", "Cool-down", [items[2]])], lineage: lineage(week, "run", 5), notes: ["Use a bike, rower or pool with the same work/recovery timing if running discomfort or unusual next-day symptoms appear."] };
}

export function buildCurrentCycle(): CycleDocument {
  const sessions: WorkoutSession[] = [];
  for (let week = 1; week <= 6; week += 1) sessions.push(upperA(week), swim(week), lower(week), upperB(week), run(week));
  return {
    schemaVersion: "1.0", kind: "cycle", cycleId, name: "Hybrid Hypertrophy Base", status: "planned", startDate: "2026-09-07", lengthWeeks: 6, revision: 1, previousCycle: null,
    primaryGoal: "hypertrophy and fat loss", enduranceGoal: "maintain running capacity while rebuilding run consistency and retaining swimming",
    weeks: [1, 2, 3, 4, 5, 6].map((weekNumber) => ({ weekNumber, label: weekNumber === 6 ? "Deload" : `Build ${weekNumber}`, phase: weekNumber === 6 ? "deload" as const : "build" as const })),
    sessions,
    optionalRecovery: { name: "Optional recovery", kind: "recovery", optional: true, choices: ["20-40 minute walk", "20-30 minute easy bike", "1,000-1,500 m continuous easy swim", "15-20 minutes mobility plus easy walk"], notes: ["Conversational effort only; may be skipped without making up work."] },
    substitutions: [
      { planned: "Barbell bench press", substitute: "Flat DB press or machine chest press", when: "Barbell setup or shoulder comfort is poor" },
      { planned: "Strict press", substitute: "Seated DB press or landmine press", when: "Overhead barbell position is uncomfortable" },
      { planned: "Pull-up", substitute: "Assisted pull-up or neutral-grip pulldown", when: "Full bodyweight reps fall below target with 2 RIR" },
      { planned: "Leg press", substitute: "Hip thrust plus an extra leg-extension set", when: "Leg-press depth or position provokes symptoms" },
      { planned: "Split squat", substitute: "Low step-up or omit", when: "Split stance causes hip symptoms" },
      { planned: "DB RDL/trap-bar deadlift", substitute: "Hip thrust", when: "Hinging causes hip symptoms" },
      { planned: "Leg curl/extension pairing", substitute: "Straight sets", when: "Machines are distant or busy" },
      { planned: "Cable pairing", substitute: "Bands or equivalent DB movement", when: "A cable station cannot be used continuously" },
    ],
    progressionRules: [
      "Follow sessions in order and do not cram missed sessions together.",
      "Main lifts use four-set double progression through Weeks 1-5; add reps before load.",
      "Odd variants are Weeks 1, 3 and 5; Week 3 compares with Week 1 and Week 5 with Week 3.",
      "Even variants are Weeks 2 and 4; Week 4 compares with Week 2.",
      "Week 6 is an even-selection deload at reduced volume/load with no hard finisher.",
      "Blank or unrecorded results are distinct from a recorded zero; never infer a barbell bench result.",
    ],
    privacy: { containsPrivateAthleteData: true, doNotBundleInPublicAssets: true },
  };
}
