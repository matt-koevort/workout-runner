import type { ExercisePrescription } from "../domain/types.js";
import type { CycleDocument, WorkoutResult, WorkoutSession, LoggedSet } from "../domain/types.js";

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
export function nextCoreSession(cycle: CycleDocument, results: { results: WorkoutResult[] }, activeSessionId?: string, activeWeek?: number): WorkoutSession | undefined {
  const sessions = coreSessions(cycle);
  const completed = completedCoreIds(results);
  if (activeSessionId) {
    const active = sessions.find((session) => session.sessionId === activeSessionId);
    if (active && !completed.has(active.sessionId)) return active;
  }
  const week = activeWeekFor(cycle, results, activeSessionId, activeWeek);
  return sessions.find((session) => session.weekNumber >= week && !completed.has(session.sessionId)) ?? sessions.find((session) => !completed.has(session.sessionId));
}

const timestamp = (value?: string): number => value ? Date.parse(value) : NaN;

export function activeWeekFor(cycle: CycleDocument, results: { results: WorkoutResult[] }, activeSessionId?: string, selected?: number): number {
  const draft = cycle.sessions.find(s => s.sessionId === activeSessionId);
  if (draft) return draft.weekNumber;
  if (selected && selected >= 1 && selected <= cycle.lengthWeeks) return selected;
  const latest = [...results.results].filter(r => r.cycleId === cycle.cycleId).sort((a,b) => (timestamp(b.completedAt ?? b.startedAt) || 0) - (timestamp(a.completedAt ?? a.startedAt) || 0))[0];
  return cycle.sessions.find(s => s.sessionId === latest?.sessionId)?.weekNumber ?? 1;
}

export function sessionProgress(cycle: CycleDocument, results: { results: WorkoutResult[] }, activeSessionId?: string, selected?: number): { done: number; total: number; week: number } {
  const sessions = coreSessions(cycle); const completed = completedCoreIds(results);
  return { done: sessions.filter(s => completed.has(s.sessionId)).length, total: sessions.length, week: activeWeekFor(cycle, results, activeSessionId, selected) };
}

function isEarlier(result: WorkoutResult, session: WorkoutSession, cycle?: CycleDocument): boolean {
  const prior = result.prescriptionSnapshot ?? cycle?.sessions.find(s => s.sessionId === result.sessionId);
  return !prior || prior.weekNumber < session.weekNumber || prior.weekNumber === session.weekNumber && prior.sequence < session.sequence;
}
const normalizedName = (name: string): string => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function previousExerciseResult(results: { results: WorkoutResult[] }, session: WorkoutSession, exerciseId: string, before = new Date().toISOString(), cycle?: CycleDocument) {
  const item = session.blocks.flatMap(b => b.items).find(i => i.exerciseId === exerciseId);
  if (!item) return undefined;
  const candidates = results.results.filter(r => r.status === "complete" && r.sessionId !== session.sessionId && Number.isFinite(timestamp(r.completedAt)) && timestamp(r.completedAt) < timestamp(before) && (r.cycleId !== session.cycleId || isEarlier(r, session, cycle)));
  const identities = new Set<string>([exerciseId, ...(item.comparisonExerciseId ? [item.comparisonExerciseId] : [])]);
  const prescriptions = [...(cycle?.sessions ?? []), ...results.results.flatMap(r => r.prescriptionSnapshot ? [r.prescriptionSnapshot] : [])].flatMap(s => s.blocks.flatMap(b => b.items));
  let changed = true;
  while (changed) {
    changed = false;
    for (const prescription of prescriptions) if (prescription.comparisonExerciseId && (identities.has(prescription.exerciseId) || identities.has(prescription.comparisonExerciseId))) {
      for (const id of [prescription.exerciseId, prescription.comparisonExerciseId]) if (!identities.has(id)) { identities.add(id); changed = true; }
    }
  }
  for (const result of candidates.sort((a,b) => timestamp(b.completedAt) - timestamp(a.completedAt))) {
    const matched = result.exercises.find(e => identities.has(e.exerciseId)) ?? result.exercises.find(e => {
      const prior = result.prescriptionSnapshot?.blocks.flatMap(b => b.items).find(i => i.exerciseId === e.exerciseId);
      return prior?.comparisonExerciseId === exerciseId || !!item.comparisonExerciseId && prior?.comparisonExerciseId === item.comparisonExerciseId;
    }) ?? result.exercises.find(e => normalizedName(e.name) === normalizedName(item.name));
    if (matched && (matched.note || matched.sets.some(setHasActual))) return matched;
  }
  return undefined;
}
export function setHasActual(set: LoggedSet): boolean { return Object.entries(set).some(([key,value]) => key !== "setNumber" && value !== undefined && value !== "" && value !== false); }
export function formatActual(set: LoggedSet): string {
  return [`Set ${set.setNumber}`, set.load !== undefined ? `${set.load} ${set.unit ?? "kg"}` : set.loadKg !== undefined ? `${set.loadKg} kg` : "", set.loadBasis, set.reps !== undefined ? `${set.reps} reps` : "", set.rir !== undefined ? `${set.rir} RIR` : "", set.rpe !== undefined ? `${set.rpe} RPE` : "", set.durationSeconds !== undefined ? `${set.durationSeconds}s` : "", set.distanceMeters !== undefined ? `${set.distanceMeters}m` : "", set.note, set.technique, set.completed ? "Completed" : ""].filter(v => v !== undefined && v !== "").join(" · ");
}
/** Missing arrays are legacy layouts; explicit arrays, including [], are performed layouts. */
export function performedRows(item: ExercisePrescription, rows?: LoggedSet[]): LoggedSet[] {
  return rows ?? Array.from({length: item.sets ?? 1}, (_, i) => ({setNumber: i + 1}));
}

export function coreSessionsSinceBackup(cycle: CycleDocument, results: { results: WorkoutResult[] }, lastBackupAt?: string): number {
  const ids = new Set(coreSessions(cycle).map((session) => session.sessionId));
  return results.results.filter((result) => ids.has(result.sessionId) && result.status === "complete" && (!lastBackupAt || (result.completedAt ?? "") > lastBackupAt)).length;
}

export function restorePerformedRows(item: ExercisePrescription, rows?: LoggedSet[], version?: number): LoggedSet[] {
  if (version === 1) return performedRows(item, rows);
  const count = Math.max(item.sets ?? 1, ...((rows ?? []).map(s => s.setNumber)));
  return Array.from({length: count}, (_, i) => rows?.find(s => s.setNumber === i + 1) ?? {setNumber: i + 1});
}

/** Remove exactly the selected performed row; retain every surviving actual field. */
export function removePerformedRow(rows: LoggedSet[], setNumber: number): LoggedSet[] {
  if (!rows.some(row => row.setNumber === setNumber)) return rows;
  return rows.filter(row => row.setNumber !== setNumber).map((row, index) => ({...row, setNumber: index + 1}));
}
