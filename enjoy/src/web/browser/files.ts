/**
 * Putting a file the browser holds where the local server can read it.
 *
 * Under Electron a file chosen or dragged in already has a path, because the
 * renderer and the main process share a machine's file system. In the browser
 * it has bytes and a name and nothing else, so importing one means sending the
 * bytes across first. What comes back is a path on the machine running the
 * local server, which is what every import handler takes.
 */
export const stage = async (file: File): Promise<string> => {
  const response = await fetch(`/files/${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: file,
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.error ?? `Could not stage "${file.name}"`);
  }

  return body.result.path;
};

/**
 * The one namespace `src/preload.ts` has no counterpart for. Under Electron the
 * question never comes up — a file dropped on the window arrives with a path
 * already on it — so rather than fake an Electron API that would answer
 * differently here, the bridge offers this and the renderer asks for it only
 * where it knows it is the browser.
 */
export const localFile = { stage };
