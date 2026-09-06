import * as Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CycleBundle, CycleDocument, ResultsDocument, WorkoutResult, WorkoutSession } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaRootCandidates = [join(here, "../../../schemas"), join(process.cwd(), "schemas")];
const schemaRoot = schemaRootCandidates.find((candidate) => {
  try { readFileSync(join(candidate, "cycle.schema.json")); return true; } catch { return false; }
});
if (!schemaRoot) throw new Error("Cannot locate schemas/");
const readSchema = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(schemaRoot, name), "utf8")) as Record<string, unknown>;

const Ajv2020 = (Ajv2020Module as unknown as { default: new (options?: Record<string, unknown>) => { addFormat: (name: string, format: unknown) => void; addSchema: (schema: unknown) => void; compile: (schema: unknown) => ValidateFunction } }).default;
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("date", { type: "string", validate: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) });
const cycleSchema = readSchema("cycle.schema.json");
const resultsSchema = readSchema("results.schema.json");
const bundleSchema = readSchema("bundle.schema.json");
ajv.addSchema(cycleSchema);
ajv.addSchema(resultsSchema);
ajv.addSchema(bundleSchema);
const validateCycleSchema: ValidateFunction = ajv.compile(cycleSchema);
const validateResultsSchema: ValidateFunction = ajv.compile(resultsSchema);
const validateBundleSchema: ValidateFunction = ajv.compile(bundleSchema);

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}

function ajvIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? "invalid value",
  }));
}

function domainIssues(cycle: CycleDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sessionIds = new Set<string>();
  const byWeek = new Map<number, WorkoutSession[]>();
  for (const session of cycle.sessions) {
    if (session.cycleId !== cycle.cycleId) issues.push({ path: `/sessions/${session.sequence}`, message: "session cycleId must match cycleId" });
    if (sessionIds.has(session.sessionId)) issues.push({ path: `/sessions/${session.sequence}`, message: `duplicate sessionId ${session.sessionId}` });
    sessionIds.add(session.sessionId);
    const list = byWeek.get(session.weekNumber) ?? [];
    list.push(session);
    byWeek.set(session.weekNumber, list);
    const orders = session.blocks.map((block) => block.order);
    if (orders.some((order, index) => order !== index + 1)) issues.push({ path: `/sessions/${session.sessionId}/blocks`, message: "block order must be contiguous and start at 1" });
    if (session.kind === "strength") {
      if (session.mainLift) {
        const rirMatches = [...session.mainLift.prescription.matchAll(/(\d+(?:-\d+)?)\s*RIR/g)].map((match) => match[1]);
        const rirText = rirMatches.at(-1);
        if (rirText && session.mainLift.targetRir !== undefined) {
          const [min, max = min] = rirText.split("-").map(Number);
          if (session.mainLift.targetRir < min || session.mainLift.targetRir > max) issues.push({ path: `/sessions/${session.sessionId}/mainLift/targetRir`, message: "targetRir must agree with the RIR in the prescription" });
        }
      }
      const arm = session.blocks.find((block) => block.kind === "arm");
      const finisher = session.blocks.find((block) => block.kind === "finisher");
      if (session.name.startsWith("Upper") && !arm) issues.push({ path: `/sessions/${session.sessionId}/blocks`, message: "upper strength session must include an arm block" });
      if (session.name.startsWith("Upper") && !finisher && session.weekNumber !== 6) issues.push({ path: `/sessions/${session.sessionId}/blocks`, message: "non-deload upper session must include a finisher" });
      if (arm && finisher && arm.order >= finisher.order) issues.push({ path: `/sessions/${session.sessionId}/blocks`, message: "arm block must precede finisher" });
      if (finisher && session.weekNumber !== 6 && finisher.durationMinutes !== 10) issues.push({ path: `/sessions/${session.sessionId}/blocks`, message: "strength finishers must be 10 minutes outside deload" });
    }
    if (session.kind === "swim") {
      const total = session.blocks.flatMap((block) => block.items).reduce((sum, item) => sum + distanceFromPrescription(item.prescription), 0);
      const declared = session.notes?.find((note) => note.startsWith("totalMeters="));
      if (declared && Number(declared.slice("totalMeters=".length)) !== total) issues.push({ path: `/sessions/${session.sessionId}`, message: `swim distance total ${total} does not match ${declared}` });
    }
  }
  if (cycle.weeks.length !== cycle.lengthWeeks) issues.push({ path: "/weeks", message: "weeks length must equal lengthWeeks" });
  const coreExpected = cycle.lengthWeeks * 5;
  if (cycle.sessions.length !== coreExpected) issues.push({ path: "/sessions", message: `expected ${coreExpected} core sessions, got ${cycle.sessions.length}` });
  for (let week = 1; week <= cycle.lengthWeeks; week += 1) {
    const sessions = byWeek.get(week) ?? [];
    if (sessions.length !== 5) issues.push({ path: `/sessions/week-${week}`, message: "each week must contain five core sessions" });
    const sequences = sessions.map((session) => session.sequence).sort((a, b) => a - b);
    if (sequences.some((sequence, index) => sequence !== index + 1)) issues.push({ path: `/sessions/week-${week}`, message: "session sequence must be 1..5 within each week" });
    if (week > 1) {
      for (const session of sessions) {
        if (session.kind === "strength" && session.lineage.comparison === "progresses" && !session.lineage.comparisonSessionId) issues.push({ path: `/sessions/${session.sessionId}/lineage`, message: "progressing strength session requires comparisonSessionId" });
      }
    }
  }
  const expectedLineage: Record<number, number> = { 3: 1, 4: 2, 5: 3 };
  for (const [weekText, comparisonWeek] of Object.entries(expectedLineage)) {
    const week = Number(weekText);
    for (const session of byWeek.get(week)?.filter((candidate) => candidate.kind === "strength") ?? []) {
      if (session.lineage.comparisonWeek !== comparisonWeek) issues.push({ path: `/sessions/${session.sessionId}/lineage`, message: `week ${week} must compare to week ${comparisonWeek}` });
    }
  }
  const sessionById = new Map(cycle.sessions.map((session) => [session.sessionId, session]));
  for (const session of cycle.sessions) {
    if (session.lineage.comparisonSessionId && !sessionById.has(session.lineage.comparisonSessionId)) issues.push({ path: `/sessions/${session.sessionId}/lineage`, message: "comparisonSessionId does not reference a known session" });
  }
  return issues;
}

