import "./styles.css";
import type { ExercisePrescription, WorkoutResult, WorkoutSession } from "../domain/types.js";
import { loadState, saveState, stateToBundle } from "../storage/db.js";
import type { RunnerState, SessionDraft, SetActual } from "../storage/types.js";
import { applyImport, ImportError, parseJson } from "./imports.js";
import { coreSessions, nextCoreSession, previousExerciseResult, sessionProgress } from "./sequence.js";
import { formatSeconds, makeTimer, timerComplete, timerRemaining, currentInterval } from "../timers/timers.js";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
if (!appRoot) throw new Error("Missing app root");

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const esc = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
const setCount = (item: ExercisePrescription): number => item.sets ?? 1;
const inputValue = (value: unknown): string => value === undefined || value === null ? "" : String(value);

class WorkoutRunner {
  private state: RunnerState = { results: { schemaVersion: "1.0", kind: "results", results: [] }, sessionsSinceBackup: 0 };
  private view: "home" | "session" = "home";
  private timerHandle?: number;
  private message = "";

  async start(): Promise<void> {
    this.state = await loadState();
    this.render();
    navigator.serviceWorker?.register("./sw.js").catch(() => undefined);
  }

  private async persist(): Promise<void> { await saveState(this.state); }
  private notify(message: string): void { this.message = message; this.render(); }

  private render(): void {
    if (this.timerHandle) window.clearInterval(this.timerHandle);
    appRoot.innerHTML = this.view === "session" && this.state.draft ? this.sessionHtml(this.state.draft.prescriptionSnapshot) : this.homeHtml();
    this.bind();
    if (this.state.draft?.timer) {
      this.timerHandle = window.setInterval(() => {
        if (!this.state.draft?.timer) return;
        if (timerComplete(this.state.draft.timer)) { this.state.draft.timer = undefined; void this.persist(); this.render(); return; }
        const timer = appRoot.querySelector<HTMLElement>("[data-timer]");
        if (timer) timer.textContent = this.timerText(this.state.draft.timer);
      }, 250);
    }
  }

  private messageHtml(): string { return this.message ? `<div class="notice" role="status">${esc(this.message)}</div>` : ""; }
  private homeHtml(): string {
    const cycle = this.state.cycle;
    if (!cycle) return `<main class="shell welcome"><div class="brand-mark">WR</div><h1>Workout Runner</h1><p class="lede">A private, offline-first place to follow a cycle and record what actually happened.</p>${this.messageHtml()}<label class="button primary file-button">Import cycle bundle<input id="cycle-file" type="file" accept=".json,application/json" /></label><p class="muted">Your cycle stays in this browser. Nothing is uploaded.</p></main>`;
    const next = nextCoreSession(cycle, this.state.results, this.state.draft?.sessionId);
    const progress = sessionProgress(cycle, this.state.results);
    const draft = this.state.draft;
    const done = this.state.results.results.filter((result) => result.status === "complete").length;
    const recovery = cycle.optionalRecovery ? `<section class="progress-card"><span class="eyebrow">OPTIONAL RECOVERY · NEVER ADVANCES THE CYCLE</span><strong>${esc(cycle.optionalRecovery.name)}</strong><p class="muted">${cycle.optionalRecovery.choices.map((choice) => esc(choice)).join(" · ")}</p></section>` : "";
    return `<main class="shell"><header class="topbar"><div><span class="eyebrow">WORKOUT RUNNER</span><h1>${esc(cycle.name)}</h1></div><button class="icon-button" data-action="show-help" aria-label="About this app">?</button></header>${this.messageHtml()}<section class="progress-card"><div><span class="eyebrow">CURRENT CYCLE</span><strong>Week ${progress.week} · ${progress.done}/${progress.total} sessions</strong></div><div class="progress-track"><span style="width:${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%"></span></div></section>${draft ? `<section class="resume-card"><span class="eyebrow">IN PROGRESS</span><h2>${esc(draft.prescriptionSnapshot.name)}</h2><p>Pick up where you left off. Your entries are saved after every edit.</p><button class="button primary" data-action="resume">Resume session</button><button class="button text" data-action="abandon">Abandon draft</button></section>` : next ? `<section class="next-card"><span class="eyebrow">NEXT UP · WEEK ${next.weekNumber}</span><h2>${esc(next.name)}</h2><p>${esc(next.kind)} · ${next.targetDurationMinutes ? `${next.targetDurationMinutes} min` : "self-paced"}</p><button class="button primary" data-action="start" data-session="${esc(next.sessionId)}">Start workout</button></section>` : `<section class="next-card"><span class="eyebrow">CYCLE COMPLETE</span><h2>Nice work.</h2><p>You have completed every core session in this cycle.</p></section>`}${recovery}<section class="quick-actions"><button class="button secondary" data-action="import">Import cycle / results</button><button class="button secondary" data-action="export">Export backup</button><input id="restore-file" hidden type="file" accept=".json,application/json" /><button class="button secondary" data-action="restore">Restore from file</button></section><section class="home-foot"><p>${done ? `${done} completed session${done === 1 ? "" : "s"}.` : "Ready when you are."} ${this.state.sessionsSinceBackup >= 5 ? "Back up your results when convenient." : ""}</p><button class="button text" data-action="show-sessions">View cycle sessions</button></section></main>`;
  }

