import "./styles.css";
import type { ExercisePrescription, WorkoutResult, WorkoutSession } from "../domain/types.js";
import { loadStateDetailed, recoveryData, saveState, stateToBundle } from "../storage/db.js";
import type { RunnerState, SessionDraft, SetActual } from "../storage/types.js";
import { applyImport, ImportError, parseJson } from "./imports.js";
import { activeWeekFor, formatActual, performedRows, restorePerformedRows, removePerformedRow, setHasActual, coreSessions, nextCoreSession, previousExerciseResult, sessionProgress, sessionStatus, sessionsForWeek, type SessionStatus } from "./sequence.js";
import { formatSeconds, makeTimer, timerComplete, timerRemaining, currentInterval } from "../timers/timers.js";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
if (!appRoot) throw new Error("Missing app root");

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const esc = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
const setCount = (item: ExercisePrescription): number => item.sets ?? 1;
const inputValue = (value: unknown): string => value === undefined || value === null ? "" : String(value);

class WorkoutRunner {
  private state: RunnerState = { stateVersion: 2, results: { schemaVersion: "1.0", kind: "results", results: [] }, sessionsSinceBackup: 0 };
  private view: "home" | "weeks" | "session" | "preview" = "home";
  private selectedWeek = 1;
  private previewSession?: WorkoutSession;
  private timerHandle?: number;
  private message = "";
  private saveWarning = "";
  private restoreFocusOnNextRender = false;
  private audioContext?: AudioContext;
  private pendingConfirmation?: { message: string; resolve: (accepted: boolean) => void };

  async start(): Promise<void> {
    try {
      const loaded = await loadStateDetailed();
      this.state = loaded.state;
      if (loaded.warning) this.message = loaded.warning;
      if (this.state.cycle) this.selectedWeek = sessionProgress(this.state.cycle, this.state.results, this.state.draft?.sessionId, this.state.activeWeek).week;
    } catch (error) {
      // Keep the app usable even if an unexpected browser/storage error escapes
      // the storage adapter. The user gets a recoverable import/restore path
      // instead of being left on the static loading shell forever.
      this.message = `${error instanceof Error ? error.message : "Could not load local workout data."} Import your cycle or restore a backup to continue.`;
    }
    this.render();
    navigator.serviceWorker?.register("./sw.js").catch(() => undefined);
  }

  private async persist(): Promise<void> { try { await saveState(this.state); this.saveWarning = ""; } catch (error) { this.saveWarning = error instanceof Error ? error.message : "Local save failed. Export a backup."; } }
  private notify(message: string): void { this.message = message; this.render(); }

  private render(): void {
    if (this.timerHandle) window.clearInterval(this.timerHandle);
    appRoot.innerHTML = this.view === "session" && this.state.draft
      ? this.sessionHtml(this.state.draft.prescriptionSnapshot)
      : this.view === "preview" && this.previewSession
        ? this.previewHtml(this.previewSession)
        : this.view === "weeks"
          ? this.weeksHtml()
          : this.homeHtml();
    if (this.pendingConfirmation) appRoot.insertAdjacentHTML("beforeend", `<div class="confirmation-backdrop"><section class="confirmation" role="alertdialog" aria-modal="true" aria-label="Confirm change"><p>${esc(this.pendingConfirmation.message)}</p><button class="button secondary" data-action="cancel-change">Keep it</button><button class="button primary" data-action="confirm-change">Confirm</button></section></div>`);
    this.bind();
    if (this.pendingConfirmation) {
      appRoot.querySelector("main")?.setAttribute("inert", "");
      appRoot.querySelector("[role='alertdialog']")?.addEventListener("keydown", event => {
        const key = (event as KeyboardEvent).key;
        if (key === "Escape") { event.preventDefault(); const pending = this.pendingConfirmation; this.pendingConfirmation = undefined; this.render(); pending?.resolve(false); }
      });
    }
    if (this.restoreFocusOnNextRender && this.state.draft) {
      this.restoreFocusOnNextRender = false;
      const draft = this.state.draft;
      window.requestAnimationFrame(() => {
        const card = Array.from(appRoot.querySelectorAll<HTMLElement>("[data-exercise-card]"))
          .find((candidate) => candidate.dataset.exerciseCard === draft.focusedExerciseId);
        const field = Array.from(appRoot.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-action='actual']"))
          .find((candidate) => candidate.dataset.exercise === draft.focusedExerciseId && Number(candidate.dataset.set) === (draft.focusedSetNumber ?? 1));
        card?.scrollIntoView({ block: "center", behavior: "smooth" });
        field?.focus({ preventScroll: true });
      });
    }
    if (this.state.draft?.timer) {
      this.timerHandle = window.setInterval(() => {
        if (!this.state.draft?.timer) return;
        if (timerComplete(this.state.draft.timer)) { this.state.draft.timer = undefined; this.timerCompleteFeedback(); void this.persist(); return; }
        const timer = appRoot.querySelector<HTMLElement>("[data-timer]");
        if (timer) timer.textContent = this.timerText(this.state.draft.timer);
      }, 250);
    }
  }

