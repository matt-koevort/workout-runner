# Workout Runner

Workout Runner is a generic, local-first mobile PWA for following a structured cycle and recording actual training. User cycles and results are imported at runtime; they are not bundled in the app source or static assets.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL shown by Vite. For a production preview:

```sh
npm run build       # TypeScript/CLI output in dist/
npm run build:web   # browser output in dist-web/
npm run preview
```

The app is static and can be hosted under a repository sub-path (for example GitHub Pages). Vite emits relative asset paths; the service worker scopes itself to the deployed path.

## Phone setup

1. Create a cycle bundle with the workout-cycle tooling (`cycle.json` plus an empty results document), or use the CLI `pack` command.
2. Open the hosted app on your phone and choose **Import cycle bundle**. The file is validated before it can replace the current cycle.
3. Use the browser's **Add to Home Screen** / **Install app** action. The shell and imported data continue to work offline after the first load.
4. Record sets as you train. Entries are saved locally after each meaningful edit and an in-progress session can be resumed.
5. Use **Export backup** regularly; share it to Files/Drive or download it, then use **Restore from file** when moving devices or recovering data.

Starting or skipping a core session makes its week the active week. Browsing another week does not change it. An active draft takes priority for Next Up. Otherwise, Next Up selects the first incomplete session in the active week, then later weeks, then any earlier unfinished sessions. Earlier sessions stay available until you complete or explicitly skip them. Use **Skip session** on a week-list card to skip only that session, without starting it. Finish or abandon an active draft before selecting another session. Optional recovery never advances the sequence.

Exercise details and workout cards show **Previous actual work** from the latest completed, logged prior occurrence. Exercise IDs and comparison lineage take priority within an occurrence; imported legacy exercises can match by normalized name. Blank fields stay unrecorded; zero is a recorded value. Current sessions, later sessions in the cycle, and results completed after a draft started are excluded.

Use **Add set** or the **×** control on a specific row to change performed sets. Removing a row renumbers the remaining sets and keeps their recorded values. The prescribed set target stays visible and unchanged. Removing a populated row requires confirmation, including rows containing a recorded zero. Empty rows can be removed immediately, down to zero. Rows survive refresh, resume and backup restore. Completed and skipped results can be reviewed but cannot be edited in the workout UI.

Existing installations keep the same IndexedDB database and store. Legacy drafts expand sparse edited sets into their prescribed rows without changing recorded values or completed results. If saved data is damaged, the app keeps its original record separately and offers **Export recovery data** in the warning, alongside the normal import/restore path. Do not clear browser data to upgrade. The fifth-session reminder is a prompt to export a backup, not an automatic upload.

## Privacy and limitations

There is no account, server, subscription or fitness-platform integration. IndexedDB holds cycle/results data on the device. Clearing browser site data without an exported backup removes it. Sharing/export is manual.

Timers restore from persisted timestamps after refresh or suspension. They provide a foreground message, vibration and best-effort tone; browsers do not guarantee alarms while the phone is locked or the app is suspended.