  private sessionHtml(session: WorkoutSession): string {
    const draft = this.state.draft!;
    const timer = draft.timer;
    return `<main class="shell session-shell"><header class="session-header"><button class="back-button" data-action="home">‹</button><div><span class="eyebrow">WEEK ${session.weekNumber} · ${session.kind.toUpperCase()}</span><h1>${esc(session.name)}</h1></div><button class="icon-button" data-action="show-help" aria-label="About this app">?</button></header>${this.messageHtml()}${timer ? `<section class="timer-banner"><div><span class="eyebrow">${esc(timer.label ?? timer.kind)}</span><strong data-timer>${this.timerText(timer)}</strong>${timer.kind === "emom" ? `<small>Round ${currentInterval(timer).round}</small>` : ""}</div><button class="button secondary" data-action="stop-timer">Stop</button></section>` : ""}<p class="session-note">${esc(session.notes?.[0] ?? "Record only what you actually complete. Blank fields stay unrecorded.")}</p><div class="blocks">${[...session.blocks].sort((a, b) => a.order - b.order).map((block) => this.blockHtml(session, block.blockId)).join("")}</div><section class="session-actions"><button class="button primary" data-action="complete">Complete session</button><button class="button secondary" data-action="skip">Skip session</button><button class="button text danger" data-action="abandon">Abandon draft</button></section></main>`;
  }

  private blockHtml(session: WorkoutSession, blockId: string): string {
    const block = session.blocks.find((candidate) => candidate.blockId === blockId)!;
    const draft = this.state.draft!; const collapsed = draft.collapsedBlocks.includes(block.blockId);
    const format = [block.format, block.durationMinutes ? `${block.durationMinutes} min` : "", block.rounds ? `${block.rounds} rounds` : ""].filter(Boolean).join(" · ");
    const hasTimer = Boolean(block.format || block.durationMinutes || block.kind === "interval");
    return `<section class="block ${collapsed ? "collapsed" : ""}"><button class="block-heading" data-action="toggle-block" data-block="${esc(block.blockId)}"><span><span class="eyebrow">${esc(block.kind)}</span><strong>${esc(block.label)}</strong>${format ? `<small>${esc(format)}</small>` : ""}</span><span aria-hidden="true">${collapsed ? "+" : "−"}</span></button>${!collapsed ? `<div class="block-body">${hasTimer ? `<button class="timer-button" data-action="start-block-timer" data-block="${esc(block.blockId)}">Start ${esc(block.format ?? (block.kind === "interval" ? "interval timer" : `${block.durationMinutes} minute timer`))}</button>` : ""}${block.items.length ? block.items.map((item) => this.exerciseHtml(session, item)).join("") : `<p class="muted">${esc(block.format ?? "Complete this block as noted above.")}</p>`}</div>` : ""}</section>`;
  }

