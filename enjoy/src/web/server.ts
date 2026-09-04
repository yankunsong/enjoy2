import http from "http";
import { AddressInfo } from "net";
import { ChannelNotFoundError, ipcMain } from "./fake-electron";
import { send } from "./json";
import { MEDIA_ROUTE, serveLibraryFile } from "./library";
import { STAGING_ROUTE, stageFile } from "./staging";

export const DEFAULT_PORT = 7100;

export const IPC_ROUTE = "/ipc/";

/**
 * The local server's HTTP surface — the one seam Local Web Enjoy is tested on.
 *
 * `POST /ipc/:channel` reproduces Electron's `invoke`: the body is the argument
 * list the renderer would have passed, the response is what the handler
 * returned.
 *
 * `GET /media/...` reproduces the `enjoy://` protocol, which is the other thing
 * the renderer needs from its host.
 *
 * `POST /files/:name` has no Electron counterpart, because under Electron a
 * dragged file already has a path. It is where the browser puts the bytes of
 * one so that an import can name it.
 */
export const createServer = () => {
  const server = http.createServer((request, response) => {
    handle(request, response).catch((err) => {
      send(response, 500, { error: messageOf(err) });
    });
  });

  return {
    listen: (port: number, host = "127.0.0.1") =>
      new Promise<string>((resolve) => {
        server.listen(port, host, () => {
          const { port: actual } = server.address() as AddressInfo;
          resolve(`http://${host}:${actual}`);
        });
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

const handle = async (
  request: http.IncomingMessage,
  response: http.ServerResponse
) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, {
      ok: true,
      // Local Web Enjoy runs the main process code without Electron; saying so
      // out loud makes the claim testable rather than aspirational.
      electron: Boolean(process.versions.electron),
    });
  }

  if (request.method === "GET" && url.pathname.startsWith(MEDIA_ROUTE)) {
    return serveLibraryFile(url.pathname, request, response);
  }

  if (request.method === "POST" && url.pathname.startsWith(STAGING_ROUTE)) {
    return stageFile(url.pathname, request, response);
  }

  if (request.method === "POST" && url.pathname.startsWith(IPC_ROUTE)) {
    const channel = decodeURIComponent(url.pathname.slice(IPC_ROUTE.length));
    const args = await readArgs(request);

    try {
      const result = await ipcMain.invoke(channel, args);
      return send(response, 200, { result: result ?? null });
    } catch (err) {
      if (err instanceof ChannelNotFoundError) {
        return send(response, 404, { error: err.message });
      }
      return send(response, 500, { error: messageOf(err) });
    }
  }

  return send(response, 404, { error: `No route for ${request.method} ${url.pathname}` });
};

const readArgs = (request: http.IncomingMessage) =>
  new Promise<unknown[]>((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("error", reject);
    request.on("end", () => {
      if (!body.trim()) return resolve([]);

      try {
        const parsed = JSON.parse(body);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (err) {
        reject(
          new Error(`Request body is not a JSON argument list: ${messageOf(err)}`)
        );
      }
    });
  });

// Handlers are free to reject with something that isn't an Error; a response
// reading `{"error": undefined}` would be exactly the silent nothing this
// server exists to avoid.
const messageOf = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

