export type CycleStatus = "planned" | "active" | "complete" | "archived";
export type SessionKind = "strength" | "swim" | "run" | "recovery";
export type BlockKind = "preparation" | "main" | "accessory" | "arm" | "finisher" | "interval" | "cooldown" | "optional";
export type ExerciseRole = "warmup" | "main" | "accessory" | "arm" | "conditioning" | "interval" | "recovery";
export type LoadBasis = "none" | "establish-by-rir" | "absolute" | "range" | "percentage-of-reference" | "repeat-prior-earned" | "smallest-practical-increase" | "bodyweight-or-tolerance";

export interface PlannedLoad {
  kind: "none" | "exact" | "range" | "relative";
  kg?: number;
  minKg?: number;
  maxKg?: number;
  percentOfReference?: number;
  reference?: string;
}

export interface ExercisePrescription {
  exerciseId: string;
  name: string;
  role: ExerciseRole;
  prescription: string;
  sets?: number;
  reps?: number | string;
  repsPerSide?: boolean;
  targetRir?: number;
  restSeconds?: number;
  plannedLoad?: PlannedLoad;
  progression: string;
  loadBasis: LoadBasis;
  comparisonExerciseId?: string;
}

export interface WorkoutBlock {
  blockId: string;
  kind: BlockKind;
  label: string;
  order: number;
  items: ExercisePrescription[];
  format?: string;
  durationMinutes?: number;
  rounds?: number;
  restAfterRoundSeconds?: number;
}

export interface SessionLineage {
  variant: "odd" | "even" | "deload" | "endurance" | "recovery";
  comparison: "baseline" | "progresses" | "deloads" | "repeats-with-target" | "exception";
  comparisonSessionId?: string;
  comparisonWeek?: number;
  reason?: string;
}

export interface WorkoutSession {
  sessionId: string;
  cycleId: string;
  weekNumber: number;
  sequence: number;
  name: string;
  kind: SessionKind;
  targetDurationMinutes?: number;
  blocks: WorkoutBlock[];
  mainLift?: ExercisePrescription;
  lineage: SessionLineage;
  notes?: string[];
}

export interface CycleWeek {
  weekNumber: number;
  label: string;
  phase: "build" | "deload" | "test" | "recovery";
}

export interface OptionalRecovery {
  name: string;
  kind: "recovery";
  optional: true;
  choices: string[];
  notes?: string[];
}

export interface Substitution {
  planned: string;
  substitute: string;
  when: string;
}

export interface CycleDocument {
  schemaVersion: "1.0";
  kind: "cycle";
  cycleId: string;
  name: string;
  status?: CycleStatus;
  startDate: string;
  lengthWeeks: number;
  /** Monotonic prescription revision. A result records the revision it started from. */
  revision?: number;
  previousCycle?: string | null;
  primaryGoal?: string;
  enduranceGoal?: string;
  weeks: CycleWeek[];
  sessions: WorkoutSession[];
  optionalRecovery?: OptionalRecovery;
  substitutions: Substitution[];
  progressionRules?: string[];
  privacy?: {
    containsPrivateAthleteData?: boolean;
    doNotBundleInPublicAssets?: boolean;
  };
}

export interface LoggedSet {
  setNumber: number;
  /** Canonical metric load. `load` is retained for browser draft compatibility. */
  loadKg?: number;
  load?: number;
  loadBasis?: "barbell" | "per-side" | "total" | "bodyweight";
  unit?: "kg" | "lb" | "bodyweight" | "meters" | "seconds" | "reps";
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  rir?: number;
  rpe?: number;
  completed?: boolean;
  technique?: "clean" | "acceptable" | "degraded" | "pain-limited";
  note?: string;
}

export interface ExerciseResult {
  exerciseId: string;
  name: string;
  sets: LoggedSet[];
  note?: string;
}

export interface WorkoutResult {
  workoutId: string;
  cycleId: string;
  sessionId: string;
  revision: number;
  /** Revision of the prescription cycle used for this workout. */
  cycleRevision?: number;
  startedAt?: string;
  completedAt?: string;
  status: "in-progress" | "complete" | "skipped";
  exercises: ExerciseResult[];
  /** Immutable session prescription captured when the workout was started. */
  prescriptionSnapshot?: WorkoutSession;
  /** Browser draft representation retained for safe round-tripping. */
  actuals?: Record<string, LoggedSet[]>;
  notes?: string[];
}

export interface ResultsDocument {
  schemaVersion: "1.0";
  kind: "results";
  results: WorkoutResult[];
}

export interface CycleBundle {
  schemaVersion: "1.0";
  kind: "cycle-bundle";
  exportedAt: string;
  bundleRevision?: number;
  cycle: CycleDocument;
  results: ResultsDocument;
}
