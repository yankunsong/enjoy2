import { toBrowserUrls } from "./media-url";

/**
 * The browser end of the main process's push outlets.
 *
 * Desktop Enjoy's renderer subscribes with `ipcRenderer.on(channel, listener)`
 * and the main process pushes progress, notifications and database transactions
 * at it. Here the same subscriptions are fed from two places: `GET /events`,
 * which carries what the main process pushed, and `emit` from inside the
 * browser (the lookup and translate widgets talk to themselves that way even
 * under Electron). Neither is visible to a subscriber, which is why every
 * `onState(callback)`-shaped signature survives the move unchanged.
 */

/** Stands in for Electron's `IpcRendererEvent`, which no listener reads. */
export type BridgeEvent = Record<string, never>;

export type Listener = (event: BridgeEvent, ...args: any[]) => void;

const listeners = new Map<string, Set<Listener>>();

export const on = (channel: string, listener: Listener) => {
  const set = listeners.get(channel) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(channel, set);
};

export const off = (channel: string, listener: Listener) => {
  listeners.get(channel)?.delete(listener);
};

export const offAll = (channel: string) => {
  listeners.delete(channel);
};

export const emit = (channel: string, ...args: unknown[]) => {
  for (const listener of listeners.get(channel) ?? []) listener({}, ...args);
};

/**
 * The same three subscriptions, bound to a channel.
 *
 * Both halves of the bridge hand these out — the generated one for a `listen`
 * spec, `electron-only.ts` for the namespaces that have no handler behind them
 * — and a subscription that behaves differently depending on which half handed
 * it out would be a difference no caller can see and no caller expects.
 */
export const subscribe = (channel: string) => (listener: Listener) =>
  on(channel, listener);

export const unsubscribeOne = (channel: string) => (listener: Listener) =>
  off(channel, listener);

export const unsubscribe = (channel: string) => () => offAll(channel);

/** Proxied to the local server by the frontend dev server, as `/ipc` is. */
const EVENTS_ROUTE = "/events";

/**
 * Subscribes to the local server's push channel, for as long as the page lives.
 *
 * `EventSource` reconnects on its own after a drop, and the listeners above
 * outlive the connection, so nothing above this line notices one — which is
 * the reason the push channel is SSE rather than a socket we would have to
 * re-establish ourselves. Nothing that arrived while it was down is replayed;
 * see ADR 0007.
 */
export const subscribeToPushes = () => {
  const source = new EventSource(EVENTS_ROUTE);

  source.onmessage = (event) => {
    let message: { channel: string; args: unknown[] };
    try {
      message = JSON.parse(event.data);
    } catch (err) {
      // Throwing out of here would take the whole subscription with it, which
      // is the same reason the server drops a push it cannot serialise.
      return console.error("Unreadable push frame:", event.data, err);
    }

    // A pushed record carries Library addresses in the main process's scheme,
    // the same as a returned one; a Media the list learns about this way has
    // to be as playable as one it fetched.
    emit(message.channel, ...toBrowserUrls(message.args));
  };
};
