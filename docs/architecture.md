# Workout Runner architecture

## Source of truth

`schemas/cycle.schema.json`, `schemas/results.schema.json`, and `schemas/bundle.schema.json` are the versioned contracts. `src/domain/types.ts` mirrors them for TypeScript consumers; Node runtime validation uses AJV plus domain invariants in `src/domain/validation.ts`, while phone imports use the strict browser-safe checks in `src/domain/portable-validation.ts`.

The cycle-generation skill should create one canonical `cycle.json`, validate it, and render Markdown from it. Markdown is a deterministic view for review and archival, not a second editable source of truth. The legacy handwritten cycle remains untouched while parity is established.

## Data flow

```text
training context + historical patterns
              ↓
      cycle skill / migration
              ↓
   validated cycle.json (private)
              ↓
  local import into workout-runner PWA
              ↓
   offline workout results (private)
              ↓
      results export/import
              ↓
 future cycle or weekly-planning skill
```

The current cycle is six weeks with five ordered core sessions per week (30 total): Upper A, Swim, Lower, Upper B, Run. Optional recovery is a separate non-core choice and never contributes required work. Every session is expanded; the phone does not resolve Odd/Even templates at runtime.

For integration with training skills, migration also writes the canonical directory shape `cycles/<cycle-id>/cycle.json` and its generated `cycle.md`; a flat `cycles/<cycle-id>.json` compatibility copy is retained for the current legacy layout.

## IDs, sequencing and lineage

IDs are stable and deterministic: `${cycleId}-w${week}-s${sequence}` for sessions, with block and exercise IDs below the session. Workout result IDs must equal the session ID (or add a client attempt suffix if a future product supports repeated attempts). Session sequence is always 1..5 within a week.

Odd strength variants are Weeks 1, 3 and 5; Even variants are Weeks 2 and 4; Week 6 is an explicit Even-selection deload. Strength lineage therefore records W3 → W1, W5 → W3 and W4 → W2. Endurance sessions retain their own prescriptions and may compare with the previous week without pretending to be Odd/Even strength variants.

## Results and conflict safety

Results are appendable by workout ID and revision. Import is idempotent for an identical payload, accepts a higher revision, ignores an older revision, and refuses a conflicting same-revision payload. Each set can retain load basis/unit, duration, distance, RIR, RPE and technique. Empty set fields mean “unrecorded”; numeric zero is preserved as an explicit recorded value. A result may carry `cycleRevision` and an immutable `prescriptionSnapshot` so later cycle edits cannot rewrite the prescription that produced the evidence. The browser draft's `load`/`actuals` fields are explicitly schema-listed compatibility fields, not arbitrary extras.

## Privacy boundary

Cycle documents and workout results are user data. The public runner never bundles them into static assets; it imports them at runtime into local storage. `pack` refuses output paths containing `public` or `/dist/` so a caller does not accidentally publish a private bundle.

## CLI

```text
npm run cli -- validate-cycle --input path/to/cycle.json
npm run cli -- render-cycle --input path/to/cycle.json --output /tmp/cycle.md
npm run cli -- package-cycle --input path/to/cycle.json --output /tmp/cycle.bundle.json
npm run cli -- import-results /tmp/results.json --into /tmp/results.merged.json
npm run cli -- summarize /tmp/results.merged.json
```

The stable skill-facing aliases are also available:

```text
npm run cli -- validate-cycle --input cycles/<cycle-id>/cycle.json
npm run cli -- render-cycle --input cycles/<cycle-id>/cycle.json --output cycles/<cycle-id>/cycle.md
npm run cli -- package-cycle --input cycles/<cycle-id>/cycle.json --output /tmp/cycle.bundle.json
npm run cli -- validate-log --input /tmp/results.json
```

`package-cycle` emits a deterministic JSON bundle (`cycle.bundle.json`), the documented free/local equivalent of a zip phone bundle.

All outputs are deterministic except `exportedAt` in a bundle, which is fixed by the CLI's pack operation for reproducible fixtures and can be replaced by the UI at export time.
