import http from "http";
import { push } from "./push";

/**
 * `GET /events`: the local server's end of the push channel, and the third and
 * last route on the seam.
 *
 * Server-sent events rather than a WebSocket: the traffic here is one-way, and
 * SSE is a browser built-in that reconnects by itself, so a dropped connection
 * costs nothing and no dependency is added for it.
 *
 * The body is the push message as it left the main process — the channel name
 * and the argument list — because the browser end dispatches by channel to the
 * listeners the renderer already registers. That is what lets `onState(cb)` and
 * every other subscription keep the signature it has under Electron.
 */
export const EVENTS_ROUTE = "/events";

/**
 * Long enough to stay out of the way, short enough that an idle connection is
 * not mistaken for a dead one by anything between here and the browser.
 */
const HEARTBEAT_MS = 15000;

export const streamEvents = (
  request: http.IncomingMessage,
  response: http.ServerResponse
) => {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    // The dev server proxies this through; buffering or compressing a stream
    // that never ends would hold every message until it did.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  // A comment line, which SSE ignores. It flushes the headers, so the browser
  // reports the connection open now rather than at the first push.
  response.write(": open\n\n");

  const unsubscribe = push.subscribe((message) => {
    let data: string;
    try {
      data = JSON.stringify(message);
    } catch (err) {
      // A push nobody can serialise is a bug at the push site; dropping the
      // stream over it would take every other channel down with it.
      return console.error(
        `Push on "${message.channel}" could not be serialised:`,
        err
      );
    }

    response.write(`data: ${data}\n\n`);
  });

  const heartbeat = setInterval(() => response.write(": ping\n\n"), HEARTBEAT_MS);

  const stop = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  request.on("close", stop);
  response.on("close", stop);
};
