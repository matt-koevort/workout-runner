import type { CycleDocument, ExercisePrescription, WorkoutBlock, WorkoutSession } from "./types.js";

const line = (value = "") => `${value}\n`;

function renderExercise(item: ExercisePrescription): string {
  const load = item.plannedLoad?.kind === "exact" && item.plannedLoad.kg !== undefined ? ` — ${item.plannedLoad.kg} kg` : item.plannedLoad?.kind === "range" ? ` — ${item.plannedLoad.minKg}-${item.plannedLoad.maxKg} kg` : "";
  return `- ${item.name}: ${item.prescription}${load}`;
}

function renderBlock(block: WorkoutBlock): string {
  let output = line(`### ${block.label}`);
  if (block.format) output += line(`Format: ${block.format}`);
  if (block.durationMinutes) output += line(`Duration: ${block.durationMinutes} minutes`);
  if (block.rounds) output += line(`Rounds: ${block.rounds}`);
  if (block.restAfterRoundSeconds !== undefined) output += line(`Rest after round: ${block.restAfterRoundSeconds} seconds`);
  for (const item of block.items) output += line(renderExercise(item));
  return `${output}\n`;
}

export function renderCycleMarkdown(cycle: CycleDocument): string {
  let output = "";
  output += line(`# ${cycle.name}`);
  output += line();
  output += line(`- Start: ${cycle.startDate}`);
  output += line(`- Length: ${cycle.lengthWeeks} weeks`);
  if (cycle.primaryGoal) output += line(`- Primary goal: ${cycle.primaryGoal}`);
  if (cycle.enduranceGoal) output += line(`- Endurance goal: ${cycle.enduranceGoal}`);
  output += line();
  output += line("## Progression rules");
  for (const rule of cycle.progressionRules ?? []) output += line(`- ${rule}`);
  output += line();
  for (const week of cycle.weeks) {
    output += line(`## Week ${week.weekNumber} — ${week.label}`);
    for (const session of cycle.sessions.filter((candidate) => candidate.weekNumber === week.weekNumber).sort((a, b) => a.sequence - b.sequence)) {
      output += renderSession(session);
    }
  }
  output += line("## Optional recovery");
  for (const choice of cycle.optionalRecovery?.choices ?? []) output += line(`- ${choice}`);
  output += line();
  output += line("## Substitutions");
  for (const substitution of cycle.substitutions) output += line(`- ${substitution.planned} → ${substitution.substitute} (${substitution.when})`);
  return output;
}

export function renderSession(session: WorkoutSession): string {
  let output = line(`### ${session.sequence}. ${session.name}`);
  output += line(`- Session ID: \`${session.sessionId}\``);
  output += line(`- Kind: ${session.kind}`);
  if (session.targetDurationMinutes) output += line(`- Target: ${session.targetDurationMinutes} minutes`);
  if (session.lineage.comparisonSessionId) output += line(`- Lineage: ${session.lineage.comparison} ${session.lineage.comparisonSessionId}`);
  output += line();
  for (const block of [...session.blocks].sort((a, b) => a.order - b.order)) output += renderBlock(block);
  for (const note of session.notes ?? []) output += line(`> ${note}`);
  return `${output}\n`;
}
