import * as Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CycleBundle, CycleDocument, ResultsDocument, WorkoutSession } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaCandidates = [
  join(here, "../../../schemas/cycle.schema.json"),
  join(process.cwd(), "schemas/cycle.schema.json"),
];
const schemaPath = schemaCandidates.find((candidate) => {
  try { readFileSync(candidate); return true; } catch { return false; }
});
if (!schemaPath) throw new Error("Cannot locate schemas/cycle.schema.json");

const Ajv2020 = (Ajv2020Module as unknown as { default: new (options?: Record<string, unknown>) => { addFormat: (name: string, format: unknown) => void; compile: (schema: unknown) => ValidateFunction } }).default;
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("date", { type: "string", validate: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) });
const validateSchema: ValidateFunction = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")));

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
  const schemaValid = validateSchema(value);
  const issues = ajvIssues(validateSchema.errors);
  if (!schemaValid) return { valid: false, issues };
  issues.push(...domainIssues(value as CycleDocument));
  return { valid: issues.length === 0, issues };
}

export function validateResults(value: unknown): ValidationReport {
  const issues: ValidationIssue[] = [];
  const results = value as ResultsDocument;
  if (!results || results.schemaVersion !== "1.0" || results.kind !== "results" || !Array.isArray(results.results)) issues.push({ path: "/", message: "expected a version 1.0 results document" });
  const ids = new Set<string>();
  for (const result of results?.results ?? []) {
    if (!result.workoutId || ids.has(result.workoutId)) issues.push({ path: "/results", message: `duplicate workoutId ${result.workoutId}` });
    ids.add(result.workoutId);
    if (!Number.isInteger(result.revision) || result.revision < 1) issues.push({ path: `/results/${result.workoutId}`, message: "revision must be a positive integer" });
  }
  return { valid: issues.length === 0, issues };
}

export function validateBundle(value: unknown): ValidationReport {
  const bundle = value as CycleBundle;
  const cycle = validateCycle(bundle?.cycle);
  const results = validateResults(bundle?.results);
  const issues = [...cycle.issues.map((issue) => ({ ...issue, path: `/cycle${issue.path}` })), ...results.issues.map((issue) => ({ ...issue, path: `/results${issue.path}` }))];
  if (!bundle || bundle.kind !== "cycle-bundle" || bundle.schemaVersion !== "1.0") issues.unshift({ path: "/", message: "expected a version 1.0 cycle bundle" });
  return { valid: issues.length === 0, issues };
}

export function assertValid(report: ValidationReport, label: string): void {
  if (!report.valid) throw new Error(`${label} is invalid:\n${report.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`);
}
