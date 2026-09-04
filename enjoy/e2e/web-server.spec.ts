import { expect, test } from "@playwright/test";
import { ChildProcess, execFileSync, spawn } from "child_process";
import { createRequire } from "module";
import path from "path";
import fs from "fs-extra";
import http from "http";
import type { AddressInfo } from "net";
import { encodeBinary } from "../src/web/binary";

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

// A long stereo Media, the shape the upload limit is actually hit by. Fifteen
// minutes of it as an uncompressed 16 kHz stereo WAV is far past OpenAI's
// 25 MB; the fixture itself stays small because it ships compressed.
const SAMPLE_LONG_STEREO = path.join(
  process.cwd(),
  "test-results",
  "long-stereo.mp3"
);

const OPENAI_UPLOAD_LIMIT = 25 * 1024 * 1024;

const ffmpegPath = () =>
  createRequire(import.meta.url)("ffmpeg-static") as string;

const buildSampleLongStereo = () => {
  if (fs.existsSync(SAMPLE_LONG_STEREO)) return;

  fs.ensureDirSync(path.dirname(SAMPLE_LONG_STEREO));
  execFileSync(
    ffmpegPath(),
    [
      // prettier-ignore
      "-f", "lavfi", "-i", "sine=frequency=440:duration=900",
      "-ac", "2", "-ar", "44100", "-b:a", "128k",
      "-y", SAMPLE_LONG_STEREO,
    ],
    { stdio: "ignore" }
  );
};

