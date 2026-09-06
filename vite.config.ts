import { defineConfig } from "vite";

// Keep the browser artifact separate from dist/, which is owned by the TypeScript CLI build.
// Relative asset URLs also make the static app work under a repository sub-path.
export default defineConfig({ base: "./", build: { outDir: "dist-web", emptyOutDir: true } });
