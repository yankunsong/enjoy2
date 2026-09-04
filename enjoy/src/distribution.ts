/**
 * Which distribution the renderer is running as.
 *
 * The renderer is shared whole between Desktop Enjoy and Local Web Enjoy — see
 * enjoy/docs/adr/0002-reuse-entire-renderer.md — so the pages that need a
 * Hosted Enjoy account are still compiled and still routable. This flag only
 * decides whether to offer them in the sidebar. The frontend dev server in
 * `src/web/start.mjs` is what defines it; the Electron build leaves it unset.
 */
export const isLocalWebEnjoy =
  import.meta.env?.VITE_LOCAL_WEB_ENJOY === "true";
