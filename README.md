# Workout Runner

Workout Runner is a generic, local-first mobile PWA for following a structured cycle and recording actual training. Personal cycles and results are imported at runtime; they are not bundled in the app source or static assets.

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

The app advances only when a core session is explicitly completed or skipped. Optional recovery never advances the sequence. The fifth-session reminder is a prompt to export a backup, not an automatic upload.

## Privacy and limitations

There is no account, server, subscription or fitness-platform integration. IndexedDB holds cycle/results data on the device. Clearing browser site data without an exported backup removes it. Sharing/export is manual.

Timers restore from persisted timestamps after refresh or suspension. They provide a foreground message, vibration and best-effort tone; browsers do not guarantee alarms while the phone is locked or the app is suspended.
