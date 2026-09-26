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

## Runner progression and performed rows

The local optional `activeWeek` records the week selected by starting or skipping a session. A draft takes priority. Older installations and restored bundles infer the week from the latest timestamped result in the current cycle, falling back to Week 1. Browsing does not advance progress. Next Up searches the active week and later weeks before earlier unfinished sessions. Progress counts only explicit completed/skipped core sessions; it never creates skipped records for intervening sessions.

`setLayoutVersion: 1` on drafts/results identifies an explicit performed-row array, including an empty array. Unmarked legacy rows were sparse edited values, so draft normalization and result resume pad them to at least the prescribed target and preserve higher numbered rows. Result JSON keeps schema version 1.0 with an optional additive layout field accepted by both validators. New exports need the updated runner/tooling; existing files remain importable. Completed records and their snapshots are not migrated or rewritten.

Prior-performance lookup sorts completed occurrences by completion time before the draft start time, or now in preview. It excludes the current session and later positions in the same cycle. IDs and the connected comparison-exercise lineage match first, then normalized Unicode names with case, punctuation and whitespace folded. It uses actual result fields only. When an old record has no snapshot or matching cycle session, its completion timestamp is the available ordering evidence. Cross-cycle history can match by identity or name. Occurrences without any logged values do not hide an older logged occurrence.

IndexedDB remains version 2. The state remains version 2 with optional fields; normalization recognizes legacy layouts directly. Unreadable originals are stored under `recovery-original` before a normalized state can replace them. Recovery export is a raw diagnostic record, not a validated bundle; normal backups remain the portable restore format. Local save failures show a persistent backup warning.

The service worker precaches HTML, manifest, icon and the HTML's hashed CSS/JS assets before activation. Navigation tries the network, then uses the installed offline index. Cached assets stay within the app subpath. Matching ignores Vary headers for this same-origin static shell so Vite preview assets cached without an Origin header still match later CORS module requests. Activation removes only old Workout Runner shell caches and never touches IndexedDB.

Run `npm test`, `npm run build`, `npm run build:web`, and `npm run privacy:scan` before deployment. The privacy scan checks public source and build output for credential signatures, private filesystem paths and serialized user documents. Synthetic fixtures stay in tests and runtime import files, never in public assets.

Each performed row has its own removal control. Removal retains all surviving actual fields and renumbers rows consecutively. The confirmation names the exercise and selected set. It does not change the prescription or completed history.

Actual text fields save on input without requiring blur or a per-set completion action. Select fields save on change. Each input updates the draft immediately and queues a local IndexedDB snapshot in order; no debounce delay is used. Temporary incomplete numeric input retains the last valid saved value. Legacy set completion flags remain supported in stored data and export/import.