  private exerciseHtml(session: WorkoutSession, item: ExercisePrescription): string {
    const draft = this.state.draft!; const actuals = draft.actuals[item.exerciseId] ?? [];
    const previous = previousExerciseResult(this.state.results, session, item.exerciseId);
    const setRows = Array.from({ length: setCount(item) }, (_, index) => {
      const setNumber = index + 1; const actual = actuals.find((candidate) => candidate.setNumber === setNumber) ?? { setNumber };
      return `<div class="set-row"><span class="set-number">${setNumber}</span><input inputmode="decimal" aria-label="${esc(item.name)} set ${setNumber} load" placeholder="Load" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}" data-field="load" value="${inputValue(actual.load)}" /><select aria-label="Load basis" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}" data-field="loadBasis"><option value="" ${!actual.loadBasis ? "selected" : ""}>basis</option><option value="barbell" ${actual.loadBasis === "barbell" ? "selected" : ""}>total</option><option value="per-side" ${actual.loadBasis === "per-side" ? "selected" : ""}>per side</option><option value="bodyweight" ${actual.loadBasis === "bodyweight" ? "selected" : ""}>bodyweight</option></select><input inputmode="numeric" aria-label="${esc(item.name)} set ${setNumber} reps" placeholder="Reps" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}" data-field="reps" value="${inputValue(actual.reps)}" /><input inputmode="decimal" aria-label="${esc(item.name)} set ${setNumber} RIR" placeholder="RIR" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}" data-field="rir" value="${inputValue(actual.rir)}" /><button class="complete-set ${actual.completed ? "selected" : ""}" aria-label="Mark set ${setNumber} complete" data-action="set-complete" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}">✓</button></div>`;
    }).join("");
    return `<article class="exercise-card"><div class="exercise-heading"><div><h3>${esc(item.name)}</h3><p>${esc(item.prescription)}</p></div><span class="role">${esc(item.role)}</span></div><div class="exercise-meta">${item.targetRir !== undefined ? `Target ${item.targetRir} RIR` : ""}${item.restSeconds ? ` · ${item.restSeconds}s rest` : ""}${item.repsPerSide ? " · per side" : ""}</div>${item.restSeconds ? `<button class="rest-link" data-action="start-rest" data-seconds="${item.restSeconds}">Start ${item.restSeconds}s rest</button>` : ""}${previous ? `<div class="previous"><span>Previous</span> ${previous.sets.map((set) => [set.loadKg !== undefined ? `${set.loadKg} kg` : "", set.reps !== undefined ? `${set.reps} reps` : "", set.rir !== undefined ? `${set.rir} RIR` : ""].filter(Boolean).join(" × ")).filter(Boolean).join(" · ") || "Recorded, no set details"}</div>` : ""}<div class="set-header"><span>SET</span><span>LOAD</span><span></span><span>REPS</span><span>RIR</span><span></span></div>${setRows}<details><summary>Add time, distance, effort or note</summary><div class="extra-fields"><input placeholder="RPE" inputmode="decimal" aria-label="${esc(item.name)} RPE" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="rpe" value="${inputValue(actuals[0]?.rpe)}" /><input placeholder="Seconds" inputmode="numeric" aria-label="${esc(item.name)} duration seconds" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="durationSeconds" value="${inputValue(actuals[0]?.durationSeconds)}" /><input placeholder="Meters" inputmode="numeric" aria-label="${esc(item.name)} distance meters" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="distanceMeters" value="${inputValue(actuals[0]?.distanceMeters)}" /><select aria-label="Technique" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="technique"><option value="">Technique</option><option value="clean">Clean</option><option value="acceptable">Acceptable</option><option value="degraded">Degraded</option><option value="pain-limited">Pain-limited</option></select><input placeholder="Note" aria-label="${esc(item.name)} note" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="note" value="${inputValue(actuals[0]?.note)}" /></div></details></article>`;
  }

  private timerText(timer: import("../timers/timers.js").TimerState): string {
    const remaining = timerRemaining(timer);
    return `${formatSeconds(remaining)}${timer.kind === "amrap" ? " left" : ""}`;
  }

