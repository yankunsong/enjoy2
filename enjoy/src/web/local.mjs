/**
 * Starts the local server in a plain Node process.
 *
 * The main process source is TypeScript with path aliases, and it imports
 * `electron`. Rather than adding a build step, we run it through a Vite dev
 * server in SSR mode: Vite transforms the TypeScript and, more importantly,
 * resolves `electron` and `@main/window` to the stand-ins in this directory.
 * Edit a main process file and restarting the process is enough — there is
 * nothing to rebuild.
 *
 * Run directly, this is the local server by itself, which is what the tests
 * drive: its HTTP surface is the seam. `start.mjs` imports it and adds the
 * frontend on top.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

export const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(WEB_DIR, "../..");

/**
 * Where `settings.json` goes when `SETTINGS_PATH` says nothing.
 *
 * `@main/settings` hands that variable to `electron-settings` as the directory
 * to keep the file in, and only when it is set. Left unset, `electron-settings`
 * goes looking for a directory itself, by asking the `electron` package for the
 * application — and it is a dependency, resolved outside the alias that puts
 * `fake-electron.ts` in `electron`'s place, so what answers is the real package,
 * which outside Electron has no application to give. The first read of a
 * setting then throws, before the server has finished starting.
 *
 * Under the tests this is always set, so this is the one path they were not on:
 * the documented `yarn workspace enjoy web`, whose environment is empty.
 */
export const settingsPath = () =>
  process.env.SETTINGS_PATH || path.join(os.homedir(), ".config", "enjoy-local-web");

/**
 * The path aliases both hosts share. The stand-ins each host swaps in are its
 * own; these three are just where the source lives, and drift between the two
 * lists would show up as a module resolving differently under Electron and here.
 */
export const sharedAliases = () => [
  { find: "@renderer", replacement: path.join(PROJECT_ROOT, "src/renderer") },
  { find: "@commands", replacement: path.join(PROJECT_ROOT, "src/commands") },
  { find: "@", replacement: path.join(PROJECT_ROOT, "src") },
];

/**
 * The stand-in both hosts swap in for Hosted Enjoy's client. The renderer reads
 * it for the pages that still compile; the main process models reach for it on
 * every save, to sync a record to an account this distribution does not have.
 */
export const webApiAlias = () => [
  { find: /^@\/api$/, replacement: path.join(WEB_DIR, "fake-web-api.ts") },
];

export const startLocalServer = async () => {
  // Before Vite loads a line of main process source: `@main/settings` reads it
  // as its module body runs, which is as early as anything here is imported.
  process.env.SETTINGS_PATH = settingsPath();
  fs.mkdirSync(process.env.SETTINGS_PATH, { recursive: true });

  const vite = await createServer({
    root: PROJECT_ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "warn",
    server: { middlewareMode: true, hmr: false },
    // Nothing is served to a browser from here, and dependency scanning would
    // crawl the renderer entry for no reason.
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: {
      // Order matters: the two stand-ins have to win over the `@main` and bare
      // module resolution that would otherwise match.
      alias: [
        {
          find: /^electron$/,
          replacement: path.join(WEB_DIR, "fake-electron.ts"),
        },
        {
          find: /^@main\/window$/,
          replacement: path.join(WEB_DIR, "fake-window.ts"),
        },
        { find: "@main", replacement: path.join(PROJECT_ROOT, "src/main") },
        ...webApiAlias(),
        ...sharedAliases(),
      ],
    },
  });

  try {
    const { start } = await vite.ssrLoadModule("/src/web/index.ts");
    return await start();
  } catch (err) {
    await vite.close();
    throw err;
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startLocalServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
