import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { migrate } from "./migrate.js";
import { emptyResults, readJson, writeJson } from "../src/domain/io.js";
import { renderCycleMarkdown } from "../src/domain/render.js";
import { mergeResults, summarizeResults } from "../src/domain/results.js";
import type { CycleBundle, CycleDocument, ResultsDocument } from "../src/domain/types.js";
import { assertValid, validateBundle, validateCycle, validateResults } from "../src/domain/validation.js";

const defaultTrainerDir = "/Users/matt/projects/personal-trainer";
const defaultCycleFile = "2026-09-07-hybrid-hypertrophy-base.json";

function option(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function positional(args: string[]): string | undefined { return args.find((arg) => !arg.startsWith("--") && !args.slice(0, args.indexOf(arg)).includes("--trainer-dir") && !args.slice(0, args.indexOf(arg)).includes("--output") && !args.slice(0, args.indexOf(arg)).includes("--into")); }

function cyclePath(args: string[]): string {
  const trainerDir = option(args, "--trainer-dir", defaultTrainerDir)!;
  return resolve(positional(args) ?? resolve(trainerDir, "cycles", defaultCycleFile));
}

function printReport(report: { valid: boolean; issues: { path: string; message: string }[] }): void {
  if (report.valid) { console.log("valid"); return; }
  for (const issue of report.issues) console.error(`${issue.path}: ${issue.message}`);
  process.exitCode = 1;
}

function runValidate(args: string[]): void {
  const path = cyclePath(args);
  const value = readJson<unknown>(path);
  printReport(validateCycle(value));
}

function runRender(args: string[]): void {
  const cycle = readJson<CycleDocument>(cyclePath(args));
  assertValid(validateCycle(cycle), "cycle");
  const output = option(args, "--output") ?? resolve(option(args, "--trainer-dir", defaultTrainerDir)!, "cycles", `${cycle.cycleId}.generated.md`);
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(output, renderCycleMarkdown(cycle), "utf8");
  console.log(output);
}

function runPack(args: string[]): void {
  const cycle = readJson<CycleDocument>(cyclePath(args));
  assertValid(validateCycle(cycle), "cycle");
  const output = option(args, "--output") ?? resolve(option(args, "--trainer-dir", defaultTrainerDir)!, "cycles", `${cycle.cycleId}.bundle.json`);
  if (output.split(/[\\/]/).includes("public") || output.includes("/dist/")) throw new Error("Refusing to pack private athlete data into a public/dist asset path");
  const bundle: CycleBundle = { schemaVersion: "1.0", kind: "cycle-bundle", exportedAt: "1970-01-01T00:00:00.000Z", cycle, results: emptyResults() };
  writeJson(output, bundle);
  console.log(output);
}

function runImportResults(args: string[]): void {
  const incoming = readJson<ResultsDocument>(resolve(positional(args) ?? "results.json"));
  assertValid(validateResults(incoming), "incoming results");
  const output = option(args, "--into") ?? resolve(option(args, "--trainer-dir", defaultTrainerDir)!, "results.json");
  const existing = existsSync(output) ? readJson<ResultsDocument>(output) : emptyResults();
  assertValid(validateResults(existing), "existing results");
  const merge = mergeResults(existing, incoming);
  if (merge.conflicts.length) throw new Error(`Conflicting same-revision results: ${merge.conflicts.join(", ")}`);
  writeJson(output, merge.results);
  console.log(`added=${merge.added} replaced=${merge.replaced} ignored=${merge.ignored} path=${output}`);
}

function runSummarize(args: string[]): void {
  const path = positional(args) ?? option(args, "--results", resolve(option(args, "--trainer-dir", defaultTrainerDir)!, "results.json"));
  if (!path || !existsSync(path)) { console.log("Completed: 0\nIn progress: 0\nSkipped: 0"); return; }
  const value = readJson<unknown>(path);
  if ((value as { kind?: string }).kind === "cycle-bundle") {
    const report = validateBundle(value);
    assertValid(report, "bundle");
    console.log(summarizeResults((value as CycleBundle).results));
  }
  else { assertValid(validateResults(value), "results"); console.log(summarizeResults(value as ResultsDocument)); }
}

export function main(args = process.argv.slice(2)): void {
  const [command, ...rest] = args;
  try {
    switch (command) {
      case "validate": runValidate(rest); break;
      case "render": runRender(rest); break;
      case "pack": runPack(rest); break;
      case "import-results": runImportResults(rest); break;
      case "summarize": runSummarize(rest); break;
      case "migrate": console.log(migrate(option(rest, "--trainer-dir", defaultTrainerDir))); break;
      default: throw new Error("Usage: workout-runner <validate|render|pack|import-results|summarize|migrate> [path] [--trainer-dir DIR]");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("main.js")) main();
