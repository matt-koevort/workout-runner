import type { CycleBundle, CycleDocument, ResultsDocument } from "../domain/types.js";
import { mergeResults } from "../domain/results.js";
import { validateBundlePortable, validateCyclePortable, validateResultsPortable, isCycleBundle, isCycleDocument, isResultsDocument } from "../domain/portable-validation.js";
import type { RunnerState } from "../storage/types.js";

export class ImportError extends Error { constructor(message: string) { super(message); this.name = "ImportError"; } }
type ImportResult =
  | { kind: "bundle"; value: CycleBundle }
  | { kind: "cycle"; value: CycleDocument }
  | { kind: "results"; value: ResultsDocument };

export function parseJson(text: string): unknown { try { return JSON.parse(text) as unknown; } catch { throw new ImportError("The selected file is not valid JSON."); } }

export function validateImport(value: unknown): ImportResult {
  if (isCycleBundle(value)) { const report = validateBundlePortable(value); if (!report.valid) throw new ImportError(`Invalid cycle bundle: ${report.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`); return { kind: "bundle", value }; }
  if (isCycleDocument(value)) { const report = validateCyclePortable(value); if (!report.valid) throw new ImportError(`Invalid cycle: ${report.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`); return { kind: "cycle", value }; }
  if (isResultsDocument(value)) { const report = validateResultsPortable(value); if (!report.valid) throw new ImportError(`Invalid results: ${report.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`); return { kind: "results", value }; }
  throw new ImportError("Choose a cycle bundle, cycle JSON, or results JSON file.");
}

/** Validate everything before returning a new state: callers can commit atomically. */
export function applyImport(current: RunnerState, parsed: unknown): RunnerState {
  const imported = validateImport(parsed);
  const next: RunnerState = JSON.parse(JSON.stringify(current)) as RunnerState;
  if (imported.kind === "cycle") { next.cycle = imported.value; next.draft = undefined; return next; }
  if (imported.kind === "bundle") {
    next.cycle = imported.value.cycle;
    const merged = mergeResults(next.results, imported.value.results);
    if (merged.conflicts.length) throw new ImportError(`Results conflict at same revision: ${merged.conflicts.join(", ")}`);
    next.results = merged.results;
    next.draft = undefined;
    return next;
  }
  const merged = mergeResults(next.results, imported.value);
  if (merged.conflicts.length) throw new ImportError(`Results conflict at same revision: ${merged.conflicts.join(", ")}`);
  next.results = merged.results; return next;
}
