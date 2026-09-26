import type { CycleBundle, CycleDocument, ResultsDocument } from "./types.js";

export interface PortableValidationIssue { path: string; message: string }
export interface PortableValidationReport { valid: boolean; issues: PortableValidationIssue[] }

const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const unknownKeys = (value: Record<string, any>, allowed: string[], path: string, issues: PortableValidationIssue[]) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push({ path: `${path}/${key}`, message: "unknown property" });
};
const numberInRange = (value: unknown, min = 0, max = Number.POSITIVE_INFINITY) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function validateLoggedSetPortable(value: unknown, path: string, issues: PortableValidationIssue[]): void {
  if (!isObject(value)) { issues.push({ path, message: "set must be an object" }); return; }
  unknownKeys(value, ["setNumber", "loadKg", "load", "loadBasis", "unit", "reps", "durationSeconds", "distanceMeters", "rir", "rpe", "completed", "technique", "note"], path, issues);
  if (!Number.isInteger(value.setNumber) || value.setNumber < 1) issues.push({ path: `${path}/setNumber`, message: "setNumber must be a positive integer" });
  for (const key of ["loadKg", "load", "reps", "durationSeconds", "distanceMeters"] as const) if (value[key] !== undefined && !numberInRange(value[key])) issues.push({ path: `${path}/${key}`, message: "must be a finite non-negative number" });
  if (value.loadBasis !== undefined && !["barbell", "per-side", "total", "bodyweight"].includes(value.loadBasis)) issues.push({ path: `${path}/loadBasis`, message: "invalid load basis" });
  if (value.unit !== undefined && !["kg", "lb", "bodyweight", "meters", "seconds", "reps"].includes(value.unit)) issues.push({ path: `${path}/unit`, message: "invalid unit" });
  for (const key of ["rir", "rpe"] as const) if (value[key] !== undefined && !numberInRange(value[key], 0, 10)) issues.push({ path: `${path}/${key}`, message: "must be between 0 and 10" });
  if (value.completed !== undefined && typeof value.completed !== "boolean") issues.push({ path: `${path}/completed`, message: "must be boolean" });
  if (value.technique !== undefined && !["clean", "acceptable", "degraded", "pain-limited"].includes(value.technique)) issues.push({ path: `${path}/technique`, message: "invalid technique" });
  if (value.note !== undefined && typeof value.note !== "string") issues.push({ path: `${path}/note`, message: "must be a string" });
  if (value.loadKg !== undefined && value.load !== undefined && value.loadKg !== value.load) issues.push({ path, message: "loadKg and compatibility load must agree" });
}

function validateSessionShape(value: unknown, path: string, issues: PortableValidationIssue[]): void {
  if (!isObject(value)) { issues.push({ path, message: "prescription snapshot must be an object" }); return; }
  unknownKeys(value, ["sessionId", "cycleId", "weekNumber", "sequence", "name", "kind", "targetDurationMinutes", "blocks", "mainLift", "lineage", "notes"], path, issues);
  if (typeof value.sessionId !== "string" || typeof value.cycleId !== "string" || typeof value.name !== "string") issues.push({ path, message: "snapshot identity is invalid" });
  if (!Array.isArray(value.blocks)) { issues.push({ path: `${path}/blocks`, message: "snapshot blocks must be an array" }); return; }
  for (const [index, block] of value.blocks.entries()) {
    const blockPath = `${path}/blocks/${index}`;
    if (!isObject(block)) { issues.push({ path: blockPath, message: "block must be an object" }); continue; }
    unknownKeys(block, ["blockId", "kind", "label", "order", "items", "format", "durationMinutes", "rounds", "restAfterRoundSeconds"], blockPath, issues);
    if (!Array.isArray(block.items)) { issues.push({ path: `${blockPath}/items`, message: "block items must be an array" }); continue; }
    for (const [itemIndex, item] of block.items.entries()) {
      const itemPath = `${blockPath}/items/${itemIndex}`;
      if (!isObject(item)) { issues.push({ path: itemPath, message: "exercise must be an object" }); continue; }
      unknownKeys(item, ["exerciseId", "name", "role", "prescription", "sets", "reps", "repsPerSide", "targetRir", "restSeconds", "plannedLoad", "progression", "loadBasis", "comparisonExerciseId"], itemPath, issues);
      if (typeof item.exerciseId !== "string" || typeof item.name !== "string" || typeof item.prescription !== "string") issues.push({ path: itemPath, message: "exercise identity is invalid" });
    }
  }
}

