import type { CycleDocument, ResultsDocument, WorkoutSession } from "../domain/types.js";

export type ActualUnit = "kg" | "lb" | "bodyweight" | "meters" | "seconds" | "reps";

export interface SetActual {
  setNumber: number;
  load?: number;
  loadBasis?: "barbell" | "per-side" | "total" | "bodyweight";
  unit?: ActualUnit;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  rir?: number;
  rpe?: number;
  completed?: boolean;
  technique?: "clean" | "acceptable" | "degraded" | "pain-limited";
  note?: string;
}

export interface SessionDraft {
  workoutId: string;
  cycleId: string;
  sessionId: string;
  prescriptionSnapshot: WorkoutSession;
  startedAt: string;
  status: "in-progress" | "complete" | "skipped" | "abandoned";
  actuals: Record<string, SetActual[]>;
  focusedBlockId?: string;
  focusedExerciseId?: string;
  focusedSetNumber?: number;
  collapsedBlocks: string[];
  notes: string[];
  timer?: import("../timers/timers.js").TimerState;
}

export interface RunnerState {
  cycle?: CycleDocument;
  results: ResultsDocument;
  draft?: SessionDraft;
  lastBackupAt?: string;
  sessionsSinceBackup: number;
}

export const emptyRunnerState = (): RunnerState => ({ results: { schemaVersion: "1.0", kind: "results", results: [] }, sessionsSinceBackup: 0 });