const buildSampleVideo = () => {
  if (fs.existsSync(SAMPLE_VIDEO)) return;

  fs.ensureDirSync(path.dirname(SAMPLE_VIDEO));
  execFileSync(
    ffmpegPath(),
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

/**
 * Where Hosted Enjoy would be, if this distribution had one. The models sync
 * every record they save; `fake-web-api.ts` is what they sync to, and this is
 * how a test can tell the difference between that being true and it merely
 * being written down. Every server the suite starts is pointed here.
 */
let hostedEnjoy: http.Server;
let hostedEnjoyUrl: string;
const hostedEnjoyRequests: string[] = [];

const startHostedEnjoy = () =>
  new Promise<void>((resolve) => {
    hostedEnjoy = http.createServer((request, response) => {
      hostedEnjoyRequests.push(`${request.method} ${request.url}`);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });
    hostedEnjoy.listen(0, "127.0.0.1", () => {
      const { port } = hostedEnjoy.address() as AddressInfo;
      hostedEnjoyUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

const startServer = (settingsPath: string) =>
  new Promise<{ child: ChildProcess; url: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["src/web/local.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SETTINGS_PATH: settingsPath,
        LIBRARY_PATH: settingsPath,
        ENJOY_WEB_PORT: "0",
        WEB_API_URL: hostedEnjoyUrl,
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
  buildSampleLongStereo();
  await startHostedEnjoy();

  const started = await startServer(resultDir);
  server = started.child;
  baseUrl = started.url;
});

test.afterAll(async () => {
  server?.kill();
  hostedEnjoy?.close();
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

/**
 * Pushing at the renderer. The main process has two push outlets — the main
 * window and the sender of the invoking call — and both of them come out here,
 * so the browser can be told a Media appeared without having asked.
 */

// The second shipped audio sample. Importing deduplicates by content, so the
// one the tests above imported cannot be imported again here.
const SECOND_SAMPLE_AUDIO = path.join(process.cwd(), "samples", "jfk.wav");

// Duplicated from src/web/push.ts for the same reason as the constants above:
// this file runs outside the app's module resolution.
type PushMessage = { channel: string; args: any[] };

const openEvents = async () => {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/events`, {
    signal: controller.signal,
  });
  const messages: PushMessage[] = [];

  // Reading the stream is the subscription; it outlives the call, and ends
  // when the abort below tears the connection down.
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for await (const chunk of response.body as any) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const data = event
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (data) messages.push(JSON.parse(data.slice("data:".length)));
        }
      }
    } catch {
      // Aborting mid-read is how this ends; it is not a failure.
    }
  })();

  return {
    response,
    messages,
    close: () => controller.abort(),
    waitFor: async (channel: string) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        const message = messages.find((item) => item.channel === channel);
        if (message) return message;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(
        `Nothing arrived on "${channel}"; got ${JSON.stringify(messages.map((m) => m.channel))}`
      );
    },
  };
};

test("streams what the models push at the main window", async () => {
  const events = await openEvents();

  try {
    expect(events.response.status).toBe(200);
    expect(events.response.headers.get("content-type")).toContain(
      "text/event-stream"
    );

    const created = await ipc("audios-create", SECOND_SAMPLE_AUDIO, {
      compressing: false,
    });
    expect(created.status).toBe(200);

    const message = await events.waitFor("db-on-transaction");
    expect(message.args[0]).toMatchObject({
      model: "Audio",
      action: "create",
      id: created.body.result.id,
    });
  } finally {
    events.close();
  }
});

test("streams what a handler pushes at its caller", async () => {
  const events = await openEvents();

  try {
    // A handler reports its own failures by pushing a notification and
    // returning nothing, so the call succeeding is part of the shape.
    const { status } = await ipc("conversations-find-all", {
      where: { noSuchColumn: "boom" },
    });
    expect(status).toBe(200);

    const message = await events.waitFor("on-notification");
    expect(message.args[0]).toMatchObject({ type: "error" });
  } finally {
    events.close();
  }
});

/**
 * The reconnect a browser makes for itself is `EventSource`'s, which no test
 * on this seam can drive; what is checked here is the half that could actually
 * be broken on this side — that a stream torn down leaves the server able to
 * carry the next one.
 */
test("keeps pushing to a subscriber that reconnected", async () => {
  const dropped = await openEvents();
  dropped.close();

  const events = await openEvents();
  try {
    const { body } = await ipc("audios-find-all", {});
    await ipc("audios-update", body.result[0].id, { name: "Renamed" });

    const message = await events.waitFor("db-on-transaction");
    expect(message.args[0]).toMatchObject({ model: "Audio", action: "update" });
  } finally {
    events.close();
  }
});

/**
 * Transcoding for Transcription. Two products come out of one Media and both
 * are needed: the WAV Alignment reads the signal of, and the compressed copy
 * Transcription uploads.
 */

const libraryFile = (enjoyUrl: string) =>
  path.join(
    resultDir,
    LIBRARY_PATH_SUFFIX,
    enjoyUrl.replace("enjoy://library/", "")
  );

test("compresses a long Media small enough to upload, leaving the WAV alone", async () => {
  test.setTimeout(300000);

  const wavUrl = (await ipc("echogarden-transcode", SAMPLE_LONG_STEREO)).body
    .result;
  const wav = libraryFile(wavUrl);
  const before = fs.statSync(wav);

  // The reason the compressed copy exists at all: fifteen minutes of stereo
  // comes out of here already past the limit.
  expect(before.size).toBeGreaterThan(OPENAI_UPLOAD_LIMIT);

  const { status, body } = await ipc("ffmpeg-compress-for-upload", wavUrl);
  expect(status).toBe(200);

  const copy = libraryFile(body.result);
  expect(fs.statSync(copy).size).toBeLessThan(OPENAI_UPLOAD_LIMIT);

  // Alignment still has the signal it was given; the copy is a second product,
  // not a replacement.
  expect(fs.statSync(wav)).toMatchObject({
    size: before.size,
    mtimeMs: before.mtimeMs,
  });
});

test("serves the upload copy under a type that matches its bytes", async () => {
  test.setTimeout(300000);

  const { body } = await ipc("ffmpeg-compress-for-upload", SAMPLE_LONG_STEREO);

  // The renderer names the upload from this address, so a lie here is a lie in
  // the request OpenAI rejects.
  expect(body.result).toMatch(/\.ogg$/);
  const served = await fetch(
    `${baseUrl}/media/${body.result.replace("enjoy://", "")}`
  );
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toBe("audio/ogg");
});

/**
 * Shadowing: looping a sentence, recording against it, and finding all of it
 * again tomorrow.
 *
 * Two runs of bytes cross the seam on this path and neither is a file — the
 * recording the browser holds, and the audio Alignment reads to make the
 * Timeline the sentences are drawn from. Both travel inside the argument list,
 * which is JSON.
 */

// What the microphone produced, as far as this seam can tell. The shipped
// sample stands in for it, and the second one for a later take.
const RECORDED_BYTES = SECOND_SAMPLE_AUDIO;
const SECOND_TAKE = SAMPLE_AUDIO;

const createRecording = (file: string, type: string, referenceId: number) =>
  ipc("recordings-create", {
    targetId: importedAudioId,
    targetType: "Audio",
    referenceId,
    referenceText: "Ask not what your country can do for you",
    // Encoded by the browser bridge's own encoder, so the wire form this is
    // asserted against is the one that ships rather than a copy of it.
    blob: {
      type,
      arrayBuffer: encodeBinary(toArrayBuffer(fs.readFileSync(file))),
    },
  });

const toArrayBuffer = (bytes: Buffer) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

/**
 * Every directory in the Library that holds Recordings. A Recording goes under
 * the local user's own directory, so a second one of these means a second user
 * id — the failure this ticket exists to catch, and the one that looks like the
 * recordings simply vanished.
 */
const recordingDirectories = () => {
  const library = path.join(resultDir, LIBRARY_PATH_SUFFIX);

  return fs
    .readdirSync(library)
    .map((entry) => path.join(library, entry, "recordings"))
    .filter((directory) => fs.existsSync(directory));
};

let firstRecordingId: string;

test("aligns the audio the browser hands it, which is what a Timeline is", async () => {
  test.setTimeout(180000);

  // Alignment takes a `Uint8Array`, not an `ArrayBuffer`, and JSON renders one
  // as an object of numbered keys — so this is the same crossing as a
  // recording's, and the same failure if the kind is not carried across.
  const { status, body } = await ipc(
    "echogarden-align",
    encodeBinary(new Uint8Array(fs.readFileSync(RECORDED_BYTES))),
    "And so my fellow Americans ask not what your country can do for you ask what you can do for your country",
    { engine: "dtw", language: "en" }
  );

  expect(status).toBe(200);
  // A Timeline is what the sentences a person clicks are drawn from; an empty
  // one is a player with nothing to loop.
  expect(body.result.timeline.length).toBeGreaterThan(0);

  // Where the renderer puts it, and so where the restart below looks for it.
  const transcription = (
    await ipc("transcriptions-find-or-create", {
      targetId: importedAudioId,
      targetType: "Audio",
    })
  ).body.result;

  const updated = await ipc("transcriptions-update", transcription.id, {
    result: { timeline: body.result.timeline },
    engine: "echogarden",
    model: "dtw",
    state: "finished",
    language: "en",
  });
  expect(updated.status).toBe(200);
});

test("saves a Recording made of the bytes the browser holds", async () => {
  const { status, body } = await createRecording(RECORDED_BYTES, "audio/wav", 0);

  expect(status).toBe(200);
  expect(body.result.src).toMatch(/^enjoy:\/\/library\/recordings\//);
  expect(body.result.duration).toBeGreaterThan(0);
  firstRecordingId = body.result.id;

  // The waveform a Recording is compared against the original by is drawn from
  // the file the player fetches, so being addressable is the whole of it.
  const played = await fetch(
    `${baseUrl}/media/${body.result.src.replace("enjoy://", "")}`,
    { headers: { Range: "bytes=0-99" } }
  );
  expect(played.status).toBe(206);
});

test("says what went wrong when the bytes hold no sound", async () => {
  const { status, body } = await ipc("recordings-create", {
    targetId: importedAudioId,
    targetType: "Audio",
    referenceId: 1,
    referenceText: "silence",
    blob: { type: "audio/wav", arrayBuffer: encodeBinary(new ArrayBuffer(0)) },
  });

  // Bytes that arrived as nothing at all fail here too, but on a dereference.
  // This is the message the recorder can act on.
  expect(status).toBe(500);
  expect(body.error).toContain("Cannot detect any sound");
});

test("still has the Recording after a restart, and puts the next one beside it", async () => {
  server.kill();
  const restarted = await startServer(resultDir);
  server = restarted.child;
  baseUrl = restarted.url;

  const { body } = await ipc("recordings-find-all", {
    where: { targetId: importedAudioId, targetType: "Audio" },
  });
  const kept = body.result.find(
    (recording: any) => recording.id === firstRecordingId
  );
  expect(kept).toBeDefined();

  const after = await createRecording(SECOND_TAKE, "audio/mpeg", 2);
  expect(after.status).toBe(200);

  // One directory, holding both: the local user id survived the restart, and
  // with it the Library path and the salt of every Recording's own id.
  const directories = recordingDirectories();
  expect(directories).toHaveLength(1);
  expect(fs.readdirSync(directories[0])).toEqual(
    expect.arrayContaining(
      [kept.src, after.body.result.src].map((src: string) => path.basename(src))
    )
  );
});

test("kept the Timeline across that restart too, which is what there is to click", async () => {
  const { status, body } = await ipc("transcriptions-find-or-create", {
    targetId: importedAudioId,
    targetType: "Audio",
  });

  expect(status).toBe(200);
  expect(body.result.result.timeline.length).toBeGreaterThan(0);
});

test("reached Hosted Enjoy at no point along the way", async () => {
  // The models sync every record they save, and a Recording is no exception.
  // What they sync to is the stand-in, which makes no request at all — so the
  // Hosted Enjoy address this server was started with has never been called,
  // through every import, transcode, recording and restart above.
  expect(hostedEnjoyRequests).toEqual([]);
});
