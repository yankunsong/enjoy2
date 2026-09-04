/**
 * The browser end of the main process's push outlets.
 *
 * Desktop Enjoy's renderer subscribes with `ipcRenderer.on(channel, listener)`
 * and the main process pushes progress, notifications and database transactions
 * at it. The local server already funnels both of its push outlets into one
 * sink; carrying that sink across to the browser is a later ticket, so for now
 * these subscriptions are real but the only thing feeding them is `emit` from
 * inside the browser (the lookup and translate widgets talk to themselves that
 * way even under Electron).
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
