import type { ResultsDocument, WorkoutResult } from "./types.js";

export interface MergeResult {
  results: ResultsDocument;
  added: number;
  replaced: number;
  ignored: number;
  conflicts: string[];
}

/** Merge by workoutId. Same revision and identical JSON is idempotent; differing payloads conflict. */
export function mergeResults(existing: ResultsDocument, incoming: ResultsDocument): MergeResult {
  const byId = new Map(existing.results.map((result) => [result.workoutId, result]));
  let added = 0; let replaced = 0; let ignored = 0;
  const conflicts: string[] = [];
  for (const candidate of incoming.results) {
    const prior = byId.get(candidate.workoutId);
    if (!prior) { byId.set(candidate.workoutId, candidate); added += 1; continue; }
    const same = JSON.stringify(prior) === JSON.stringify(candidate);
    if (same) { ignored += 1; continue; }
    if (candidate.revision > prior.revision) { byId.set(candidate.workoutId, candidate); replaced += 1; continue; }
    if (candidate.revision < prior.revision) { ignored += 1; continue; }
    conflicts.push(candidate.workoutId);
  }
  return { results: { schemaVersion: "1.0", kind: "results", results: [...byId.values()].sort((a, b) => a.workoutId.localeCompare(b.workoutId)) }, added, replaced, ignored, conflicts };
}

export function summarizeResults(results: ResultsDocument): string {
  const complete = results.results.filter((result) => result.status === "complete").length;
  const inProgress = results.results.filter((result) => result.status === "in-progress").length;
  const skipped = results.results.filter((result) => result.status === "skipped").length;
  const lines = [`Completed: ${complete}`, `In progress: ${inProgress}`, `Skipped: ${skipped}`];
  const loads = new Map<string, number>();
  for (const workout of results.results) for (const exercise of workout.exercises) for (const set of exercise.sets) if (set.loadKg !== undefined) loads.set(exercise.name, Math.max(loads.get(exercise.name) ?? 0, set.loadKg));
  if (loads.size) { lines.push("Best recorded loads:"); for (const [name, load] of [...loads.entries()].sort()) lines.push(`- ${name}: ${load} kg`); }
  return `${lines.join("\n")}\n`;
}

export function blankSetIsUnrecorded(set: { loadKg?: number; reps?: number }): boolean {
  return set.loadKg === undefined && set.reps === undefined;
}

export function resultForWorkout(workoutId: string, sessionId: string, cycleId: string, overrides: Partial<WorkoutResult> = {}): WorkoutResult {
  return { workoutId, sessionId, cycleId, revision: 1, status: "in-progress", exercises: [], ...overrides };
}
