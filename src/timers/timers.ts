export type TimerKind = "rest" | "amrap" | "emom" | "interval";
export interface TimerState { kind: TimerKind; startedAt: number; durationSeconds: number; pausedAt?: number; label?: string; intervalSeconds?: number; rounds?: number; }

export function timerElapsed(timer: TimerState, now = Date.now()): number { return Math.max(0, Math.min(timer.durationSeconds, ((timer.pausedAt ?? now) - timer.startedAt) / 1000)); }
export function timerRemaining(timer: TimerState, now = Date.now()): number { return Math.max(0, timer.durationSeconds - timerElapsed(timer, now)); }
export function timerComplete(timer: TimerState, now = Date.now()): boolean { return timerRemaining(timer, now) <= 0; }
export function currentInterval(timer: TimerState, now = Date.now()): { round: number; phaseSeconds: number } {
  const interval = timer.intervalSeconds || timer.durationSeconds;
  const elapsed = timerElapsed(timer, now);
  return { round: Math.min(timer.rounds ?? Number.POSITIVE_INFINITY, Math.floor(elapsed / interval) + 1), phaseSeconds: elapsed % interval };
}
export function makeTimer(kind: TimerKind, durationSeconds: number, now = Date.now(), extra: Partial<TimerState> = {}): TimerState { return { kind, durationSeconds, startedAt: now, ...extra }; }
export function formatSeconds(seconds: number): string { const value = Math.max(0, Math.ceil(seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; }
