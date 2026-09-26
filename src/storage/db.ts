import { restorePerformedRows } from "../app/sequence.js";
import type { CycleBundle, ResultsDocument } from "../domain/types.js";
import type { RunnerState } from "./types.js";
import { emptyRunnerState } from "./types.js";

const DB_NAME = "workout-runner";
const STORE = "state";
const KEY = "singleton";
const RECOVERY_KEY = "recovery-original";
const DB_VERSION = 2;
const READ_TIMEOUT_MS = 5_000;
let memoryState: RunnerState | undefined;
let pendingSave: Promise<void> = Promise.resolve();

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function indexedDbAvailable(): boolean { return typeof indexedDB !== "undefined"; }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Convert state written by any earlier PWA release into the current in-memory
 * shape without deleting a usable cycle, result, or draft. This deliberately
 * does not run strict import validation: old result records may contain fields
 * that are no longer emitted but are still useful to the athlete.
 */
export function normalizeRunnerState(raw: unknown): { state: RunnerState; migrated: boolean; warning?: string } {
  const fallback = emptyRunnerState();
  if (!isObject(raw)) return { state: fallback, migrated: true, warning: "Saved workout data was unreadable. Import your cycle or restore a backup to continue." };

  const state = fallback;
  const warnings: string[] = [];
  let migrated = raw.stateVersion !== 2;
  const cycle = raw.cycle;
  if (isObject(cycle) && Array.isArray(cycle.sessions) && Array.isArray(cycle.weeks)) {
    state.cycle = clone(cycle) as unknown as RunnerState["cycle"];
  } else if (cycle !== undefined) {
    migrated = true;
    warnings.push("the saved cycle was incomplete");
  }

  const rawResults = raw.results;
  if (isObject(rawResults) && Array.isArray(rawResults.results)) {
    const validResults = rawResults.results.filter((result: unknown) => isObject(result) && typeof result.workoutId === "string" && typeof result.sessionId === "string" && typeof result.cycleId === "string");
    if (validResults.length !== rawResults.results.length) warnings.push("some saved results were unreadable");
    state.results = {
      schemaVersion: "1.0",
      kind: "results",
      // Retain complete records and unknown legacy fields; later export/import
      // validation can report genuinely invalid external files without making
      // app startup dependent on the newest schema.
      results: clone(validResults)
        .map((result: Record<string, unknown>) => ({
          ...result,
          revision: typeof result.revision === "number" && Number.isInteger(result.revision) && result.revision > 0 ? result.revision : 1,
          status: result.status === "complete" || result.status === "skipped" ? result.status : "in-progress",
          exercises: Array.isArray(result.exercises) ? result.exercises : [],
        })),
    } as RunnerState["results"];
  } else if (rawResults !== undefined) {
    migrated = true;
    warnings.push("some saved results were unreadable");
  }

  const rawDraft = raw.draft;
  if (isObject(rawDraft) && isObject(rawDraft.prescriptionSnapshot) && typeof rawDraft.sessionId === "string") {
    const snapshot = rawDraft.prescriptionSnapshot;
    state.draft = {
      workoutId: typeof rawDraft.workoutId === "string" ? rawDraft.workoutId : rawDraft.sessionId,
      cycleId: typeof rawDraft.cycleId === "string" ? rawDraft.cycleId : typeof snapshot.cycleId === "string" ? snapshot.cycleId : "",
      sessionId: rawDraft.sessionId,
      prescriptionSnapshot: clone(snapshot) as unknown as NonNullable<RunnerState["draft"]>["prescriptionSnapshot"],
      startedAt: typeof rawDraft.startedAt === "string" ? rawDraft.startedAt : new Date().toISOString(),
      status: rawDraft.status === "complete" || rawDraft.status === "skipped" || rawDraft.status === "abandoned" ? rawDraft.status : "in-progress",
      setLayoutVersion: 1,
      actuals: isObject(rawDraft.actuals) ? clone(rawDraft.actuals) as NonNullable<RunnerState["draft"]>["actuals"] : {},
      focusedBlockId: typeof rawDraft.focusedBlockId === "string" ? rawDraft.focusedBlockId : undefined,
      focusedExerciseId: typeof rawDraft.focusedExerciseId === "string" ? rawDraft.focusedExerciseId : undefined,
      focusedSetNumber: typeof rawDraft.focusedSetNumber === "number" ? rawDraft.focusedSetNumber : undefined,
      collapsedBlocks: Array.isArray(rawDraft.collapsedBlocks) ? rawDraft.collapsedBlocks.filter((item): item is string => typeof item === "string") : [],
      notes: Array.isArray(rawDraft.notes) ? rawDraft.notes.filter((item): item is string => typeof item === "string") : [],
      timer: isObject(rawDraft.timer) ? clone(rawDraft.timer) as unknown as NonNullable<RunnerState["draft"]>["timer"] : undefined,
    };
  } else if (rawDraft !== undefined) {
    migrated = true;
    warnings.push("the saved in-progress workout was incomplete");
  }

  if (state.draft && isObject(rawDraft) && rawDraft.setLayoutVersion !== 1) {
    for (const item of state.draft.prescriptionSnapshot.blocks ?? []) for (const exercise of item.items ?? []) {
      state.draft.actuals[exercise.exerciseId] = restorePerformedRows(exercise, state.draft.actuals[exercise.exerciseId]);
    }
    migrated = true;
  }
  if (state.draft && state.results.results.some(r => r.workoutId === state.draft?.workoutId && r.status !== "in-progress")) {
    state.draft = undefined; migrated = true; warnings.push("a draft referred to a protected historical result");
  }
  state.activeWeek = typeof raw.activeWeek === "number" && Number.isInteger(raw.activeWeek) && raw.activeWeek > 0 ? raw.activeWeek : undefined;
  state.lastBackupAt = typeof raw.lastBackupAt === "string" ? raw.lastBackupAt : undefined;
  state.sessionsSinceBackup = typeof raw.sessionsSinceBackup === "number" && Number.isFinite(raw.sessionsSinceBackup) && raw.sessionsSinceBackup >= 0 ? raw.sessionsSinceBackup : 0;
  if (raw.stateVersion !== 2) migrated = true;
  return { state, migrated, ...(warnings.length ? { warning: "Some saved data could not be restored (" + warnings.join(", ") + "). Import your cycle or restore a backup to continue." } : {}) };
}

