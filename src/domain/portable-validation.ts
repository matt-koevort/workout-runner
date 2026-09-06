import type { CycleBundle, CycleDocument, ResultsDocument } from "./types.js";

export interface PortableValidationIssue { path: string; message: string }
export interface PortableValidationReport { valid: boolean; issues: PortableValidationIssue[] }

const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Browser-safe validation for imports. The Node CLI adds AJV/schema validation; this
 * adapter intentionally mirrors the contract's required fields and domain invariants. */
export function validateCyclePortable(value: unknown): PortableValidationReport {
  const issues: PortableValidationIssue[] = [];
  if (!isObject(value) || value.schemaVersion !== "1.0" || value.kind !== "cycle") {
    return { valid: false, issues: [{ path: "/", message: "expected a version 1.0 cycle document" }] };
  }
  if (typeof value.cycleId !== "string" || typeof value.name !== "string" || typeof value.startDate !== "string") issues.push({ path: "/", message: "cycleId, name and startDate are required" });
  if (!Number.isInteger(value.lengthWeeks) || value.lengthWeeks < 1) issues.push({ path: "/lengthWeeks", message: "lengthWeeks must be a positive integer" });
  if (!Array.isArray(value.weeks) || value.weeks.length !== value.lengthWeeks) issues.push({ path: "/weeks", message: "weeks must match lengthWeeks" });
  if (!Array.isArray(value.sessions)) issues.push({ path: "/sessions", message: "sessions must be an array" });
  const sessions = Array.isArray(value.sessions) ? value.sessions : [];
  const ids = new Set<string>();
  for (const session of sessions) {
    if (!isObject(session)) { issues.push({ path: "/sessions", message: "session must be an object" }); continue; }
    if (typeof session.sessionId !== "string" || typeof session.cycleId !== "string" || session.cycleId !== value.cycleId) issues.push({ path: `/sessions/${session.sessionId ?? "?"}`, message: "session identity is invalid" });
    if (ids.has(session.sessionId)) issues.push({ path: `/sessions/${session.sessionId}`, message: "duplicate sessionId" });
    ids.add(session.sessionId);
    if (!Array.isArray(session.blocks) || !session.blocks.length) issues.push({ path: `/sessions/${session.sessionId}/blocks`, message: "session requires blocks" });
    if (!session.lineage || typeof session.lineage.variant !== "string") issues.push({ path: `/sessions/${session.sessionId}/lineage`, message: "lineage is required" });
    for (const block of session.blocks ?? []) {
      if (!isObject(block) || typeof block.blockId !== "string" || !Array.isArray(block.items)) issues.push({ path: `/sessions/${session.sessionId}/blocks`, message: "block is invalid" });
      for (const item of block.items ?? []) if (!isObject(item) || typeof item.exerciseId !== "string" || typeof item.name !== "string" || typeof item.prescription !== "string") issues.push({ path: `/sessions/${session.sessionId}/blocks/${block.blockId}`, message: "exercise is invalid" });
    }
  }
  const expected = (Number(value.lengthWeeks) || 0) * 5;
  if (sessions.length !== expected) issues.push({ path: "/sessions", message: `expected ${expected} core sessions, got ${sessions.length}` });
  for (let week = 1; week <= (Number(value.lengthWeeks) || 0); week += 1) {
    const weekSessions = sessions.filter((s) => s.weekNumber === week);
    if (weekSessions.length !== 5) issues.push({ path: `/sessions/week-${week}`, message: "each week must contain five core sessions" });
    const sequences = weekSessions.map((s) => s.sequence).sort((a, b) => a - b);
    if (sequences.some((s, i) => s !== i + 1)) issues.push({ path: `/sessions/week-${week}`, message: "session sequence must be 1..5" });
  }
  return { valid: issues.length === 0, issues };
}

export function validateResultsPortable(value: unknown): PortableValidationReport {
  const issues: PortableValidationIssue[] = [];
  if (!isObject(value) || value.schemaVersion !== "1.0" || value.kind !== "results" || !Array.isArray(value.results)) return { valid: false, issues: [{ path: "/", message: "expected a version 1.0 results document" }] };
  const ids = new Set<string>();
  for (const result of value.results) {
    if (!isObject(result) || typeof result.workoutId !== "string" || typeof result.sessionId !== "string") issues.push({ path: "/results", message: "result identity is invalid" });
    else if (ids.has(result.workoutId)) issues.push({ path: `/results/${result.workoutId}`, message: "duplicate workoutId" });
    else ids.add(result.workoutId);
    if (!Number.isInteger(result.revision) || result.revision < 1) issues.push({ path: `/results/${result?.workoutId ?? "?"}`, message: "revision must be positive" });
  }
  return { valid: issues.length === 0, issues };
}

export function validateBundlePortable(value: unknown): PortableValidationReport {
  if (!isObject(value) || value.schemaVersion !== "1.0" || value.kind !== "cycle-bundle") return { valid: false, issues: [{ path: "/", message: "expected a version 1.0 cycle bundle" }] };
  const cycle = validateCyclePortable(value.cycle);
  const results = validateResultsPortable(value.results);
  return { valid: cycle.valid && results.valid, issues: [...cycle.issues.map((x) => ({ ...x, path: `/cycle${x.path}` })), ...results.issues.map((x) => ({ ...x, path: `/results${x.path}` }))] };
}

export function isCycleBundle(value: unknown): value is CycleBundle { return isObject(value) && value.kind === "cycle-bundle"; }
export function isCycleDocument(value: unknown): value is CycleDocument { return isObject(value) && value.kind === "cycle"; }
export function isResultsDocument(value: unknown): value is ResultsDocument { return isObject(value) && value.kind === "results"; }