  private bind(): void {
    appRoot.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      const action = element.dataset.action;
      if (action === "actual") element.addEventListener("change", (event) => this.actualChanged(event.currentTarget as HTMLInputElement | HTMLSelectElement));
      else if (action === "set-complete") element.addEventListener("click", () => this.setCompleted(element.dataset.exercise!, Number(element.dataset.set)));
      else element.addEventListener("click", () => void this.act(action!, element));
    });
    appRoot.querySelector<HTMLInputElement>("#cycle-file")?.addEventListener("change", (event) => void this.fileImport(event));
    appRoot.querySelector<HTMLInputElement>("#restore-file")?.addEventListener("change", (event) => void this.fileImport(event));
  }

  private async actualChanged(input: HTMLInputElement | HTMLSelectElement): Promise<void> {
    const draft = this.state.draft; if (!draft) return;
    const exerciseId = input.dataset.exercise!; const setNumber = Number(input.dataset.set); const field = input.dataset.field as keyof SetActual;
    const entries = draft.actuals[exerciseId] ?? []; const actual = entries.find((entry) => entry.setNumber === setNumber) ?? { setNumber };
    const value = input.value.trim();
    if (field === "load" || field === "reps" || field === "rir" || field === "rpe" || field === "durationSeconds" || field === "distanceMeters") {
      if (value === "") delete actual[field]; else (actual as any)[field] = Number(value);
    } else if (value === "") delete actual[field]; else (actual as any)[field] = value;
    if (!entries.includes(actual)) entries.push(actual); draft.actuals[exerciseId] = entries.sort((a, b) => a.setNumber - b.setNumber); draft.focusedExerciseId = exerciseId; draft.focusedSetNumber = setNumber; await this.saveDraft();
  }

  private async setCompleted(exerciseId: string, setNumber: number): Promise<void> { const draft = this.state.draft; if (!draft) return; const entries = draft.actuals[exerciseId] ?? []; const actual = entries.find((entry) => entry.setNumber === setNumber) ?? { setNumber }; actual.completed = !actual.completed; if (!entries.includes(actual)) entries.push(actual); draft.actuals[exerciseId] = entries; await this.saveDraft(); this.render(); }
  private async saveDraft(): Promise<void> { const draft = this.state.draft; if (!draft) return; const result = this.resultFromDraft(draft); const index = this.state.results.results.findIndex((candidate) => candidate.workoutId === draft.workoutId); if (index === -1) this.state.results.results.push(result); else this.state.results.results[index] = result; draft.startedAt ||= new Date().toISOString(); await this.persist(); }
  private resultFromDraft(draft: SessionDraft): WorkoutResult {
    const exercises = Object.entries(draft.actuals).map(([exerciseId, sets]) => ({ exerciseId, name: draft.prescriptionSnapshot.blocks.flatMap((block) => block.items).find((item) => item.exerciseId === exerciseId)?.name ?? exerciseId, sets: sets.map((set) => ({ ...(set.load !== undefined ? { loadKg: set.load } : {}), ...(set.reps !== undefined ? { reps: set.reps } : {}), ...(set.rir !== undefined ? { rir: set.rir } : {}), ...(set.completed !== undefined ? { completed: set.completed } : {}), ...(set.note ? { note: set.note } : {}), ...set })) }));
    return { workoutId: draft.workoutId, cycleId: draft.cycleId, sessionId: draft.sessionId, revision: (this.state.results.results.find((candidate) => candidate.workoutId === draft.workoutId)?.revision ?? 0) + 1, startedAt: draft.startedAt, status: draft.status === "abandoned" ? "in-progress" : draft.status, exercises, notes: draft.notes, ...( { prescriptionSnapshot: clone(draft.prescriptionSnapshot), actuals: clone(draft.actuals) } as any) };
  }

  private async act(action: string, element: HTMLElement): Promise<void> {
    if (action === "import") { appRoot.querySelector<HTMLInputElement>("#cycle-file")?.click() ?? this.clickHiddenFile(); return; }
    if (action === "restore") { appRoot.querySelector<HTMLInputElement>("#restore-file")?.click(); return; }
    if (action === "export") { await this.exportBackup(); return; }
    if (action === "home") { this.view = "home"; this.render(); return; }
    if (action === "resume") { this.view = "session"; this.render(); return; }
    if (action === "start") { const session = this.state.cycle?.sessions.find((candidate) => candidate.sessionId === element.dataset.session); if (session) { this.startDraft(session); this.view = "session"; this.render(); } return; }
    if (action === "complete" || action === "skip") { await this.finish(action === "complete" ? "complete" : "skipped"); return; }
    if (action === "abandon") { if (confirm("Abandon this in-progress workout? Your recorded values will be removed.")) { if (this.state.draft) this.state.results.results = this.state.results.results.filter((result) => result.workoutId !== this.state.draft?.workoutId); this.state.draft = undefined; await this.persist(); this.view = "home"; this.notify("Draft abandoned."); } return; }
    if (action === "toggle-block") { const id = element.dataset.block!; const draft = this.state.draft!; draft.collapsedBlocks = draft.collapsedBlocks.includes(id) ? draft.collapsedBlocks.filter((x) => x !== id) : [...draft.collapsedBlocks, id]; await this.persist(); this.render(); return; }
    if (action === "start-block-timer") { const block = this.state.draft?.prescriptionSnapshot.blocks.find((candidate) => candidate.blockId === element.dataset.block); if (!block || !this.state.draft) return; const source = `${block.format ?? ""} ${block.durationMinutes ?? ""}`.toLowerCase(); const kind = source.includes("amrap") ? "amrap" : source.includes("emom") ? "emom" : source.includes("interval") ? "interval" : "rest"; const intervalMatch = block.items.flatMap((item) => [item.prescription]).join(" ").match(/(\d+)\s*min/); const intervalSeconds = intervalMatch ? Number(intervalMatch[1]) * 60 : undefined; const duration = block.durationMinutes ? block.durationMinutes * 60 : intervalSeconds ? Math.max(intervalSeconds * (block.rounds ?? 1), intervalSeconds) : 60; this.state.draft.timer = makeTimer(kind, duration, Date.now(), { label: block.format ?? block.label, intervalSeconds: kind === "emom" ? 60 : intervalSeconds, rounds: block.rounds }); await this.persist(); this.render(); return; }
    if (action === "start-rest") { if (!this.state.draft) return; this.state.draft.timer = makeTimer("rest", Number(element.dataset.seconds) || 60, Date.now(), { label: "Rest" }); await this.persist(); this.render(); return; }
    if (action === "stop-timer") { if (this.state.draft) this.state.draft.timer = undefined; await this.persist(); this.render(); return; }
    if (action === "show-help") { this.notify("Everything is stored locally on this device. Export a backup before changing or clearing browser data."); return; }
    if (action === "show-sessions") { this.notify(coreSessions(this.state.cycle!).map((session) => `${session.weekNumber}.${session.sequence} ${session.name}`).join(" · ")); return; }
  }

  private clickHiddenFile(): void { const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json"; input.addEventListener("change", (event) => void this.fileImport(event)); input.click(); }
  private startDraft(session: WorkoutSession): void { this.state.draft = { workoutId: session.sessionId, cycleId: session.cycleId, sessionId: session.sessionId, prescriptionSnapshot: clone(session), startedAt: new Date().toISOString(), status: "in-progress", actuals: {}, collapsedBlocks: [], notes: [] }; void this.saveDraft(); }
  private async finish(status: "complete" | "skipped"): Promise<void> { if (!this.state.draft) return; this.state.draft.status = status; await this.saveDraft(); this.state.draft = undefined; this.state.sessionsSinceBackup += 1; await this.persist(); this.view = "home"; this.notify(status === "complete" ? "Session saved. The next session is ready when you are." : "Session skipped. The sequence will continue from the next session."); }
  private async exportBackup(): Promise<void> { const bundle = stateToBundle(this.state); if (!bundle) { this.notify("Import a cycle before exporting a backup."); return; } const body = JSON.stringify(bundle, null, 2); const file = new File([body], `${bundle.cycle.cycleId}.backup.json`, { type: "application/json" }); try { if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: "Workout Runner backup", files: [file] }); else throw new Error("share unavailable"); } catch { const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); URL.revokeObjectURL(url); } this.state.lastBackupAt = new Date().toISOString(); this.state.sessionsSinceBackup = 0; await this.persist(); this.notify("Backup ready."); }
  private async fileImport(event: Event): Promise<void> { const input = event.currentTarget as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { const parsed = parseJson(await file.text()); const next = applyImport(this.state, parsed); this.state = next; await this.persist(); this.view = "home"; this.notify("Import complete. Your existing data was kept where it did not conflict."); } catch (error) { this.notify(error instanceof ImportError ? error.message : "Import failed; existing data was not changed."); } finally { input.value = ""; } }
}

void new WorkoutRunner().start();
