/**
 * The browser end of the one seam: `POST /ipc/:channel` on the local server.
 *
 * Under Electron the renderer reaches the main process through
 * `ipcRenderer.invoke`; here it reaches the same handlers over HTTP. The
 * argument list and the return value are the ones the handler already speaks,
 * so this is a transport swap and nothing more.
 */

/**
 * Requests go to the frontend dev server, which proxies `/ipc` to the local
 * server — one origin, so no CORS and no port to configure in two places.
 */
export const invoke = async (channel: string, args: unknown[]) => {
  const response = await fetch(`/ipc/${encodeURIComponent(channel)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const body = await response.json();

  if (!response.ok) {
    // The server names the channel in its error; keeping that message intact
    // is the difference between a diagnosable failure and a mystery.
    throw new Error(body?.error ?? `Channel "${channel}" failed`);
  }

  return body.result;
};
