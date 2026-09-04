import fs from "fs-extra";
import http from "http";
import path from "path";
import { randomUUID } from "crypto";
import settings from "@main/settings";
import { send } from "./json";

/**
 * Where a file dragged into the browser lands.
 *
 * Every way of importing a Media ends at `Audio.buildFromLocalFile`, which
 * wants a path on this machine. An absolute path typed into the app already is
 * one; a file dragged into the browser is bytes and nothing else, so it is
 * written here first and imported from here.
 *
 * The staged copy is scratch: the model copies or transcodes it into the
 * Library and never looks at it again. It goes under the Library's cache
 * directory, which is also what makes it a local file rather than a temporary
 * one somewhere else on disk, and the directory is emptied at startup.
 */

export const STAGING_ROUTE = "/files/";

export const stagingPath = () => path.join(settings.cachePath(), "staging");

/** Clears what earlier runs staged. Nothing here outlives the import it fed. */
export const clearStaging = async () => {
  await fs.emptyDir(stagingPath());
};

export const stageFile = async (
  pathname: string,
  request: http.IncomingMessage,
  response: http.ServerResponse
) => {
  const name = decodeURIComponent(pathname.slice(STAGING_ROUTE.length));

  // A name is a name, not a path: anything with a separator in it is either a
  // mistake or an attempt to write outside the Library.
  if (!name || path.basename(name) !== name) {
    return send(response, 400, { error: `"${name}" is not a file name` });
  }

  // Its own directory, so that two files of the same name can be staged at once
  // and each keeps the name the imported Media is named after.
  const directory = path.join(stagingPath(), randomUUID());
  const file = path.join(directory, name);

  await fs.ensureDir(directory);
  try {
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(file);
      request.pipe(stream);
      stream.on("finish", () => resolve());
      stream.on("error", reject);
      request.on("error", reject);
    });
  } catch (err) {
    // Half a file is worse than none: it would import as a corrupt Media.
    await fs.remove(directory);
    throw err;
  }

  return send(response, 200, { result: { path: file } });
};

