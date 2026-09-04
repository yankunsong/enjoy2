import { push } from "./push";

/**
 * Stands in for `@main/window` under Local Web Enjoy, by build-time module
 * resolution.
 *
 * The real module builds a BrowserWindow and registers every handler; the main
 * process models import it for one reason only — `mainWindow.win.webContents`,
 * the outlet they push `db-on-transaction` through. That outlet is all we need
 * to reproduce, and pulling in the real module would drag Electron's window,
 * menu and auto-updater code into a plain Node process.
 */
const main = {
  win: {
    webContents: {
      send: (channel: string, ...args: unknown[]) => push.send(channel, ...args),
    },
  },
  init: async () => {
    throw new Error("mainWindow.init is not available in Local Web Enjoy");
  },
};

export default main;