  private messageHtml(): string { return (this.saveWarning ? `<div class="notice" role="alert">${esc(this.saveWarning)}</div>` : "") + (this.message ? `<div class="notice" role="status">${esc(this.message)}${/saved data|saved results|storage|could not be restored/i.test(this.message) ? `<button class="button text" data-action="recovery-export">Export recovery data</button>` : ""}</div>` : ""); }
  private homeHtml(): string {
    const cycle = this.state.cycle;
    if (!cycle) return `<main class="shell welcome"><div class="brand-mark">WR</div><h1>Workout Runner</h1><p class="lede">A private, offline-first place to follow a cycle and record what actually happened.</p>${this.messageHtml()}<button class="button primary" data-action="import">Import cycle bundle</button><input id="cycle-file" hidden type="file" accept=".json,application/json" /><p class="muted">Your cycle stays in this browser. Nothing is uploaded.</p></main>`;
    const next = nextCoreSession(cycle, this.state.results, this.state.draft?.sessionId, this.state.activeWeek);
    const progress = sessionProgress(cycle, this.state.results, this.state.draft?.sessionId, this.state.activeWeek);
    const draft = this.state.draft;
    const done = this.state.results.results.filter((result) => result.status === "complete").length;
    const recovery = cycle.optionalRecovery ? `<section class="progress-card"><span class="eyebrow">OPTIONAL RECOVERY · NEVER ADVANCES THE CYCLE</span><strong>${esc(cycle.optionalRecovery.name)}</strong><p class="muted">${cycle.optionalRecovery.choices.map((choice) => esc(choice)).join(" · ")}</p></section>` : "";
    return `<main class="shell"><header class="topbar"><div><span class="eyebrow">WORKOUT RUNNER</span><h1>${esc(cycle.name)}</h1></div><button class="icon-button" data-action="show-help" aria-label="About this app">?</button></header>${this.messageHtml()}<nav class="view-tabs" aria-label="Workout views"><button class="view-tab active" data-action="show-today">Today</button><button class="view-tab" data-action="show-weeks">Weeks</button></nav><section class="progress-card"><div><span class="eyebrow">CURRENT CYCLE</span><strong>Active week ${progress.week} · ${progress.done}/${progress.total} sessions</strong></div><div class="progress-track"><span style="width:${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%"></span></div></section>${draft ? `<section class="resume-card"><span class="eyebrow">IN PROGRESS</span><h2>${esc(draft.prescriptionSnapshot.name)}</h2><p>Pick up where you left off. Your entries are saved after every edit.</p><button class="button primary" data-action="resume">Resume session</button><button class="button text" data-action="abandon">Abandon draft</button></section>` : next ? `<section class="next-card"><span class="eyebrow">NEXT UP · WEEK ${next.weekNumber}</span><h2>${esc(next.name)}</h2><p>${esc(next.kind)} · ${next.targetDurationMinutes ? `${next.targetDurationMinutes} min` : "self-paced"}</p><button class="button primary" data-action="start" data-session="${esc(next.sessionId)}">Start workout</button><button class="button text" data-action="preview" data-session="${esc(next.sessionId)}">View details</button></section>` : `<section class="next-card"><span class="eyebrow">CYCLE COMPLETE</span><h2>Nice work.</h2><p>You have completed every core session in this cycle.</p></section>`}${recovery}<section class="quick-actions"><button class="button secondary" data-action="import">Import cycle / results</button><button class="button secondary" data-action="export">Export backup</button><input id="restore-file" hidden type="file" accept=".json,application/json" /><button class="button secondary" data-action="restore">Restore from file</button></section><section class="home-foot"><p>${done ? `${done} completed session${done === 1 ? "" : "s"}.` : "Ready when you are."} ${this.state.sessionsSinceBackup >= 5 ? "Back up your results when convenient." : ""}</p></section></main>`;
  }

