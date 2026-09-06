import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCurrentCycle } from "../src/domain/cycle-builder.js";
import { writeJson } from "../src/domain/io.js";
import { renderCycleMarkdown } from "../src/domain/render.js";
import { assertValid, validateCycle } from "../src/domain/validation.js";

export function migrate(trainerDir = "/Users/matt/projects/personal-trainer"): string {
  const cycle = buildCurrentCycle();
  assertValid(validateCycle(cycle), "migrated cycle");
  const outputPath = resolve(trainerDir, "cycles", `${cycle.cycleId}.json`);
  const cycleDir = resolve(trainerDir, "cycles", cycle.cycleId);
  mkdirSync(resolve(trainerDir, "cycles"), { recursive: true });
  writeJson(outputPath, cycle);
  writeJson(resolve(cycleDir, "cycle.json"), cycle);
  writeFileSync(resolve(cycleDir, "cycle.md"), renderCycleMarkdown(cycle), "utf8");
  return outputPath;
}

if (process.argv[1]?.endsWith("migrate.js")) {
  const args = process.argv.slice(2);
  const trainerDir = args[0] === "--trainer-dir" ? args[1] : args[0];
  console.log(migrate(trainerDir));
}
