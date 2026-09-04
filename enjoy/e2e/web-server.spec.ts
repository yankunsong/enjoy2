import { expect, test } from "@playwright/test";
import { ChildProcess, execFileSync, spawn } from "child_process";
import { createRequire } from "module";
import path from "path";
import fs from "fs-extra";

// Duplicated from src/constants rather than imported: importing that module
// pulls in a JSON asset the plain Node test runner cannot load, and the test is
// asserting the on-disk layout a user would see, not the app's own constants.
const LIBRARY_PATH_SUFFIX = "EnjoyLibrary";

// Duplicated for the same reason, from src/web/staging.ts.
const STAGING_ROUTE = "/files/";

const SAMPLE_AUDIO = path.join(process.cwd(), "samples", "speech.mp3");

// The repository ships audio samples but no video one, and importing a video
// takes a different branch of the model, so the suite makes its own.
const SAMPLE_VIDEO = path.join(process.cwd(), "test-results", "sample.mp4");

const stagingDir = () =>
  path.join(resultDir, LIBRARY_PATH_SUFFIX, "cache", "staging");

const buildSampleVideo = () => {
  if (fs.existsSync(SAMPLE_VIDEO)) return;

  fs.ensureDirSync(path.dirname(SAMPLE_VIDEO));
  const ffmpeg = createRequire(import.meta.url)("ffmpeg-static") as string;
  execFileSync(
    ffmpeg,
    [
      // prettier-ignore
      "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-shortest", "-y", SAMPLE_VIDEO,
    ],
    { stdio: "ignore" }
  );
};

/**
 * The one seam for Local Web Enjoy: the local server's HTTP surface.
 *
 * These tests drive a plain Node process — no Electron, no browser, no build —
 * with the settings and Library directories pointed at a temp directory, the
 * same trick the Electron e2e specs use.
 */

const resultDir = path.join(process.cwd(), "test-results", "web-server");

let server: ChildProcess;
let baseUrl: string;

const startServer = (settingsPath: string) =>
  new Promise<{ child: ChildProcess; url: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["src/web/local.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SETTINGS_PATH: settingsPath,
        LIBRARY_PATH: settingsPath,
        ENJOY_WEB_PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/listening on (http:\/\/[^\s]+)/);
      if (match) resolve({ child, url: match[1] });
    });

    child.once("exit", (code) =>
      reject(new Error(`Server exited with ${code}\n${stderr}`))
    );
  });

const ipc = async (channel: string, ...args: any[]) => {
  const response = await fetch(`${baseUrl}/ipc/${channel}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: response.status, body: await response.json() };
};

test.beforeAll(async () => {
  test.setTimeout(120000);
  fs.removeSync(resultDir);
  fs.ensureDirSync(resultDir);
  buildSampleVideo();

  const started = await startServer(resultDir);
  server = started.child;
  baseUrl = started.url;
});

test.afterAll(async () => {
  server?.kill();
});

test("runs in a plain Node process, without Electron", async () => {
  const response = await fetch(`${baseUrl}/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ electron: false });
});

test("starts on a fresh environment, where no profile record exists yet", async () => {
  // The profile record lives in the database, so the very first connection of a
  // fresh environment is always made without one — the state known to throw.
  // A second server on its own untouched directory reaches "listening" only if
  // that connection went through.
  const fresh = path.join(resultDir, "..", "web-server-cold-start");
  fs.removeSync(fresh);

  const started = await startServer(fresh);
  try {
    expect(started.url).toContain("http://127.0.0.1:");
  } finally {
    started.child.kill();
  }
});

test("connects the database over the channel", async () => {
  const { status, body } = await ipc("db-connect");

  expect(status).toBe(200);
  expect(body.result).toMatchObject({ state: "connected", error: null });
});

test("creates the Library database under the seeded user id", async () => {
  const userId = (await ipc("app-settings-get-user")).body.result.id;
  // Eight digits, or the Library directory is not recognised as a session.
  expect(String(userId)).toMatch(/^\d{8}$/);

  const { body } = await ipc("db-connect");

  expect(path.dirname(body.result.path)).toBe(
    path.join(resultDir, LIBRARY_PATH_SUFFIX, String(userId))
  );
  expect(fs.existsSync(body.result.path)).toBe(true);
});

test("seeds the profile record the renderer reads back", async () => {
  const userId = (await ipc("app-settings-get-user")).body.result.id;
  const { body } = await ipc("user-settings-get", "profile");

  expect(body.result).toMatchObject({ id: userId });
});