function distanceFromPrescription(prescription: string): number {
  const match = prescription.match(/^(\d+)\s*m\b/);
  if (match) return Number(match[1]);
  const repeated = prescription.match(/(\d+)x(\d+)\s*m\b/);
  return repeated ? Number(repeated[1]) * Number(repeated[2]) : 0;
}

export function validateCycle(value: unknown): ValidationReport {
  const schemaValid = validateCycleSchema(value);
  const issues = ajvIssues(validateCycleSchema.errors);
  if (!schemaValid) return { valid: false, issues };
  issues.push(...domainIssues(value as CycleDocument));
  return { valid: issues.length === 0, issues };
}

export function validateResults(value: unknown): ValidationReport {
  const schemaValid = validateResultsSchema(value);
  const issues: ValidationIssue[] = ajvIssues(validateResultsSchema.errors);
  if (!schemaValid) return { valid: false, issues };
  const results = value as ResultsDocument;
  const ids = new Set<string>();
  for (const result of results?.results ?? []) {
    if (!result.workoutId || ids.has(result.workoutId)) issues.push({ path: "/results", message: `duplicate workoutId ${result.workoutId}` });
    ids.add(result.workoutId);
    if (!Number.isInteger(result.revision) || result.revision < 1) issues.push({ path: `/results/${result.workoutId}`, message: "revision must be a positive integer" });
    issues.push(...resultDomainIssues(result));
  }
  return { valid: issues.length === 0, issues };
}

export function validateBundle(value: unknown): ValidationReport {
  const bundle = value as CycleBundle;
  const schemaValid = validateBundleSchema(value);
  const issues: ValidationIssue[] = ajvIssues(validateBundleSchema.errors);
  if (!schemaValid) return { valid: false, issues };
  const cycle = validateCycle(bundle.cycle);
  const results = validateResults(bundle.results);
  issues.push(...cycle.issues.map((issue) => ({ ...issue, path: `/cycle${issue.path}` })), ...results.issues.map((issue) => ({ ...issue, path: `/results${issue.path}` })));
  const knownSessions = new Map(bundle.cycle.sessions.map((session) => [session.sessionId, session]));
  for (const result of bundle.results.results) {
    if (result.cycleId !== bundle.cycle.cycleId) issues.push({ path: `/results/${result.workoutId}/cycleId`, message: "result cycleId must match bundled cycle" });
    if (result.prescriptionSnapshot) {
      const expected = knownSessions.get(result.sessionId);
      if (result.prescriptionSnapshot.sessionId !== result.sessionId) issues.push({ path: `/results/${result.workoutId}/prescriptionSnapshot/sessionId`, message: "snapshot sessionId must match result" });
      if (result.prescriptionSnapshot.cycleId !== result.cycleId) issues.push({ path: `/results/${result.workoutId}/prescriptionSnapshot/cycleId`, message: "snapshot cycleId must match result" });
      if (expected && result.prescriptionSnapshot.name !== expected.name) issues.push({ path: `/results/${result.workoutId}/prescriptionSnapshot/name`, message: "prescription snapshot identity does not match bundled session" });
    }
  }
  return { valid: issues.length === 0, issues };
}

function resultDomainIssues(result: WorkoutResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (result.prescriptionSnapshot) {
    if (result.prescriptionSnapshot.sessionId !== result.sessionId) issues.push({ path: `/results/${result.workoutId}/prescriptionSnapshot/sessionId`, message: "snapshot sessionId must match result" });
    if (result.prescriptionSnapshot.cycleId !== result.cycleId) issues.push({ path: `/results/${result.workoutId}/prescriptionSnapshot/cycleId`, message: "snapshot cycleId must match result" });
  }
  for (const exercise of result.exercises) {
    for (const set of exercise.sets) {
      if (set.loadKg !== undefined && set.load !== undefined && set.loadKg !== set.load) issues.push({ path: `/results/${result.workoutId}/exercises/${exercise.exerciseId}/sets/${set.setNumber}`, message: "loadKg and compatibility load must agree" });
      if (set.unit === "bodyweight" && set.loadKg !== undefined && set.loadKg !== 0) issues.push({ path: `/results/${result.workoutId}/exercises/${exercise.exerciseId}/sets/${set.setNumber}`, message: "bodyweight sets cannot carry a non-zero kg load" });
    }
  }
  return issues;
}

export function assertValid(report: ValidationReport, label: string): void {
  if (!report.valid) throw new Error(`${label} is invalid:\n${report.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`);
}
