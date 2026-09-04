/**
 * The single sink for everything the main process pushes at the renderer.
 *
 * Desktop Enjoy pushes through exactly two outlets — the main window's
 * `webContents` and the `sender` of the invoking IPC event — so faking those
 * two lets several dozen push sites in the handlers and models run unchanged.
 * Both outlets funnel here, and `GET /events` carries what arrives across to
 * the browser. With no browser attached the messages go into an empty room,
 * which is the same thing Desktop Enjoy does before its window opens.
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