  private weeksHtml(): string {
    const cycle = this.state.cycle!;
    const week = Math.max(1, Math.min(cycle.lengthWeeks, this.selectedWeek));
    const sessions = sessionsForWeek(cycle, week);
    const activeSessionId = this.state.draft?.sessionId;
    return `<main class="shell"><header class="topbar"><div><span class="eyebrow">WORKOUT RUNNER</span><h1>Choose a week</h1></div><button class="icon-button" data-action="show-help" aria-label="About this app">?</button></header>${this.messageHtml()}<nav class="view-tabs" aria-label="Workout views"><button class="view-tab" data-action="show-today">Today</button><button class="view-tab active" data-action="show-weeks">Weeks</button></nav><div class="week-picker" role="tablist" aria-label="Cycle weeks">${Array.from({ length: cycle.lengthWeeks }, (_, index) => { const number = index + 1; return `<button class="week-chip ${number === week ? "selected" : ""}" role="tab" aria-selected="${number === week}" data-action="select-week" data-week="${number}">W${number}${number === activeWeekFor(cycle, this.state.results, activeSessionId, this.state.activeWeek) ? " · Active" : ""}</button>`; }).join("")}</div><section class="week-heading"><div><span class="eyebrow">WEEK ${week}</span><h2>${esc(cycle.weeks.find((candidate) => candidate.weekNumber === week)?.label ?? `Week ${week}`)}</h2></div><p class="muted">Choose any incomplete session. Starting out of order does not skip earlier sessions.</p></section><section class="session-list">${sessions.map((session) => this.sessionCardHtml(session, activeSessionId)).join("")}</section>${cycle.optionalRecovery ? `<section class="recovery-section"><span class="eyebrow">OPTIONAL · DOES NOT ADVANCE THE CYCLE</span><article class="session-card recovery-card"><div><h3>${esc(cycle.optionalRecovery.name)}</h3><p>${cycle.optionalRecovery.choices.map((choice) => esc(choice)).join(" · ")}</p></div><span class="status-pill">optional</span></article></section>` : ""}</main>`;
  }

  private sessionCardHtml(session: WorkoutSession, activeSessionId?: string): string {
    const status = sessionStatus(session, this.state.results, activeSessionId);
    const statusLabel: Record<SessionStatus, string> = { upcoming: "Upcoming", "in-progress": "In progress", completed: "Completed", skipped: "Skipped", abandoned: "Abandoned" };
    const result = this.state.results.results.find((candidate) => candidate.sessionId === session.sessionId);
    const isIncomplete = status === "upcoming" || status === "in-progress";
    const action = status === "in-progress" ? "Resume" : status === "completed" || status === "skipped" ? "Review" : "Start";
    return `<article class="session-card"><div class="session-card-main"><div><span class="eyebrow">${esc(session.kind)}${session.targetDurationMinutes ? ` · ${session.targetDurationMinutes} MIN` : ""}</span><h3>${esc(session.name)}</h3><p>${session.blocks.length} blocks · ${session.blocks.flatMap((block) => block.items).length} exercises</p></div><span class="status-pill status-${status}">${statusLabel[status]}</span></div><div class="session-card-actions"><button class="button text" data-action="preview" data-session="${esc(session.sessionId)}">View details</button>${isIncomplete ? `<button class="button ${status === "in-progress" ? "secondary" : "primary"}" data-action="${status === "in-progress" ? "resume-session" : "start"}" data-session="${esc(session.sessionId)}">${action}</button><button class="button text" data-action="skip-session" data-session="${esc(session.sessionId)}">Skip session</button>` : `<button class="button secondary" data-action="review" data-session="${esc(session.sessionId)}">${action}</button>`}</div>${result?.completedAt ? `<small class="session-date">${status === "completed" ? "Completed" : "Skipped"} ${new Date(result.completedAt).toLocaleDateString()}</small>` : ""}</article>`;
  }

  private previewHtml(session: WorkoutSession): string {
    const status = sessionStatus(session, this.state.results, this.state.draft?.sessionId);
    const active = this.state.draft?.sessionId === session.sessionId;
    return `<main class="shell"><header class="session-header"><button class="back-button" data-action="show-weeks">‹</button><div><span class="eyebrow">WEEK ${session.weekNumber} · ${session.kind.toUpperCase()}</span><h1>${esc(session.name)}</h1></div><button class="icon-button" data-action="show-help" aria-label="About this app">?</button></header>${this.messageHtml()}<section class="preview-summary"><span class="status-pill status-${status}">${status.replace("-", " ")}</span><p>${esc(session.notes?.[0] ?? "Review the session below before deciding when to start it.")}</p></section>${this.resultReviewHtml(session)}<div class="blocks preview-blocks">${[...session.blocks].sort((a, b) => a.order - b.order).map((block) => `<section class="block"><div class="block-heading preview-heading"><span><span class="eyebrow">${esc(block.kind)}</span><strong>${esc(block.label)}</strong><small>${[block.format, block.durationMinutes ? `${block.durationMinutes} min` : "", block.rounds ? `${block.rounds} rounds` : ""].filter(Boolean).join(" · ")}</small></span></div><div class="block-body">${block.items.length ? block.items.map((item) => `<div class="preview-exercise"><strong>${esc(item.name)}</strong><span>${esc(item.prescription)}</span>${this.previousHtml(session, item)}</div>`).join("") : `<p class="muted">${esc(block.format ?? "Complete as noted above.")}</p>`}</div></section>`).join("")}</div><section class="session-actions">${active ? `<button class="button primary" data-action="resume">Resume session</button>` : status === "upcoming" ? `<button class="button primary" data-action="start" data-session="${esc(session.sessionId)}">Start this session</button>` : status === "in-progress" ? `<button class="button primary" data-action="resume-session" data-session="${esc(session.sessionId)}">Resume session</button>` : `<button class="button secondary" data-action="review" data-session="${esc(session.sessionId)}">Review result</button>`}</section></main>`;
  }

