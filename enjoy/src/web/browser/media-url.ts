import { walk } from "../traverse";

/**
 * Translates between the two ways a Library file is addressed.
 *
 * The main process hands out `enjoy://library/...`, a scheme Desktop Enjoy
 * registers a protocol handler for and a browser has never heard of. The local
 * server serves the same files under `/media/`. Everything crossing the bridge
 * is rewritten in the direction it is travelling, so the renderer only ever
 * sees addresses it can fetch and the main process only ever sees addresses it
 * can resolve — and neither side has a branch for which host it is running on.
 */

// The whole prefix, not just the scheme: `/media/` on its own is a real
// absolute path on Linux, and the return direction rewrites arguments — which
// include the absolute path a user pastes in to import a Media.
const ENJOY_PREFIX = "enjoy://library/";
const MEDIA_PREFIX = "/media/library/";

/** What comes back from a handler, on its way to the renderer. */
export const toBrowserUrls = <T>(value: T): T =>
  rewrite(value, ENJOY_PREFIX, MEDIA_PREFIX);

/** What the renderer passes to a handler, on its way back to the main process. */
export const toEnjoyUrls = <T>(value: T): T =>
  rewrite(value, MEDIA_PREFIX, ENJOY_PREFIX);

const rewrite = <T>(value: T, from: string, to: string): T => {
  if (typeof value === "string") {
    return (value.startsWith(from) ? to + value.slice(from.length) : value) as T;
  }

  return walk(value, (item) => rewrite(item, from, to));
};
