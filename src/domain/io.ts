import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CycleDocument, ResultsDocument } from "./types.js";

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function emptyResults(): ResultsDocument {
  return { schemaVersion: "1.0", kind: "results", results: [] };
}

export function resultsForCycle(cycle: CycleDocument): ResultsDocument {
  return emptyResults();
}