  private resultReviewHtml(session: WorkoutSession): string {
    const result = this.state.results.results.filter((candidate) => candidate.sessionId === session.sessionId).sort((a, b) => b.revision - a.revision)[0];
    if (!result || result.status === "in-progress" && !result.exercises.length) return "";
    const lines = result.exercises.flatMap(exercise => [...exercise.sets.map(set => `${esc(exercise.name)} · ${esc(formatActual(set))}${setHasActual(set) ? "" : " · Unrecorded"}`), ...(exercise.note ? [esc(exercise.note)] : [])]);
    return `<section class="result-review"><span class="eyebrow">RECORDED RESULT · PROTECTED</span>${lines.length ? lines.map((line) => `<p>${line}</p>`).join("") : `<p class="muted">No set details were recorded.</p>`}</section>`;
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
    const rows = performedRows(item, draft.actuals[item.exerciseId]);
    const setRows = rows.map(actual => {
      const setNumber = actual.setNumber;
      return `<div class="set-row"><span class="set-number">${setNumber}</span><input inputmode="decimal" aria-label="${esc(item.name)} set ${setNumber} load" placeholder="Load (${esc(actual.unit ?? "kg")})" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}" data-field="load" value="${inputValue(actual.load)}" /><select aria-label="Load basis" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}" data-field="loadBasis"><option value="" ${!actual.loadBasis ? "selected" : ""}>basis</option><option value="barbell" ${actual.loadBasis === "barbell" ? "selected" : ""}>total</option><option value="per-side" ${actual.loadBasis === "per-side" ? "selected" : ""}>per side</option><option value="bodyweight" ${actual.loadBasis === "bodyweight" ? "selected" : ""}>bodyweight</option></select><input inputmode="numeric" aria-label="${esc(item.name)} set ${setNumber} reps" placeholder="Reps" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}" data-field="reps" value="${inputValue(actual.reps)}" /><input inputmode="decimal" aria-label="${esc(item.name)} set ${setNumber} RIR" placeholder="RIR" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}" data-field="rir" value="${inputValue(actual.rir)}" /><button class="remove-set" aria-label="Remove ${esc(item.name)} set ${setNumber}" title="Remove set ${setNumber}" data-action="remove-set" data-exercise="${esc(item.exerciseId)}" data-set="${setNumber}">×</button></div>`;
    }).join("");
    return `<article class="exercise-card" data-exercise-card="${esc(item.exerciseId)}"><div class="exercise-heading"><div><h3>${esc(item.name)}</h3><p>${esc(item.prescription)}</p></div><span class="role">${esc(item.role)}</span></div><div class="exercise-meta">${item.targetRir !== undefined ? `Target ${item.targetRir} RIR` : ""}${item.restSeconds ? ` · ${item.restSeconds}s rest` : ""}${item.repsPerSide ? " · per side" : ""}</div>${item.restSeconds ? `<button class="rest-link" data-action="start-rest" data-seconds="${item.restSeconds}">Start ${item.restSeconds}s rest</button>` : ""}${this.previousHtml(session, item)}<p class="muted">Prescribed ${setCount(item)} sets · Performed rows ${rows.length}</p><div class="set-header"><span>SET</span><span>LOAD</span><span></span><span>REPS</span><span>RIR</span><span></span></div>${setRows}<button class="button secondary" data-action="add-set" data-exercise="${esc(item.exerciseId)}">Add set</button><details><summary>Add time, distance, effort or note</summary><div class="extra-fields"><input placeholder="RPE" inputmode="decimal" aria-label="${esc(item.name)} RPE" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="rpe" value="${inputValue(actuals[0]?.rpe)}" /><input placeholder="Seconds" inputmode="numeric" aria-label="${esc(item.name)} duration seconds" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="durationSeconds" value="${inputValue(actuals[0]?.durationSeconds)}" /><input placeholder="Meters" inputmode="numeric" aria-label="${esc(item.name)} distance meters" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="distanceMeters" value="${inputValue(actuals[0]?.distanceMeters)}" /><select aria-label="Technique" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="technique"><option value="">Technique</option><option value="clean">Clean</option><option value="acceptable">Acceptable</option><option value="degraded">Degraded</option><option value="pain-limited">Pain-limited</option></select><input placeholder="Note" aria-label="${esc(item.name)} note" data-action="actual" data-exercise="${esc(item.exerciseId)}" data-set="1" data-field="note" value="${inputValue(actuals[0]?.note)}" /></div></details></article>`;
  }

