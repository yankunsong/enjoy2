/**
 * The one command: the local server and the frontend dev server, no build step.
 *
 * The frontend is an ordinary Vite dev server with hot module replacement,
 * pointed at `browser/index.html`. It proxies the interface and the media path
 * across to the local server, so the browser only ever sees a single origin.
 */
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import {
  PROJECT_ROOT,
  WEB_DIR,
  sharedAliases,
  startLocalServer,
  webApiAlias,
} from "./local.mjs";

const DEFAULT_UI_PORT = 7101;

const local = await startLocalServer();

const ui = await createServer({
  root: path.join(WEB_DIR, "browser"),
  configFile: false,
  logLevel: "warn",
  plugins: [react(), serveAssets()],
  // What tells the renderer it is the browser distribution, and the only build
  // configuration Local Web Enjoy adds. The Electron build leaves it unset.
  define: { "import.meta.env.VITE_LOCAL_WEB_ENJOY": JSON.stringify("true") },
  resolve: {
    preserveSymlinks: true,
    alias: [
      ...webApiAlias(),
      {
        find: "vendor/pdfjs",
        replacement: path.join(
          PROJECT_ROOT,
          "node_modules/foliate-js/vendor/pdfjs"
        ),
      },
      ...sharedAliases(),
    ],
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    esbuildOptions: { target: "esnext" },
  },
  server: {
    // Loopback only, on both servers: nothing else on the network can reach
    // the Library, and the browser grants microphone access without a
    // certificate.
    host: "127.0.0.1",
    port: Number(process.env.ENJOY_WEB_UI_PORT ?? DEFAULT_UI_PORT),
    // The renderer lives outside this root; only the workspace is readable.
    fs: { allow: [PROJECT_ROOT] },
    // Trailing slashes: without them these prefixes would also swallow the
    // bridge's own `ipc.ts` and `files.ts`, which sit one directory away.
    proxy: {
      "/ipc/": { target: local.url },
      "/media/": { target: local.url },
      "/files/": { target: local.url },
      // The push channel has no trailing slash to keep it apart from the
      // bridge's own `events.ts`, so it is anchored instead. Proxied streams
      // pass through unbuffered, which is what an endless response needs.
      "^/events$": { target: local.url },
    },
  },
});

await ui.listen();

// Matches the local server's line, and is what the tests read the port from.
console.log(`Local Web Enjoy UI listening on ${ui.resolvedUrls.local[0]}`);

/**
 * Serves the `assets` directory the renderer references by absolute path — the
 * app icon and the CharisSIL font. Under Electron these are copied next to the
 * bundle; here the originals are where they always were, and there is nothing
 * to copy.
 */
function serveAssets() {
  const types = {
    ".css": "text/css",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
  };

  return {
    name: "local-web-enjoy-assets",
    configureServer(server) {
      const assets = path.join(PROJECT_ROOT, "assets");

      server.middlewares.use("/assets", (request, response, next) => {
        const file = path.resolve(
          assets,
          "." + decodeURIComponent(request.url.split("?")[0])
        );

        if (!file.startsWith(assets + path.sep) || !fs.existsSync(file)) {
          return next();
        }

        response.setHeader(
          "Content-Type",
          types[path.extname(file)] ?? "application/octet-stream"
        );
        fs.createReadStream(file).pipe(response);
      });
    },
  };
}