/** Browser-safe validation for imports. The Node CLI adds AJV/schema validation; this
 * adapter intentionally mirrors the contract's required fields and domain invariants. */
export function validateCyclePortable(value: unknown): PortableValidationReport {
  const issues: PortableValidationIssue[] = [];
  if (!isObject(value) || value.schemaVersion !== "1.0" || value.kind !== "cycle") {
    return { valid: false, issues: [{ path: "/", message: "expected a version 1.0 cycle document" }] };
  }
  unknownKeys(value, ["schemaVersion", "kind", "cycleId", "name", "status", "startDate", "lengthWeeks", "revision", "previousCycle", "primaryGoal", "enduranceGoal", "weeks", "sessions", "optionalRecovery", "substitutions", "progressionRules", "privacy"], "/", issues);
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
      else {
        unknownKeys(block, ["blockId", "kind", "label", "order", "items", "format", "durationMinutes", "rounds", "restAfterRoundSeconds"], `/sessions/${session.sessionId}/blocks`, issues);
        for (const item of block.items) if (!isObject(item) || typeof item.exerciseId !== "string" || typeof item.name !== "string" || typeof item.prescription !== "string") issues.push({ path: `/sessions/${session.sessionId}/blocks/${block.blockId}`, message: "exercise is invalid" });
      }
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
  unknownKeys(value, ["schemaVersion", "kind", "results"], "/", issues);
  const ids = new Set<string>();
  for (const [index, result] of value.results.entries()) {
    const path = `/results/${index}`;
    if (!isObject(result)) { issues.push({ path, message: "result must be an object" }); continue; }
    unknownKeys(result, ["workoutId", "cycleId", "sessionId", "revision", "cycleRevision", "startedAt", "completedAt", "status", "exercises", "prescriptionSnapshot", "actuals", "setLayoutVersion", "notes"], path, issues);
    if (typeof result.workoutId !== "string" || typeof result.cycleId !== "string" || typeof result.sessionId !== "string") issues.push({ path, message: "result identity is invalid" });
    else if (ids.has(result.workoutId)) issues.push({ path: `${path}/workoutId`, message: "duplicate workoutId" });
    else ids.add(result.workoutId);
    if (!Number.isInteger(result.revision) || result.revision < 1) issues.push({ path: `${path}/revision`, message: "revision must be positive" });
    if (result.cycleRevision !== undefined && (!Number.isInteger(result.cycleRevision) || result.cycleRevision < 1)) issues.push({ path: `${path}/cycleRevision`, message: "cycleRevision must be positive" });
    if (!Array.isArray(result.exercises)) issues.push({ path: `${path}/exercises`, message: "exercises must be an array" });
    for (const [exerciseIndex, exercise] of (result.exercises ?? []).entries()) {
      const exercisePath = `${path}/exercises/${exerciseIndex}`;
      if (!isObject(exercise)) { issues.push({ path: exercisePath, message: "exercise result must be an object" }); continue; }
      unknownKeys(exercise, ["exerciseId", "name", "sets", "note"], exercisePath, issues);
      if (typeof exercise.exerciseId !== "string" || typeof exercise.name !== "string" || !Array.isArray(exercise.sets)) issues.push({ path: exercisePath, message: "exercise result is invalid" });
      for (const [setIndex, set] of (exercise.sets ?? []).entries()) validateLoggedSetPortable(set, `${exercisePath}/sets/${setIndex}`, issues);
    }
    if (result.setLayoutVersion !== undefined && result.setLayoutVersion !== 1) issues.push({ path: `${path}/setLayoutVersion`, message: "unsupported set layout" });
    if (result.actuals !== undefined) {
      if (!isObject(result.actuals)) issues.push({ path: `${path}/actuals`, message: "actuals must be an object" });
      else for (const [exerciseId, sets] of Object.entries(result.actuals)) {
        if (!Array.isArray(sets)) issues.push({ path: `${path}/actuals/${exerciseId}`, message: "actuals entry must be an array" });
        else for (const [setIndex, set] of sets.entries()) validateLoggedSetPortable(set, `${path}/actuals/${exerciseId}/${setIndex}`, issues);
      }
    }
    if (result.prescriptionSnapshot) validateSessionShape(result.prescriptionSnapshot, `${path}/prescriptionSnapshot`, issues);
  }
  return { valid: issues.length === 0, issues };
}

