import type { CycleBundle, ResultsDocument } from "../domain/types.js";
import type { RunnerState } from "./types.js";
import { emptyRunnerState } from "./types.js";

const DB_NAME = "workout-runner";
const STORE = "state";
const KEY = "singleton";
let memoryState: RunnerState | undefined;

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function indexedDbAvailable(): boolean { return typeof indexedDB !== "undefined"; }

export async function loadState(): Promise<RunnerState> {
  if (!indexedDbAvailable()) return clone(memoryState ?? emptyRunnerState());
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => resolve(clone(memoryState ?? emptyRunnerState()));
    request.onsuccess = () => {
      const tx = request.result.transaction(STORE, "readonly");
      const get = tx.objectStore(STORE).get(KEY);
      get.onerror = () => resolve(clone(memoryState ?? emptyRunnerState()));
      get.onsuccess = () => resolve(clone(get.result ?? emptyRunnerState()));
    };
  });
}

export async function saveState(state: RunnerState): Promise<void> {
  const next = clone(state);
  memoryState = next;
  if (!indexedDbAvailable()) return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const tx = request.result.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(next, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
  });
}

export async function clearState(): Promise<void> { memoryState = emptyRunnerState(); if (!indexedDbAvailable()) return; await saveState(memoryState); }

export function stateToBundle(state: RunnerState): CycleBundle | undefined {
  if (!state.cycle) return undefined;
  return { schemaVersion: "1.0", kind: "cycle-bundle", exportedAt: new Date().toISOString(), cycle: state.cycle, results: state.results };
}

export function resultsOnly(state: RunnerState): ResultsDocument { return clone(state.results); }