  private previousHtml(session: WorkoutSession, item: ExercisePrescription): string {
    const previous = previousExerciseResult(this.state.results, session, item.exerciseId, this.state.draft?.sessionId === session.sessionId ? this.state.draft.startedAt : undefined, this.state.cycle);
    return previous ? `<div class="previous"><span>Previous actual work</span>${previous.sets.map(set => `<p>${esc(formatActual(set))}${!setHasActual(set) ? " · Unrecorded" : ""}</p>`).join("")}${previous.note ? `<p>${esc(previous.note)}</p>` : ""}</div>` : "";
  }

  private confirmation(message: string): Promise<boolean> {
    return new Promise(resolve => { this.pendingConfirmation = {message, resolve}; this.render(); appRoot.querySelector<HTMLButtonElement>("[data-action='cancel-change']")?.focus(); });
  }

  private timerText(timer: import("../timers/timers.js").TimerState): string {
    const remaining = timerRemaining(timer);
    return `${formatSeconds(remaining)}${timer.kind === "amrap" ? " left" : ""}`;
  }

  private armAudio(): void {
    try {
      const AudioCtor = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      this.audioContext ??= new AudioCtor();
      void this.audioContext.resume();
    } catch { /* best effort; vibration/message still provide feedback */ }
  }

  private timerCompleteFeedback(): void {
    try { navigator.vibrate?.([180, 100, 180]); } catch { /* vibration is optional */ }
    try {
      if (this.audioContext) {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.frequency.value = 880;
        gain.gain.value = 0.08;
        oscillator.connect(gain); gain.connect(this.audioContext.destination);
        oscillator.start(); oscillator.stop(this.audioContext.currentTime + 0.18);
      }
    } catch { /* audio is optional */ }
    this.notify("Timer complete — next set when ready.");
  }

