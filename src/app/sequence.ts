import type { CycleDocument, WorkoutResult, WorkoutSession } from "../domain/types.js";

export type SessionStatus = "upcoming" | "in-progress" | "completed" | "skipped" | "abandoned";

export function coreSessions(cycle: CycleDocument): WorkoutSession[] {
  return [...cycle.sessions].sort((a, b) => a.weekNumber - b.weekNumber || a.sequence - b.sequence);
}

export function completedCoreIds(results: { results: WorkoutResult[] }): Set<string> {
  return new Set(results.results.filter((result) => result.status === "complete" || result.status === "skipped").map((result) => result.sessionId));
}

/** Return the core sessions in one week, in their prescribed order. */
export function sessionsForWeek(cycle: CycleDocument, weekNumber: number): WorkoutSession[] {
  return coreSessions(cycle).filter((session) => session.weekNumber === weekNumber);
}

/** UI-facing status for a session. The active draft is authoritative for an in-progress session. */
export function sessionStatus(session: WorkoutSession, results: { results: WorkoutResult[] }, activeSessionId?: string): SessionStatus {
  if (activeSessionId === session.sessionId) return "in-progress";
  const result = results.results
    .filter((candidate) => candidate.sessionId === session.sessionId)
    .sort((a, b) => b.revision - a.revision)[0];
  if (!result) return "upcoming";
  if (result.status === "complete") return "completed";
  if (result.status === "skipped") return "skipped";
  return "in-progress";
}

export function sessionIsIncomplete(status: SessionStatus): boolean {
  return status === "upcoming" || status === "in-progress";
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
  // Older imported cycles may not have lineage metadata. They remain usable;
  // simply fall back to the most recent completed result for that exercise.
  const lineage = session.lineage?.comparisonSessionId;
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
