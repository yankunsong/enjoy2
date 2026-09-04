import fs from "fs-extra";
import http from "http";
import path from "path";
import settings from "@main/settings";

/**
 * Serves Library files over HTTP, the way Desktop Enjoy serves them through its
 * `enjoy://` protocol handler. Media files are most of what comes out of here,
 * but so are waveforms and cached objects, so the route is the Library.
 *
 * The split is the same one `src/main.ts` makes: the models' own files live
 * under the user's data directory, everything else directly under the Library.
 * What follows the route is exactly what follows `enjoy://`, so a Media URL
 * crosses over by swapping its scheme for this prefix.
 */

const USER_DATA_DIRECTORIES =
  /^library\/(audios|videos|recordings|speeches|segments|documents)\//;

/**
 * The route name comes from the parent issue, which specifies `GET /media/*`;
 * the files behind it are the Library's, which is what this module resolves.
 */
export const MEDIA_ROUTE = "/media/";

export const serveLibraryFile = async (
  pathname: string,
  request: http.IncomingMessage,
  response: http.ServerResponse
) => {
  const file = resolve(decodeURIComponent(pathname).slice(MEDIA_ROUTE.length));

  if (!file || !(await fs.pathExists(file))) {
    response.writeHead(404, { "Content-Type": "application/json" });
    return response.end(
      JSON.stringify({ error: `No file in the Library at ${pathname}` })
    );
  }

  const { size } = await fs.stat(file);
  const range = parseRange(request.headers.range, size);

  // Media elements seek by asking for a byte range; answering the whole file
  // regardless would make the shadowing loop re-download on every jump.
  if (range) {
    response.writeHead(206, {
      "Content-Type": "application/octet-stream",
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": range.end - range.start + 1,
    });
    return fs.createReadStream(file, range).pipe(response);
  }

  response.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Content-Length": size,
  });
  return fs.createReadStream(file).pipe(response);
};

/** Returns null for anything that would escape the Library. */
const resolve = (url: string) => {
  const root = url.match(USER_DATA_DIRECTORIES)
    ? settings.userDataPath()
    : settings.libraryPath();
  if (!root) return null;

  const file = path.resolve(root, url.replace(/^library\//, ""));

  return file.startsWith(path.resolve(root) + path.sep) ? file : null;
};

const parseRange = (header: string | undefined, size: number) => {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  const start = rawStart ? Number(rawStart) : 0;
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;

  return start <= end && start < size ? { start, end } : null;
};
