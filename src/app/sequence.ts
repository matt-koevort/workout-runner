import type { CycleDocument, WorkoutResult, WorkoutSession } from "../domain/types.js";

export function coreSessions(cycle: CycleDocument): WorkoutSession[] {
  return [...cycle.sessions].sort((a, b) => a.weekNumber - b.weekNumber || a.sequence - b.sequence);
}

export function completedCoreIds(results: { results: WorkoutResult[] }): Set<string> {
  return new Set(results.results.filter((result) => result.status === "complete" || result.status === "skipped").map((result) => result.sessionId));
}

/** Explicit completion controls progression. In-progress results do not advance the sequence. */
export function nextCoreSession(cycle: CycleDocument, results: { results: WorkoutResult[] }, activeSessionId?: string): WorkoutSession | undefined {
  const sessions = coreSessions(cycle);
  const completed = completedCoreIds(results);
  if (activeSessionId) {
    const active = sessions.find((session) => session.sessionId === activeSessionId);
    if (active && !completed.has(active.sessionId)) return active;
  }
  return sessions.find((session) => !completed.has(session.sessionId));
}

export function sessionProgress(cycle: CycleDocument, results: { results: WorkoutResult[] }): { done: number; total: number; week: number } {
  const sessions = coreSessions(cycle); const completed = completedCoreIds(results); const next = sessions.find((session) => !completed.has(session.sessionId));
  return { done: sessions.filter((session) => completed.has(session.sessionId)).length, total: sessions.length, week: next?.weekNumber ?? cycle.lengthWeeks };
}

export function previousResult(results: { results: WorkoutResult[] }, session: WorkoutSession, exerciseId: string): WorkoutResult | undefined {
  const lineage = session.lineage.comparisonSessionId;
  const candidates = results.results.filter((result) => result.cycleId === session.cycleId && (lineage ? result.sessionId === lineage : result.sessionId !== session.sessionId) && result.status === "complete");
  return candidates.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).find((result) => result.exercises.some((exercise) => exercise.exerciseId === exerciseId));
}

export function previousExerciseResult(results: { results: WorkoutResult[] }, session: WorkoutSession, exerciseId: string) {
  return previousResult(results, session, exerciseId)?.exercises.find((exercise) => exercise.exerciseId === exerciseId);
}

export function coreSessionsSinceBackup(cycle: CycleDocument, results: { results: WorkoutResult[] }, lastBackupAt?: string): number {
  const ids = new Set(coreSessions(cycle).map((session) => session.sessionId));
  return results.results.filter((result) => ids.has(result.sessionId) && result.status === "complete" && (!lastBackupAt || (result.completedAt ?? "") > lastBackupAt)).length;
}