  private bind(): void {
    appRoot.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      const action = element.dataset.action;
      if (action === "actual") element.addEventListener(element.tagName === "SELECT" ? "change" : "input", (event) => void this.actualChanged(event.currentTarget as HTMLInputElement | HTMLSelectElement));
      else element.addEventListener("click", () => void this.act(action!, element));
    });
    appRoot.querySelector<HTMLInputElement>("#cycle-file")?.addEventListener("change", (event) => void this.fileImport(event));
    appRoot.querySelector<HTMLInputElement>("#restore-file")?.addEventListener("change", (event) => void this.fileImport(event));
  }

  private async actualChanged(input: HTMLInputElement | HTMLSelectElement): Promise<void> {
    const draft = this.state.draft; if (!draft) return;
    const exerciseId = input.dataset.exercise!; const setNumber = Number(input.dataset.set); const field = input.dataset.field as keyof SetActual;
    const item = draft.prescriptionSnapshot.blocks.flatMap(b => b.items).find(i => i.exerciseId === exerciseId)!; const entries = draft.actuals[exerciseId] ?? performedRows(item); const actual = entries.find((entry) => entry.setNumber === setNumber) ?? { setNumber };
    const value = input.value.trim();
    if (field === "load" || field === "reps" || field === "rir" || field === "rpe" || field === "durationSeconds" || field === "distanceMeters") {
      if (value === "") delete actual[field]; else { const number = Number(value); if (!Number.isFinite(number)) return; (actual as any)[field] = number; }
    } else if (value === "") delete actual[field]; else (actual as any)[field] = value;
    if (!entries.includes(actual)) entries.push(actual); draft.actuals[exerciseId] = entries.sort((a, b) => a.setNumber - b.setNumber); draft.focusedExerciseId = exerciseId; draft.focusedSetNumber = setNumber; await this.saveDraft();
  }

  private async saveDraft(): Promise<void> { const draft = this.state.draft; if (!draft) return; const existing = this.state.results.results.find(r => r.workoutId === draft.workoutId); if (existing && existing.status !== "in-progress") { this.saveWarning = "This historical result is protected. Export a backup to preserve recovery data."; return; } const result = this.resultFromDraft(draft); const index = this.state.results.results.findIndex((candidate) => candidate.workoutId === draft.workoutId); if (index === -1) this.state.results.results.push(result); else this.state.results.results[index] = result; draft.startedAt ||= new Date().toISOString(); await this.persist(); }
  private resultFromDraft(draft: SessionDraft): WorkoutResult {
    const exercises = Object.entries(draft.actuals).map(([exerciseId, sets]) => ({
      exerciseId,
      name: draft.prescriptionSnapshot.blocks.flatMap((block) => block.items).find((item) => item.exerciseId === exerciseId)?.name ?? exerciseId,
      sets: sets.map((set) => ({
        setNumber: set.setNumber,
        ...(set.load !== undefined ? { load: set.load, loadKg: set.unit === "lb" ? set.load * 0.45359237 : set.load } : {}),
        ...(set.loadBasis !== undefined ? { loadBasis: set.loadBasis } : {}),
        ...(set.unit !== undefined ? { unit: set.unit } : {}),
        ...(set.reps !== undefined ? { reps: set.reps } : {}),
        ...(set.durationSeconds !== undefined ? { durationSeconds: set.durationSeconds } : {}),
        ...(set.distanceMeters !== undefined ? { distanceMeters: set.distanceMeters } : {}),
        ...(set.rir !== undefined ? { rir: set.rir } : {}),
        ...(set.rpe !== undefined ? { rpe: set.rpe } : {}),
        ...(set.completed !== undefined ? { completed: set.completed } : {}),
        ...(set.technique !== undefined ? { technique: set.technique } : {}),
        ...(set.note !== undefined && set.note !== "" ? { note: set.note } : {}),
      })),
    }));
    const status = draft.status === "abandoned" ? "in-progress" : draft.status;
    return {
      workoutId: draft.workoutId,
      cycleId: draft.cycleId,
      sessionId: draft.sessionId,
      revision: (this.state.results.results.find((candidate) => candidate.workoutId === draft.workoutId)?.revision ?? 0) + 1,
      ...(this.state.cycle?.revision !== undefined ? { cycleRevision: this.state.cycle.revision } : {}),
      startedAt: draft.startedAt,
      ...(status === "complete" || status === "skipped" ? { completedAt: new Date().toISOString() } : {}),
      status,
      exercises,
      setLayoutVersion: 1,
      actuals: clone(draft.actuals),
      notes: draft.notes,
      ...( { prescriptionSnapshot: clone(draft.prescriptionSnapshot) } as any),
    };
  }

  private async act(action: string, element: HTMLElement): Promise<void> {
    if (action === "confirm-change" || action === "cancel-change") {
      const pending = this.pendingConfirmation; this.pendingConfirmation = undefined;
      this.render(); pending?.resolve(action === "confirm-change"); return;
    }
    if (action === "recovery-export") {
      try {
        const raw = await recoveryData();
        if (raw === undefined) { this.notify("No damaged data snapshot is stored. Use Export backup to save your current data."); return; }
        const url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], {type: "application/json"}));
        const link = document.createElement("a"); link.href = url; link.download = "workout-runner-recovery.json"; link.click(); URL.revokeObjectURL(url);
      } catch { this.notify("Recovery storage is unavailable. Export your current backup before closing the app."); }
      return;
    }
    if (action === "add-set" || action === "remove-set") {
      const draft = this.state.draft; if (!draft) return;
      const id = element.dataset.exercise!;
      const item = draft.prescriptionSnapshot.blocks.flatMap(b => b.items).find(i => i.exerciseId === id)!;
      let rows = performedRows(item, draft.actuals[id]);
      if (action === "add-set") rows.push({setNumber: rows.length + 1});
      else {
        const number = Number(element.dataset.set);
        const selected = rows.find(row => row.setNumber === number);
        if (!selected || setHasActual(selected) && !await this.confirmation(`Remove ${item.name} set ${number} and its recorded values?`)) return;
        rows = removePerformedRow(rows, number);
        if (draft.focusedExerciseId === id && draft.focusedSetNumber !== undefined) {
          draft.focusedSetNumber = rows.length ? Math.min(draft.focusedSetNumber - (draft.focusedSetNumber > number ? 1 : 0), rows.length) : undefined;
        }
      }
      draft.actuals[id] = rows; await this.saveDraft(); this.render(); return;
    }
    if (action === "skip-session") {
      const session = this.state.cycle?.sessions.find(s => s.sessionId === element.dataset.session);
      if (!session || ["completed", "skipped"].includes(sessionStatus(session, this.state.results))) return;
      if (this.state.draft && this.state.draft.sessionId !== session.sessionId) { this.notify("Finish or abandon the active draft before skipping another session."); return; }
      if (!await this.confirmation(`Skip ${session.name}? Only this session will be skipped.`)) return;
      if (!this.state.draft) this.startDraft(session);
      await this.finish("skipped"); return;
    }
    if (action === "import") { const input = appRoot.querySelector<HTMLInputElement>("#cycle-file"); if (input) input.click(); else this.clickHiddenFile(); return; }
    if (action === "restore") { appRoot.querySelector<HTMLInputElement>("#restore-file")?.click(); return; }
    if (action === "export") { await this.exportBackup(); return; }
    if (action === "home" || action === "show-today") { this.view = "home"; this.previewSession = undefined; this.render(); return; }
    if (action === "show-weeks") { this.view = "weeks"; this.previewSession = undefined; this.render(); return; }
    if (action === "select-week") { this.selectedWeek = Number(element.dataset.week) || 1; this.view = "weeks"; this.render(); return; }
    if (action === "resume") { this.view = "session"; this.restoreFocusOnNextRender = true; this.render(); return; }
    if (action === "preview") { const session = this.state.cycle?.sessions.find((candidate) => candidate.sessionId === element.dataset.session); if (session) { this.previewSession = this.state.results.results.find(r => r.sessionId === session.sessionId && r.status !== "in-progress")?.prescriptionSnapshot ?? session; this.view = "preview"; this.render(); } return; }
    if (action === "review") { const session = this.state.cycle?.sessions.find((candidate) => candidate.sessionId === element.dataset.session); if (session) { this.previewSession = this.state.results.results.find(r => r.sessionId === session.sessionId && r.status !== "in-progress")?.prescriptionSnapshot ?? session; this.view = "preview"; this.render(); } return; }
    if (action === "resume-session") { const session = this.state.cycle?.sessions.find((candidate) => candidate.sessionId === element.dataset.session); if (session) { if (this.state.draft && this.state.draft.sessionId !== session.sessionId) { this.notify(`Finish or abandon ${this.state.draft.prescriptionSnapshot.name} before resuming another session.`); return; } if (!this.state.draft) this.startDraft(session); this.view = "session"; this.previewSession = undefined; this.restoreFocusOnNextRender = true; this.render(); } return; }
    if (action === "start") { const session = this.state.cycle?.sessions.find((candidate) => candidate.sessionId === element.dataset.session); if (session) { if (this.state.draft) { this.notify(`Finish or abandon ${this.state.draft.prescriptionSnapshot.name} before starting another session.`); return; } const status = sessionStatus(session, this.state.results); if (status === "completed" || status === "skipped") { this.notify("That session is already recorded and is protected from changes."); return; } this.startDraft(session); this.view = "session"; this.restoreFocusOnNextRender = true; this.render(); } return; }
    if (action === "complete" || action === "skip") { if (action === "skip" && !await this.confirmation("Skip this session? Recorded values will be kept.")) return; await this.finish(action === "complete" ? "complete" : "skipped"); return; }
    if (action === "abandon") { if (await this.confirmation("Abandon this in-progress workout? Your recorded values will be removed.")) { if (this.state.draft) this.state.results.results = this.state.results.results.filter((result) => result.workoutId !== this.state.draft?.workoutId); this.state.draft = undefined; await this.persist(); this.view = "home"; this.notify("Draft abandoned."); } return; }
    if (action === "toggle-block") { const id = element.dataset.block!; const draft = this.state.draft!; draft.collapsedBlocks = draft.collapsedBlocks.includes(id) ? draft.collapsedBlocks.filter((x) => x !== id) : [...draft.collapsedBlocks, id]; await this.persist(); this.render(); return; }
    if (action === "start-block-timer") { const block = this.state.draft?.prescriptionSnapshot.blocks.find((candidate) => candidate.blockId === element.dataset.block); if (!block || !this.state.draft) return; this.armAudio(); const source = `${block.format ?? ""} ${block.durationMinutes ?? ""}`.toLowerCase(); const kind = source.includes("amrap") ? "amrap" : source.includes("emom") ? "emom" : source.includes("interval") ? "interval" : "rest"; const intervalMatch = block.items.flatMap((item) => [item.prescription]).join(" ").match(/(\d+)\s*min/); const intervalSeconds = intervalMatch ? Number(intervalMatch[1]) * 60 : undefined; const duration = block.durationMinutes ? block.durationMinutes * 60 : intervalSeconds ? Math.max(intervalSeconds * (block.rounds ?? 1), intervalSeconds) : 60; this.state.draft.timer = makeTimer(kind, duration, Date.now(), { label: block.format ?? block.label, intervalSeconds: kind === "emom" ? 60 : intervalSeconds, rounds: block.rounds }); await this.persist(); this.render(); return; }
    if (action === "start-rest") { if (!this.state.draft) return; this.armAudio(); this.state.draft.timer = makeTimer("rest", Number(element.dataset.seconds) || 60, Date.now(), { label: "Rest" }); await this.persist(); this.render(); return; }
    if (action === "stop-timer") { if (this.state.draft) this.state.draft.timer = undefined; await this.persist(); this.render(); return; }
    if (action === "show-help") { this.notify("Everything is stored locally on this device. Export a backup before changing or clearing browser data."); return; }
    if (action === "show-sessions") { this.notify(coreSessions(this.state.cycle!).map((session) => `${session.weekNumber}.${session.sequence} ${session.name}`).join(" · ")); return; }
  }

  private clickHiddenFile(): void { const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json"; input.addEventListener("change", (event) => void this.fileImport(event)); input.click(); }
  private startDraft(session: WorkoutSession): void {
    this.state.activeWeek = session.weekNumber;
    this.selectedWeek = session.weekNumber;
    const prior = this.state.results.results.find((candidate) => candidate.sessionId === session.sessionId && candidate.status === "in-progress");
    const actuals = prior?.actuals ?? Object.fromEntries(prior?.exercises.map((exercise) => [exercise.exerciseId, exercise.sets.map((set) => ({
      setNumber: set.setNumber, ...(set.load !== undefined ? { load: set.load } : set.loadKg !== undefined ? { load: set.loadKg } : {}), ...(set.loadBasis ? { loadBasis: set.loadBasis } : {}), ...(set.unit ? { unit: set.unit } : {}), ...(set.reps !== undefined ? { reps: set.reps } : {}), ...(set.durationSeconds !== undefined ? { durationSeconds: set.durationSeconds } : {}), ...(set.distanceMeters !== undefined ? { distanceMeters: set.distanceMeters } : {}), ...(set.rir !== undefined ? { rir: set.rir } : {}), ...(set.rpe !== undefined ? { rpe: set.rpe } : {}), ...(set.completed !== undefined ? { completed: set.completed } : {}), ...(set.technique ? { technique: set.technique } : {}), ...(set.note ? { note: set.note } : {})
    }))]) ?? []);
    const snapshot = clone(prior?.prescriptionSnapshot ?? session);
    this.state.draft = { workoutId: prior?.workoutId ?? session.sessionId, cycleId: session.cycleId, sessionId: session.sessionId, prescriptionSnapshot: snapshot, startedAt: prior?.startedAt ?? new Date().toISOString(), status: "in-progress", setLayoutVersion: 1, actuals: {...clone(actuals), ...Object.fromEntries(snapshot.blocks.flatMap(b => b.items).map(item => [item.exerciseId, clone(restorePerformedRows(item, actuals[item.exerciseId], prior?.setLayoutVersion))]))}, focusedBlockId: session.blocks[0]?.blockId, collapsedBlocks: [], notes: prior?.notes ?? [] };
    void this.saveDraft();
  }
  private async finish(status: "complete" | "skipped"): Promise<void> { if (!this.state.draft) return; this.state.draft.status = status; await this.saveDraft(); this.state.draft = undefined; this.state.sessionsSinceBackup += 1; await this.persist(); this.view = "home"; this.notify(status === "complete" ? "Session saved. The next session is ready when you are." : "Session skipped. Only this session changed; Next Up follows the active week."); }
  private async exportBackup(): Promise<void> { const bundle = stateToBundle(this.state); if (!bundle) { this.notify("Import a cycle before exporting a backup."); return; } const body = JSON.stringify(bundle, null, 2); const file = new File([body], `${bundle.cycle.cycleId}.backup.json`, { type: "application/json" }); try { if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: "Workout Runner backup", files: [file] }); else throw new Error("share unavailable"); } catch { const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); URL.revokeObjectURL(url); } this.state.lastBackupAt = new Date().toISOString(); this.state.sessionsSinceBackup = 0; await this.persist(); this.notify("Backup ready."); }
  private async fileImport(event: Event): Promise<void> { const input = event.currentTarget as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { const parsed = parseJson(await file.text()); const next = applyImport(this.state, parsed); this.state = next; if (this.state.cycle) this.selectedWeek = sessionProgress(this.state.cycle, this.state.results, this.state.draft?.sessionId, this.state.activeWeek).week; await this.persist(); this.view = "home"; this.notify("Import complete. Your existing data was kept where it did not conflict."); } catch (error) { this.notify(error instanceof ImportError ? error.message : "Import failed; existing data was not changed."); } finally { input.value = ""; } }
}

void new WorkoutRunner().start();
