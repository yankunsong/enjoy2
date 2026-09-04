/**
 * The single sink for everything the main process pushes at the renderer.
 *
 * Desktop Enjoy pushes through exactly two outlets — the main window's
 * `webContents` and the `sender` of the invoking IPC event — so faking those
 * two lets several dozen push sites in the handlers and models run unchanged.
 * Both outlets funnel here. Nothing subscribes yet — the browser gets these
 * over SSE in a later ticket — so for now messages are pushed into an empty
 * room, which is at least an observable one.
 */

export type PushMessage = { channel: string; args: unknown[] };
export type PushListener = (message: PushMessage) => void;

const listeners = new Set<PushListener>();

export const push = {
  send: (channel: string, ...args: unknown[]) => {
    for (const listener of listeners) listener({ channel, args });
  },

  subscribe: (listener: PushListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