interface LoadOutcome { state: RunnerState; warning?: string }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    const timeout = window.setTimeout(() => reject(new Error("Timed out opening local workout storage.")), READ_TIMEOUT_MS);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onerror = () => { window.clearTimeout(timeout); reject(request.error ?? new Error("Could not open local workout storage.")); };
    request.onblocked = () => { window.clearTimeout(timeout); reject(new Error("Local workout storage is locked by another app tab.")); };
    request.onsuccess = () => { window.clearTimeout(timeout); resolve(request.result); };
  });
}

export async function loadStateDetailed(): Promise<LoadOutcome> {
  if (!indexedDbAvailable()) return { state: clone(memoryState ?? emptyRunnerState()), warning: "Local storage is unavailable in this browser. Your changes will not survive a refresh." };
  try {
    const db = await openDatabase();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const get = tx.objectStore(STORE).get(KEY);
      const timeout = window.setTimeout(() => reject(new Error("Timed out reading local workout storage.")), READ_TIMEOUT_MS);
      const finish = (callback: () => void) => { window.clearTimeout(timeout); callback(); };
      get.onerror = () => finish(() => reject(get.error ?? new Error("Could not read local workout storage.")));
      get.onsuccess = () => finish(() => resolve(get.result));
      tx.onerror = () => finish(() => reject(tx.error ?? new Error("Could not read local workout storage.")));
      tx.onabort = () => finish(() => reject(tx.error ?? new Error("Could not read local workout storage.")));
    });
    db.close();
    const normalized = normalizeRunnerState(raw ?? memoryState ?? emptyRunnerState());
    if (normalized.warning) {
      const recoveryDb = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = recoveryDb.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(raw, RECOVERY_KEY);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      recoveryDb.close();
    }
    if (normalized.migrated) {
      memoryState = normalized.state;
      await saveState(normalized.state);
    }
    return { state: normalized.state, ...(normalized.warning ? { warning: normalized.warning } : {}) };
  } catch (error) {
    const fallback = clone(memoryState ?? emptyRunnerState());
    return { state: fallback, warning: `${error instanceof Error ? error.message : "Could not read local workout storage."} Import your cycle or restore a backup to continue.` };
  }
}

export async function loadState(): Promise<RunnerState> {
  return (await loadStateDetailed()).state;
}

export async function saveState(state: RunnerState): Promise<void> {
  const next = clone({ ...state, stateVersion: 2 as const });
  memoryState = next;
  if (!indexedDbAvailable()) return;
  // Input events can arrive while an earlier write is still opening the database.
  // Serialize snapshots so an older edit can never overwrite a newer one.
  const write = pendingSave.catch(() => undefined).then(async () => {
    let db: IDBDatabase | undefined;
    try {
      db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db!.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(next, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Could not save local workout storage."));
        tx.onabort = () => reject(tx.error ?? new Error("Could not save local workout storage."));
      });
    } catch {
      throw new Error("Local save failed. Export a backup before closing this app.");
    } finally { db?.close(); }
  });
  pendingSave = write;
  await write;
}

export async function clearState(): Promise<void> { memoryState = emptyRunnerState(); if (!indexedDbAvailable()) return; await saveState(memoryState); }

export function stateToBundle(state: RunnerState): CycleBundle | undefined {
  if (!state.cycle) return undefined;
  return { schemaVersion: "1.0", kind: "cycle-bundle", exportedAt: new Date().toISOString(), cycle: state.cycle, results: state.results };
}

export function resultsOnly(state: RunnerState): ResultsDocument { return clone(state.results); }

/** Retain damaged source data separately so recovery never depends on clearing storage. */
export async function recoveryData(): Promise<unknown> {
  if (!indexedDbAvailable()) return undefined;
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly"); const request = tx.objectStore(STORE).get(RECOVERY_KEY);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