test("serves a Library file, and the byte range a player asks for", async () => {
  // The route the frontend proxies media through. The Library is empty at this
  // point in the feature, so the fixture is written straight into it.
  const library = path.join(resultDir, LIBRARY_PATH_SUFFIX);
  fs.outputFileSync(path.join(library, "cache", "range.txt"), "0123456789");

  const whole = await fetch(`${baseUrl}/media/library/cache/range.txt`);
  expect(whole.status).toBe(200);
  expect(await whole.text()).toBe("0123456789");

  const part = await fetch(`${baseUrl}/media/library/cache/range.txt`, {
    headers: { Range: "bytes=2-5" },
  });
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(await part.text()).toBe("2345");
});

test("names the file when the Library has nothing at that path", async () => {
  const response = await fetch(`${baseUrl}/media/library/cache/absent.txt`);

  expect(response.status).toBe(404);
  expect((await response.json()).error).toContain("absent.txt");
});

test("names the channel when no handler is registered for it", async () => {
  const { status, body } = await ipc("no-such-channel");

  expect(status).toBe(404);
  expect(body.error).toContain("no-such-channel");
});

/**
 * Importing a Media. The browser holds bytes, not a path, so a dropped file is
 * staged on this machine first and then imported through the same handler an
 * absolute path goes through.
 */

let importedAudioId: string;

const stage = async (file: string) => {
  const response = await fetch(
    `${baseUrl}${STAGING_ROUTE}${encodeURIComponent(path.basename(file))}`,
    { method: "POST", body: fs.readFileSync(file) }
  );
  return { status: response.status, body: await response.json() };
};

test("stages a dropped file where the main process can read it", async () => {
  const { status, body } = await stage(SAMPLE_AUDIO);

  expect(status).toBe(200);
  expect(fs.readFileSync(body.result.path)).toEqual(
    fs.readFileSync(SAMPLE_AUDIO)
  );
});

test("refuses a staged name that would escape the staging directory", async () => {
  const response = await fetch(
    `${baseUrl}${STAGING_ROUTE}${encodeURIComponent("../escaped.mp3")}`,
    { method: "POST", body: "nope" }
  );

  expect(response.status).toBe(400);
});

test("imports a Media from a staged file, and serves it back playable", async () => {
  const staged = (await stage(SAMPLE_AUDIO)).body.result.path;

  const created = await ipc("audios-create", staged, { compressing: false });
  expect(created.status).toBe(200);
  expect(created.body.result.src).toMatch(/^enjoy:\/\/library\/audios\//);
  importedAudioId = created.body.result.id;

  // The browser bridge swaps the scheme for the media route; this is what it
  // swaps it for.
  const url = `${baseUrl}/media/${created.body.result.src.replace("enjoy://", "")}`;
  const whole = await fetch(url);
  expect(whole.status).toBe(200);
  // A player picks its provider from the type, so octet-stream would leave the
  // Media unplayable however correct the bytes are.
  expect(whole.headers.get("content-type")).toBe("audio/mpeg");

  const part = await fetch(url, { headers: { Range: "bytes=0-99" } });
  expect(part.status).toBe(206);
  expect((await part.arrayBuffer()).byteLength).toBe(100);
});

test("imports a Media from an absolute path, with nothing staged", async () => {
  const before = fs.readdirSync(stagingDir()).length;

  const { status, body } = await ipc("videos-create", SAMPLE_VIDEO, {
    compressing: false,
  });

  expect(status).toBe(200);
  expect(body.result.src).toMatch(/^enjoy:\/\/library\/videos\//);
  expect(fs.readdirSync(stagingDir()).length).toBe(before);
});

test("still has the imported Media after a restart, and still plays it", async () => {
  server.kill();
  const restarted = await startServer(resultDir);
  server = restarted.child;
  baseUrl = restarted.url;

  const { body } = await ipc("audios-find-all", {});
  const imported = body.result.find((audio: any) => audio.id === importedAudioId);
  expect(imported).toBeDefined();

  const played = await fetch(
    `${baseUrl}/media/${imported.src.replace("enjoy://", "")}`,
    { headers: { Range: "bytes=0-99" } }
  );
  expect(played.status).toBe(206);

  // Nothing staged outlives the restart; the import copied what it needed.
  expect(fs.readdirSync(stagingDir())).toEqual([]);
});
