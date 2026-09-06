import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildCurrentCycle } from "../src/domain/cycle-builder.js";
import { writeJson } from "../src/domain/io.js";
import { assertValid, validateCycle } from "../src/domain/validation.js";

export function migrate(trainerDir = "/Users/matt/projects/personal-trainer"): string {
  const cycle = buildCurrentCycle();
  assertValid(validateCycle(cycle), "migrated cycle");
  const outputPath = resolve(trainerDir, "cycles", `${cycle.cycleId}.json`);
  mkdirSync(resolve(trainerDir, "cycles"), { recursive: true });
  writeJson(outputPath, cycle);
  return outputPath;
}

if (process.argv[1]?.endsWith("migrate.js")) {
  const args = process.argv.slice(2);
  const trainerDir = args[0] === "--trainer-dir" ? args[1] : args[0];
  console.log(migrate(trainerDir));
}
