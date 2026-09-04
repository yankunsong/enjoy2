import pkg from "../../../package.json";
import { Listener, off, offAll, on } from "./events";
import { stage } from "./files";

/**
 * The five namespaces with no browser counterpart: file dialogs, shell calls,
 * the embedded browser view, application lifecycle, and window controls.
 *
 * Each method falls into one of three categories, and nothing falls outside
 * them — in particular nothing is quietly turned into a no-op, because "I
 * clicked it and nothing happened" is the hardest failure to diagnose in a tool
 * you built for yourself:
 *
 * - **Mapped**: the browser has an honest equivalent (opening an external link,
 *   reloading the page) or already knows the answer (this always runs from
 *   source; the only API this distribution has is the local server).
 * - **Subscribed**: `on*`/`remove*Listeners` register against the push bus. They
 *   have to stay callable — the title bar and the sidebar subscribe inside
 *   effects, and an effect that throws takes the whole screen with it — and a
 *   subscription that no one pushes to is a fact about the browser, not a
 *   swallowed call.
 * - **Unavailable**: everything else returns a rejected promise naming the
 *   method, which is how the preload script's own methods report failure.
 */

/** The three categories, as three helpers. */
const subscribe = (channel: string) => (listener: Listener) =>
  on(channel, listener);

const unsubscribeOne = (channel: string) => (listener: Listener) =>
  off(channel, listener);

const unsubscribe = (channel: string) => () => offAll(channel);

/** What `process.platform` would have said, as far as the browser can tell. */
const platform = () => {
  const agent = navigator.userAgent;
  if (agent.includes("Mac")) return "darwin";
  if (agent.includes("Win")) return "win32";
  return "linux";
};

const unavailable = (namespace: string, methods: string[]) =>
  Object.fromEntries(
    methods.map((method) => [
      method,
      () =>
        Promise.reject(
          new Error(
            `EnjoyApp.${namespace}.${method}() is not available in Local Web Enjoy`
          )
        ),
    ])
  );

export const electronOnly = {
  app: {
    ...unavailable("app", [
      "reset",
      "resetSettings",
      "relaunch",
      "quit",
      "checkForUpdates",
      "quitAndInstall",
      "openDevTools",
      "createIssue",
      "diskUsage",
    ]),

    version: pkg.version,
    reload: async () => window.location.reload(),
    // The renderer uses this to decide whether the title bar draws its own
    // window controls, so getting it wrong is visible. The browser knows.
    getPlatformInfo: async () => ({
      platform: platform(),
      arch: undefined as string | undefined,
      version: undefined as string | undefined,
    }),
    // Local Web Enjoy always runs from source; `fake-electron` says the same
    // thing on the other side of the wire.
    isPackaged: async () => false,
    // There is no Hosted Enjoy here. Pointing at our own origin keeps every
    // request the renderer makes on the loopback address.
    apiUrl: async () => window.location.origin,
    wsUrl: async () => window.location.origin.replace(/^http/, "ws"),

    onUpdater: subscribe("app-on-updater"),
    removeUpdaterListeners: unsubscribe("app-on-updater"),
    onCmdOutput: subscribe("app-on-cmd-output"),
    removeCmdOutputListeners: unsubscribe("app-on-cmd-output"),
  },

  window: {
    ...unavailable("window", [
      "isFullScreen",
      "toggleFullscreen",
      "isMaximized",
      "toggleMaximized",
      "maximize",
      "unmaximize",
      "fullscreen",
      "unfullscreen",
      "minimize",
      "close",
    ]),

    onChange: subscribe("window-on-change"),
    removeListener: unsubscribeOne("window-on-change"),
    removeAllListeners: unsubscribe("window-on-change"),
  },

  view: {
    ...unavailable("view", [
      "load",
      "remove",
      "scrape",
      "resize",
      "loadCommunity",
    ]),

    // Not swallowed calls: these two ask for the embedded view to stop covering
    // a dialog, and with no embedded view that is already true. Everything that
    // asks for the view to *do* something is unavailable above.
    show: async (): Promise<void> => undefined,
    hide: async (): Promise<void> => undefined,

    onViewState: subscribe("view-on-state"),
    removeViewStateListeners: unsubscribe("view-on-state"),
  },

  shell: {
    ...unavailable("shell", ["openPath"]),

    openExternal: async (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  },

  dialog: {
    ...unavailable("dialog", [
      "showSaveDialog",
      "showMessageBox",
      "showErrorBox",
    ]),

    showOpenDialog,
  },
};

/**
 * The browser's own file picker, answering in the currency Electron's dialog
 * answers in: paths on the machine running the local server. Picking a file
 * there means sending its bytes across, so that is what this does.
 *
 * Picking a *directory* has no such answer — there is nothing to send, and a
 * path the browser never learns cannot be invented — so it stays unavailable.
 */
async function showOpenDialog(options: Electron.OpenDialogOptions) {
  const { properties = [], filters = [] } = options ?? {};

  if (properties.includes("openDirectory")) {
    throw new Error(
      "EnjoyApp.dialog.showOpenDialog() cannot choose a directory in Local Web Enjoy"
    );
  }

  const input = document.createElement("input");
  input.type = "file";
  input.multiple = properties.includes("multiSelections");

  const extensions = filters
    .flatMap((filter) => filter.extensions ?? [])
    .filter((extension) => extension !== "*");
  if (extensions.length) {
    input.accept = extensions.map((extension) => `.${extension}`).join(",");
  }

  const files = await pick(input);
  // Electron says "cancelled" by answering with nothing; every call site reads
  // it that way.
  if (!files.length) return undefined;

  return Promise.all(files.map(stage));
}

const pick = (input: HTMLInputElement) =>
  new Promise<File[]>((resolve) => {
    const done = () => {
      input.remove();
      resolve(Array.from(input.files ?? []));
    };

    input.addEventListener("change", done, { once: true });
    input.addEventListener("cancel", done, { once: true });

    // Firefox only fires the picker for an input in the document.
    input.style.display = "none";
    document.body.appendChild(input);
    input.click();
  });