export function validateBundlePortable(value: unknown): PortableValidationReport {
  if (!isObject(value) || value.schemaVersion !== "1.0" || value.kind !== "cycle-bundle") return { valid: false, issues: [{ path: "/", message: "expected a version 1.0 cycle bundle" }] };
  const rootIssues: PortableValidationIssue[] = [];
  unknownKeys(value, ["schemaVersion", "kind", "exportedAt", "bundleRevision", "cycle", "results"], "/", rootIssues);
  if (value.bundleRevision !== undefined && (!Number.isInteger(value.bundleRevision) || value.bundleRevision < 1)) rootIssues.push({ path: "/bundleRevision", message: "bundleRevision must be positive" });
  const cycle = validateCyclePortable(value.cycle);
  const results = validateResultsPortable(value.results);
  const relationshipIssues: PortableValidationIssue[] = [];
  if (isObject(value.cycle) && isObject(value.results) && Array.isArray(value.results.results)) {
    const sessions = new Map<string, Record<string, any>>();
    for (const session of (value.cycle.sessions as unknown[] ?? [])) if (isObject(session) && typeof session.sessionId === "string") sessions.set(session.sessionId, session);
    for (const [index, result] of value.results.results.entries()) {
      if (!isObject(result)) continue;
      if (result.cycleId !== value.cycle.cycleId) relationshipIssues.push({ path: `/results/${index}/cycleId`, message: "result cycleId must match bundled cycle" });
      if (isObject(result.prescriptionSnapshot)) {
        if (result.prescriptionSnapshot.sessionId !== result.sessionId) relationshipIssues.push({ path: `/results/${index}/prescriptionSnapshot/sessionId`, message: "snapshot sessionId must match result" });
        if (result.prescriptionSnapshot.cycleId !== result.cycleId) relationshipIssues.push({ path: `/results/${index}/prescriptionSnapshot/cycleId`, message: "snapshot cycleId must match result" });
        const expected = sessions.get(result.sessionId);
        if (expected && result.prescriptionSnapshot.name !== expected.name) relationshipIssues.push({ path: `/results/${index}/prescriptionSnapshot/name`, message: "snapshot identity does not match bundled session" });
      }
    }
  }
  return { valid: rootIssues.length === 0 && cycle.valid && results.valid && relationshipIssues.length === 0, issues: [...rootIssues, ...cycle.issues.map((x) => ({ ...x, path: `/cycle${x.path}` })), ...results.issues.map((x) => ({ ...x, path: `/results${x.path}` })), ...relationshipIssues] };
}

export function isCycleBundle(value: unknown): value is CycleBundle { return isObject(value) && value.kind === "cycle-bundle"; }
export function isCycleDocument(value: unknown): value is CycleDocument { return isObject(value) && value.kind === "cycle"; }
export function isResultsDocument(value: unknown): value is ResultsDocument { return isObject(value) && value.kind === "results"; }
