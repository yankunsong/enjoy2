/**
 * Launches the Local Web Enjoy server in a plain Node process.
 *
 * The main process source is TypeScript with path aliases, and it imports
 * `electron`. Rather than adding a build step, we run it through a Vite dev
 * server in SSR mode: Vite transforms the TypeScript and, more importantly,
 * resolves `electron` and `@main/window` to the stand-ins in this directory.
 * Edit a main process file and restarting the process is enough — there is
 * nothing to rebuild.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const web = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(web, "../..");

const vite = await createServer({
  root,
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
      { find: /^electron$/, replacement: path.join(web, "fake-electron.ts") },
      { find: /^@main\/window$/, replacement: path.join(web, "fake-window.ts") },
      { find: "@main", replacement: path.join(root, "src/main") },
      { find: "@renderer", replacement: path.join(root, "src/renderer") },
      { find: "@commands", replacement: path.join(root, "src/commands") },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
});

try {
  const { start } = await vite.ssrLoadModule("/src/web/index.ts");
  await start();
} catch (err) {
  console.error(err);
  await vite.close();
  process.exit(1);
}
