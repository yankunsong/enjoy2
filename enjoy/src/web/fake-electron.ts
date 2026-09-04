import os from "os";
import path from "path";
import { push } from "./push";

/**
 * Stands in for the `electron` package under Local Web Enjoy, by build-time
 * module resolution.
 *
 * See enjoy/docs/adr/0001-fake-electron-module-for-local-web.md. The contract
 * it establishes: main process code may use `ipcMain`, `app.getPath` and
 * `app.isPackaged`, and nothing else from Electron, or it will fail only when
 * run here.
 */

export type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any;

/**
 * The stand-in for the `event` every handler receives. Handlers reach for
 * `event.sender` to push progress and notifications back at the caller; under
 * Local Web Enjoy every caller is the one browser, so it goes to the same sink
 * as the main window's outlet.
 */
export type IpcMainInvokeEvent = {
  sender: {
    send: (channel: string, ...args: unknown[]) => void;
  };
};

export type IpcMainEvent = IpcMainInvokeEvent;

const handlers = new Map<string, IpcHandler>();

export const ipcMain = {
  handle: (channel: string, handler: IpcHandler) => {
    handlers.set(channel, handler);
  },

  removeHandler: (channel: string) => {
    handlers.delete(channel);
  },

  invoke: async (channel: string, args: unknown[] = []) => {
    const handler = handlers.get(channel);
    if (!handler) {
      throw new ChannelNotFoundError(channel);
    }

    const event: IpcMainInvokeEvent = {
      sender: { send: (name, ...rest) => push.send(name, ...rest) },
    };

    return handler(event, ...args);
  },
};

export class ChannelNotFoundError extends Error {
  constructor(public channel: string) {
    super(`No handler is registered for channel "${channel}"`);
    this.name = "ChannelNotFoundError";
  }
}

const home = os.homedir();

/**
 * The same directory `settings.json` is in, which `local.mjs` settles before
 * any of this is imported. Read from the environment rather than recomputed, so
 * that a run pointed somewhere else — every run under the tests — keeps its
 * whole footprint there instead of scattering half of it into the real home.
 */
const userData =
  process.env.SETTINGS_PATH || path.join(home, ".config", "enjoy-local-web");

const paths: Record<string, string> = {
  home,
  appData: path.dirname(userData),
  userData,
  temp: os.tmpdir(),
  desktop: path.join(home, "Desktop"),
  documents: path.join(home, "Documents"),
  downloads: path.join(home, "Downloads"),
  music: path.join(home, "Music"),
  pictures: path.join(home, "Pictures"),
  videos: path.join(home, "Videos"),
  logs: path.join(userData, "logs"),
};

export const app = {
  // Local Web Enjoy always runs from source, never from an Electron bundle.
  isPackaged: false,

  getPath: (name: string) => {
    const resolved = paths[name];
    if (!resolved) {
      throw new Error(`app.getPath("${name}") is not available in Local Web Enjoy`);
    }
    return resolved;
  },
};

export default { app, ipcMain };
