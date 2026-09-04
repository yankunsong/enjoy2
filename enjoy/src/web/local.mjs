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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

export const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(WEB_DIR, "../..");

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

export const startLocalServer = async () => {
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
