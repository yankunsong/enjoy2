import { channels, Namespace, Spec } from "./channels";
import { electronOnly } from "./electron-only";
import { Listener, emit, off, offAll, on } from "./events";
import { invoke } from "./ipc";

/**
 * Builds `window.__ENJOY_APP__`, the object `src/preload.ts` exposes under
 * Electron. The renderer reads it at module scope, so this has to run before
 * anything in `src/renderer` is imported — see `main.ts`.
 */
export const installBridge = () => {
  (window as any).__ENJOY_APP__ = {
    ...build(channels),
    ...electronOnly,
  };
};

const build = (namespace: Namespace): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(namespace).map(([name, value]) => [
      name,
      isSpec(value) ? implement(value) : build(value),
    ])
  );

const isSpec = (value: Spec | Namespace): value is Spec =>
  typeof (value as Spec).kind === "string";

const implement = (spec: Spec) => {
  switch (spec.kind) {
    case "invoke":
      return (...args: unknown[]) => invoke(spec.channel, args);
    case "listen":
      return (listener: Listener) => on(spec.channel, listener);
    case "unlistenOne":
      return (listener: Listener) => off(spec.channel, listener);
    case "unlisten":
      return () => spec.channels.forEach(offAll);
    case "emit":
      return (...args: unknown[]) => emit(spec.channel, ...args);
  }
};
