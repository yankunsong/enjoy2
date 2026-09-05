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

/**
 * The stand-in for yt-dlp, and the directory the suite talks to it through.
 * See e2e/fixtures/yt-dlp-stub.mjs.
 */
const YT_DLP_STUB = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "yt-dlp-stub.mjs"
);
const YT_DLP_DIR = path.join(process.cwd(), "test-results", "yt-dlp");

// What the stub hands back as the downloaded video. Importing deduplicates by
// content, so it has to be a different video from the one imported by path.
const SAMPLE_YOUTUBE_VIDEO = path.join(YT_DLP_DIR, "youtube.mp4");

const ytDlpControl = (control: { failWith?: string }) =>
  fs.outputJSONSync(path.join(YT_DLP_DIR, "control.json"), control);

const ytDlpArgv = (): string[] =>
  fs.readJSONSync(path.join(YT_DLP_DIR, "argv.json"));

// What a Diary's Speech is made of. Neither shipped sample can stand in: both
// are imported as Media by the tests above, and importing deduplicates by
// content, so a Speech made of those bytes would find somebody else's Media
// rather than make its own.
const SAMPLE_SPEECH_AUDIO = path.join(
  process.cwd(),
  "test-results",
  "diary-speech.mp3"
);

// The two Speeches of the Diary that gets deleted — an earlier draft and what
// it was rewritten into — each needing bytes of its own for the same reason.
// Two because regenerating is additive: a Diary that has been edited owns every
// Speech it ever spoke, and deleting it has to take all of them.
const SAMPLE_DOOMED_SPEECH_AUDIO = path.join(
  process.cwd(),
  "test-results",
  "doomed-diary-speech.mp3"
);

const SAMPLE_DOOMED_DRAFT_AUDIO = path.join(
  process.cwd(),
  "test-results",
  "doomed-diary-draft.mp3"
);

// The two voices one Diary is spoken in, before and after the voice is changed
// in its settings. Two files because a different voice is different audio —
// that is the whole reason for changing it — and the Speech that survives has
// to be the one made of the second lot of bytes.
const SAMPLE_FIRST_VOICE_AUDIO = path.join(
  process.cwd(),
  "test-results",
  "first-voice-diary-speech.mp3"
);

const SAMPLE_SECOND_VOICE_AUDIO = path.join(
  process.cwd(),
  "test-results",
  "second-voice-diary-speech.mp3"
);

// What two Diaries writing the same sentence are both spoken with, since that
// is exactly what the synthesis service would hand back to each of them.
const SAMPLE_SHARED_AUDIO = path.join(
  process.cwd(),
  "test-results",
  "shared-diary-speech.mp3"
);

// What the ChatMessage of a leaving member is spoken with. Its own bytes for
// the same reason: the file goes only when the last Speech naming it does, so
// audio shared with another test's Speech would outlive this one's.
const SAMPLE_CHAT_SPEECH_AUDIO = path.join(
  process.cwd(),
  "test-results",
  "chat-message-speech.mp3"
);

// A Document that says what the Diaries above say, for the half of the rule
// that crosses kinds. Plain text, because importing one is a copy into the
// Library rather than a parse.
const SAMPLE_SHARED_DOCUMENT = path.join(
  process.cwd(),
  "test-results",
  "shared-document.txt"
);

// The Recording made against the Media that Speech becomes. A Recording
// deduplicates by content too, and globally rather than per Media, so bytes
// another test already recorded would hand this one that test's Recording
// instead of making a new one.
const SAMPLE_DIARY_RECORDING = path.join(
  process.cwd(),
  "test-results",
  "diary-recording.mp3"
);

// The Recording a learner made against a chat message, needing bytes of its own
// for the same reason as the one above.
const SAMPLE_CHAT_RECORDING = path.join(
  process.cwd(),
  "test-results",
  "chat-recording.mp3"
);

// The pair of files hanging off the chat that gets deleted whole: what one
// agent's message was spoken with, and what the learner recorded against their
// own message in the same chat. Bytes of their own, for the same two reasons —
// a Speech's file goes only when the last Speech naming it does, and recording
// deduplicates by content globally rather than per message.
const SAMPLE_DOOMED_CHAT_SPEECH = path.join(
  process.cwd(),
  "test-results",
  "doomed-chat-speech.mp3"
);

const SAMPLE_DOOMED_CHAT_RECORDING = path.join(
  process.cwd(),
  "test-results",
  "doomed-chat-recording.mp3"
);

// The same pair again, for the chat the deleted ChatAgent is a member of. The
// ChatAgent path deletes down hooks of its own, so it needs a chat of its own
// to delete from, and files of its own for the same two reasons.
const SAMPLE_AGENT_CHAT_SPEECH = path.join(
  process.cwd(),
  "test-results",
  "agent-chat-speech.mp3"
);

const SAMPLE_AGENT_CHAT_RECORDING = path.join(
  process.cwd(),
  "test-results",
  "agent-chat-recording.mp3"
);

// The Media deleted to check the same rule on the Video path, and the Recording
// made against it. Both need content of their own, for the same two reasons:
// importing a Media deduplicates by content, and so does recording.
const SAMPLE_DOOMED_VIDEO = path.join(
  process.cwd(),
  "test-results",
  "doomed-video.mp4"
);

const SAMPLE_VIDEO_RECORDING = path.join(
  process.cwd(),
  "test-results",
  "video-recording.mp3"
);

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

const buildAudio = (output: string, duration: number) => {
  if (fs.existsSync(output)) return;

  fs.ensureDirSync(path.dirname(output));
  execFileSync(
    ffmpegPath(),
    [
      // prettier-ignore
      "-f", "lavfi", "-i", `sine=frequency=660:duration=${duration}`,
      "-y", output,
    ],
    { stdio: "ignore" }
  );
};

const buildVideo = (output: string, duration: number) => {
  if (fs.existsSync(output)) return;

  fs.ensureDirSync(path.dirname(output));
  execFileSync(
    ffmpegPath(),
    [
      // prettier-ignore
      "-f", "lavfi", "-i", `testsrc=duration=${duration}:size=64x64:rate=10`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${duration}`,
      "-shortest", "-y", output,
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

const BLANK_CREDENTIALS = {
  OPENAI_API_KEY: "",
  OPENAI_BASE_URL: "",
  AZURE_SPEECH_KEY: "",
  AZURE_SPEECH_REGION: "",
  ELEVENLABS_API_KEY: "",
};

/**
 * @param settingsPath where to keep `settings.json` and the Library, or
 *   `undefined` to leave both unset and let the server decide, which is what
 *   the documented one command does.
 */
const startServer = (
  settingsPath: string | undefined,
  extraEnv: Record<string, string> = {}
) =>
  new Promise<{ child: ChildProcess; url: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["src/web/local.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(settingsPath
          ? { SETTINGS_PATH: settingsPath, LIBRARY_PATH: settingsPath }
          : { SETTINGS_PATH: undefined, LIBRARY_PATH: undefined }),
        ENJOY_WEB_PORT: "0",
        ENJOY_YT_DLP_PATH: YT_DLP_STUB,
        YT_DLP_STUB_DIR: YT_DLP_DIR,
        WEB_API_URL: hostedEnjoyUrl,
        // The suite owns the whole credential environment, so that the real
        // `.env` beside the workspace — which the server now reads, and which
        // on a developer's machine holds real keys — cannot reach a test.
        // `process.loadEnvFile` fills gaps only, and an empty string is not a
        // gap, so naming them here is what keeps the file out.
        ...BLANK_CREDENTIALS,
        ...extraEnv,
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

/**
 * A restart, which is what the durability tests are made of: the same Library
 * on disk, reopened by a process that remembers nothing.
 */
const restartServer = async () => {
  server.kill();
  const restarted = await startServer(resultDir);
  server = restarted.child;
  baseUrl = restarted.url;
};

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
  buildVideo(SAMPLE_VIDEO, 1);
  buildVideo(SAMPLE_YOUTUBE_VIDEO, 2);
  buildAudio(SAMPLE_SPEECH_AUDIO, 3);
  buildAudio(SAMPLE_DOOMED_SPEECH_AUDIO, 4);
  buildAudio(SAMPLE_DOOMED_DRAFT_AUDIO, 5);
  buildAudio(SAMPLE_SHARED_AUDIO, 6);
  buildAudio(SAMPLE_FIRST_VOICE_AUDIO, 14);
  buildAudio(SAMPLE_SECOND_VOICE_AUDIO, 15);
  buildAudio(SAMPLE_CHAT_SPEECH_AUDIO, 7);
  fs.outputFileSync(SAMPLE_SHARED_DOCUMENT, `${SHARED_TEXT}\n`);
  buildAudio(SAMPLE_DIARY_RECORDING, 2);
  buildAudio(SAMPLE_CHAT_RECORDING, 8);
  buildAudio(SAMPLE_DOOMED_CHAT_SPEECH, 10);
  buildAudio(SAMPLE_DOOMED_CHAT_RECORDING, 11);
  buildAudio(SAMPLE_AGENT_CHAT_SPEECH, 12);
  buildAudio(SAMPLE_AGENT_CHAT_RECORDING, 13);
  buildVideo(SAMPLE_DOOMED_VIDEO, 3);
  buildAudio(SAMPLE_VIDEO_RECORDING, 9);
  buildSampleLongStereo();
  ytDlpControl({});
  await startHostedEnjoy();

  const started = await startServer(resultDir);
  server = started.child;
  baseUrl = started.url;
});

test.afterAll(async () => {
  server?.kill();
  hostedEnjoy?.close();
});

/**
 * The documented one command, whose environment is empty.
 *
 * Every other server the suite starts is handed `SETTINGS_PATH`, which is what
 * `@main/settings` passes to `electron-settings` as the directory to keep
 * `settings.json` in. With nothing passed, `electron-settings` goes looking for
 * the directory itself, by asking the `electron` package for the application —
 * and it is a dependency resolved outside the alias, so what answers is the
 * real one rather than `fake-electron.ts`, which has no application to give.
 *
 * So the suite has to start one server the way the README says to, with a home
 * directory of its own to keep it out of the real one.
 */
test("starts with nothing in its environment, the way the README says to", async () => {
  const home = path.join(resultDir, "home");
  fs.ensureDirSync(home);

  const { child, url } = await startServer(undefined, {
    HOME: home,
    USERPROFILE: home,
  });

  try {
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);

    // Where it decided to keep them, which is the decision under test.
    expect(fs.existsSync(path.join(home, ".config", "enjoy-local-web"))).toBe(
      true
    );
  } finally {
    child.kill();
  }
});

/**
 * Credentials out of the environment, which is what a `.env` file becomes.
 *
 * They are read once at startup and written into the same user settings the
 * preference boxes write, so everything downstream — the OpenAI client,
 * Assessment's Azure config, ElevenLabs — reads them from where it always did
 * and none of it knows an environment variable was involved.
 */
test("takes the keys out of its environment and stores them where the app looks", async () => {
  const home = path.join(resultDir, "env-home");
  fs.ensureDirSync(home);

  const { child, url } = await startServer(path.join(home, "library"), {
    OPENAI_API_KEY: "sk-from-the-env-file",
    AZURE_SPEECH_KEY: "azure-from-the-env-file",
    AZURE_SPEECH_REGION: "eastus",
    ELEVENLABS_API_KEY: "eleven-from-the-env-file",
  });

  const get = async (key: string) => {
    const response = await fetch(`${url}/ipc/user-settings-get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([key]),
    });
    return (await response.json()).result;
  };

  try {
    expect(await get("openai")).toMatchObject({ key: "sk-from-the-env-file" });
    expect(await get("azure_speech")).toMatchObject({
      key: "azure-from-the-env-file",
      region: "eastus",
    });
    expect(await get("elevenlabs")).toMatchObject({
      key: "eleven-from-the-env-file",
    });
  } finally {
    child.kill();
  }
});

/**
 * A key the environment does not mention is not a key the environment says to
 * erase. Someone who typed one into the preference boxes and then set only
 * `OPENAI_API_KEY` should keep the other two.
 */
test("leaves a stored key alone when the environment says nothing about it", async () => {
  const library = path.join(resultDir, "env-partial");
  fs.ensureDirSync(library);

  const set = async (url: string, key: string, value: unknown) =>
    fetch(`${url}/ipc/user-settings-set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([key, value]),
    });

  const first = await startServer(library, {
    OPENAI_API_KEY: "sk-first-run",
  });
  await set(first.url, "elevenlabs", { key: "typed-into-the-box" });
  first.child.kill();

  const second = await startServer(library, {
    OPENAI_API_KEY: "sk-second-run",
  });

  try {
    const response = await fetch(`${second.url}/ipc/user-settings-get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["elevenlabs"]),
    });
    expect((await response.json()).result).toMatchObject({
      key: "typed-into-the-box",
    });
  } finally {
    second.child.kill();
  }
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
  await restartServer();

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
 * Importing from YouTube. The link is fetched by yt-dlp, an external
 * downloader that keeps up with YouTube because keeping up with YouTube is the
 * whole of what it does; what is asserted here is our half of that
 * arrangement, driven through the stand-in described in
 * e2e/fixtures/yt-dlp-stub.mjs.
 */

const YOUTUBE_URL = "https://www.youtube.com/watch?v=rFejpH_tAHM";

const percentages = (messages: PushMessage[]) =>
  messages
    .filter((message) => message.channel === "download-on-state")
    .map((message) => message.args[0])
    .filter((state) => state.state === "progressing")
    .map((state) => Math.round((state.received / state.total) * 100));

test("fetches a YouTube link at 720p, and imports what came down", async () => {
  const events = await openEvents();

  try {
    const created = await ipc("videos-create", YOUTUBE_URL, {
      compressing: false,
    });

    expect(created.status).toBe(200);
    expect(created.body.result.src).toMatch(/^enjoy:\/\/library\/videos\//);
    // The link the Media was made from, kept on the record.
    expect(created.body.result.source).toBe(YOUTUBE_URL);

    // 720p asked for by name. The 360p Desktop Enjoy used to produce was the
    // first stream that happened to carry sound, never a choice.
    const argv = ytDlpArgv();
    expect(argv[argv.indexOf("--format") + 1]).toContain("height<=720");

    // Picture and sound come down separately at that quality, and the ffmpeg
    // that merges them is the one this app already ships.
    expect(argv).toContain("--merge-output-format");
    expect(argv[argv.indexOf("--merge-output-format") + 1]).toBe("mp4");
    expect(fs.existsSync(argv[argv.indexOf("--ffmpeg-location") + 1])).toBe(
      true
    );

    // A dialog with nothing moving on it reads as hung, and the two streams
    // are one bar: the second must not send the bar back to the start.
    const advanced = percentages(events.messages);
    expect(advanced.length).toBeGreaterThan(1);
    expect([...advanced].sort((a, b) => a - b)).toEqual(advanced);
    expect(advanced.at(-1)).toBe(100);

    const played = await fetch(
      `${baseUrl}/media/${created.body.result.src.replace("enjoy://", "")}`,
      { headers: { Range: "bytes=0-99" } }
    );
    expect(played.status).toBe(206);
  } finally {
    events.close();
  }
});

test("says what the downloader said when a download fails", async () => {
  // The failure this ticket exists for: a downloader YouTube has stopped
  // answering. Wrapped as "failed to download" it is indistinguishable from a
  // dead network, and only one of those is ours to fix.
  ytDlpControl({
    failWith: "ERROR: [youtube] rFejpH_tAHM: Sign in to confirm you are human",
  });

  try {
    const { status, body } = await ipc("videos-create", YOUTUBE_URL, {
      compressing: false,
    });

    expect(status).toBe(500);
    expect(body.error).toContain("Sign in to confirm you are human");
  } finally {
    ytDlpControl({});
  }
});

test("names an unusable YouTube link in the downloader's own words", async () => {
  // Not a video id, so nothing can come of it — but it is a YouTube address,
  // and yt-dlp is who says what is wrong with a YouTube address. The generic
  // file downloader, which used to get these, only ever fetched the page.
  const { status, body } = await ipc(
    "videos-create",
    "https://www.youtube.com/watch?v=nope",
    { compressing: false }
  );

  expect(status).toBe(500);
  expect(body.error).toContain("Incomplete YouTube ID");
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
    blob: blobOf(file, type),
  });

/**
 * A file as the browser hands one over: bytes inside the argument list, encoded
 * by the browser bridge's own encoder, so the wire form asserted against is the
 * one that ships rather than a copy of it.
 */
const blobOf = (file: string, type: string) => ({
  type,
  arrayBuffer: encodeBinary(toArrayBuffer(fs.readFileSync(file))),
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
  await restartServer();

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

/**
 * The Diary, which runs the other way round from a Media: the text is what you
 * wrote, and the audio is derived from it by Speech synthesis.
 *
 * These are the fixtures the later Diary tests lean on. Nothing here knows how
 * a Diary is stored — a Diary is whatever comes back out of these channels.
 */

const createDiary = (params: {
  title?: string;
  content?: string;
  config?: Record<string, any>;
}) => ipc("diaries-create", params);

const updateDiary = (
  id: string,
  params: { title?: string; content?: string; config?: Record<string, any> }
) => ipc("diaries-update", id, params);

const findDiary = (id: string) => ipc("diaries-find-one", { id });

const listDiaries = (query?: string) =>
  ipc("diaries-find-all", query ? { query } : {});

const diaryIds = async (query?: string) =>
  (await listDiaries(query)).body.result.map((diary: any) => diary.id);

/**
 * `updatedAt` is what the list is ordered by, and two writes inside the same
 * millisecond are indistinguishable to it. Waiting for the clock to move on is
 * what makes "touched last" a fact rather than a coin toss.
 */
const waitForNewTimestamp = () =>
  new Promise((resolve) => setTimeout(resolve, 20));

const DIARY_TEXT = [
  "Morning walk",
  "",
  "The fog came in off the water and stayed until nine.",
].join("\n");

// The Diary the tests after this one keep writing to, and the one that has to
// still be there after the restart.
let diaryId: string;

test("keeps a Diary's text, and titles it from the first line", async () => {
  const { status, body } = await createDiary({ content: DIARY_TEXT });

  expect(status).toBe(200);
  diaryId = body.result.id;

  const read = await findDiary(diaryId);
  expect(read.status).toBe(200);
  expect(read.body.result.content).toBe(DIARY_TEXT);
  // Nameless was never an option: a Diary reaches the list titled, the way a
  // notes app does it.
  expect(read.body.result.title).toBe("Morning walk");
});

test("keeps a title that was typed by hand, through a later edit to the body", async () => {
  const created = await createDiary({
    title: "Sea fog",
    content: "The fog came in.",
  });
  const id = created.body.result.id;

  const edited = await updateDiary(id, { content: "Low cloud, all morning." });
  expect(edited.status).toBe(200);

  // Read back rather than believe the answer: an edit that never reached the
  // database would still hand back a correct-looking record.
  const { body } = await findDiary(id);
  // The first line changed; the title did not, because a person chose it.
  expect(body.result.title).toBe("Sea fog");
  expect(body.result.content).toBe("Low cloud, all morning.");
});

test("lists Diaries by what was touched last", async () => {
  const older = (await createDiary({ content: "Older entry" })).body.result;
  await waitForNewTimestamp();
  const newer = (await createDiary({ content: "Newer entry" })).body.result;

  const before = await diaryIds();
  // Both are in the list at all: an ordering read from positions alone would
  // be just as happy with a list that had lost one of them.
  expect(before).toEqual(expect.arrayContaining([older.id, newer.id]));
  expect(before.indexOf(newer.id)).toBeLessThan(before.indexOf(older.id));

  await waitForNewTimestamp();
  await updateDiary(older.id, { content: "Older entry, revisited" });

  // Touching the older one moves it to the front; that is what the list is for.
  const after = await diaryIds();
  expect(after).toEqual(expect.arrayContaining([older.id, newer.id]));
  expect(after.indexOf(older.id)).toBeLessThan(after.indexOf(newer.id));
});

test("finds a Diary by words that are only in its body", async () => {
  const created = await createDiary({
    title: "Tuesday",
    content: "A heron stood in the shallows for twenty minutes.",
  });

  const found = await diaryIds("heron");

  expect(found).toContain(created.body.result.id);
  // And only that one: a search that quietly ignored what was typed would
  // hand back every Diary written so far and still contain the right id.
  expect(found).not.toContain(diaryId);
});

test("finds nothing when nothing matches, rather than everything", async () => {
  const { status, body } = await listDiaries("cormorant");

  expect(status).toBe(200);
  expect(body.result).toEqual([]);
});

test("leaves the voice alone when the text is edited", async () => {
  const voice = { tts: { engine: "elevenlabs", voice: "Rachel" } };
  await updateDiary(diaryId, { config: voice });

  const edited = await updateDiary(diaryId, {
    content: `${DIARY_TEXT}\n\nBy noon it had burned off.`,
  });
  expect(edited.status).toBe(200);

  // Saving the body is a different form from the popover that chose the voice,
  // and it has no business carrying the voice away with it.
  const { body } = await findDiary(diaryId);
  expect(body.result.config).toEqual(voice);
});

test("leaves the title and text alone when the voice is changed", async () => {
  const before = (await findDiary(diaryId)).body.result;

  const changed = await updateDiary(diaryId, {
    config: { tts: { engine: "elevenlabs", voice: "Adam" } },
  });
  expect(changed.status).toBe(200);

  const { body } = await findDiary(diaryId);
  expect(body.result.title).toBe(before.title);
  expect(body.result.content).toBe(before.content);
  expect(body.result.config.tts.voice).toBe("Adam");
});

test("still has the Diary, unchanged, after a restart", async () => {
  const before = (await findDiary(diaryId)).body.result;

  await restartServer();

  const { status, body } = await findDiary(diaryId);

  expect(status).toBe(200);
  expect(body.result.title).toBe(before.title);
  expect(body.result.content).toBe(before.content);
  expect(body.result.config).toEqual(before.config);
});

/**
 * A Diary's Speech, and the rule that makes editing a Diary safe: a Speech is
 * found by the exact text it speaks. Changing the text means there is no Speech
 * for it yet, not that the one already there has been rewritten.
 *
 * Synthesis itself runs in the renderer against a third-party service and stays
 * out of reach here; only persisting the result crosses this seam. So one of
 * the audio samples the repository ships stands in for what the service handed
 * back, its bytes travelling inside the argument list, encoded by the browser
 * bridge's own encoder — the same crossing a Recording makes.
 */

const SPOKEN_TEXT = "The tide was out and the boats were lying on their sides.";
const REWRITTEN_TEXT = "The tide was out and the boats lay on their sides.";

const VOICE = {
  engine: "elevenlabs",
  model: "eleven_multilingual_v2",
  voice: "Rachel",
};

/**
 * @param audio the bytes the synthesis service handed back. Different text is
 *   different audio, and importing a Speech deduplicates by content, so a
 *   Speech that will become a Media needs its own.
 */
const createSpeech = (diaryId: string, text: string, audio = SAMPLE_AUDIO) =>
  ipc(
    "speeches-create",
    {
      sourceId: diaryId,
      sourceType: "Diary",
      text,
      // A Diary is spoken whole, so there is only ever the first of each.
      section: 0,
      segment: 0,
      configuration: VOICE,
    },
    blobOf(audio, "audio/mp3")
  );

const findSpeech = (diaryId: string, text: string) =>
  ipc("speeches-find-one", { sourceId: diaryId, sourceType: "Diary", text });

/**
 * A Document's Speech, asked for the way the ebook reader asks: by where in the
 * page it is rather than by the words, since a Document is spoken a paragraph
 * at a time.
 */
const findDocumentSpeech = (documentId: string, section = 0, segment = 0) =>
  ipc("speeches-find-one", {
    sourceId: documentId,
    sourceType: "Document",
    section,
    segment,
  });

/** Where the Library keeps what a user owns, which is under their own directory. */
const userLibraryFile = async (
  kind: "speeches" | "recordings" | "audios",
  filename: string
) => {
  const userId = (await ipc("app-settings-get-user")).body.result.id;

  return path.join(
    resultDir,
    LIBRARY_PATH_SUFFIX,
    String(userId),
    kind,
    filename
  );
};

const speechFile = (filename: string) => userLibraryFile("speeches", filename);

const recordingFile = (filename: string) =>
  userLibraryFile("recordings", filename);

// The Diary that gets spoken, and then rewritten underneath its Speech.
let spokenDiaryId: string;
let diarySpeech: any;

test("keeps a Diary's Speech, found by the exact text it speaks", async () => {
  spokenDiaryId = (await createDiary({ content: SPOKEN_TEXT })).body.result.id;

  const created = await createSpeech(spokenDiaryId, SPOKEN_TEXT);
  expect(created.status).toBe(200);

  const { status, body } = await findSpeech(spokenDiaryId, SPOKEN_TEXT);
  expect(status).toBe(200);
  diarySpeech = body.result;
  expect(diarySpeech.id).toBe(created.body.result.id);
  expect(diarySpeech.text).toBe(SPOKEN_TEXT);
  // Which Diary spoke it: the editor reads this back to know it has audio, and
  // deleting the Diary later reads it to know what to take with it.
  expect(diarySpeech.sourceType).toBe("Diary");
  expect(diarySpeech.sourceId).toBe(spokenDiaryId);

  // A Speech with no file is a player with nothing to play.
  expect(fs.existsSync(await speechFile(diarySpeech.filename))).toBe(true);
});

test("has no Speech for a Diary whose text has just been rewritten", async () => {
  const edited = await updateDiary(spokenDiaryId, { content: REWRITTEN_TEXT });
  expect(edited.status).toBe(200);

  const { status, body } = await findSpeech(spokenDiaryId, REWRITTEN_TEXT);

  // Not an error, and not the old Speech either: the editor reads this as
  // "not generated yet" and offers to generate again.
  expect(status).toBe(200);
  expect(body.result).toBeNull();
});

test("leaves the Speech of the text it used to say exactly where it was", async () => {
  const { body } = await findSpeech(spokenDiaryId, SPOKEN_TEXT);

  // The Audio and the Recordings made against it are still keyed to this file,
  // so an edit that took it away would empty a learner's practice history.
  expect(body.result.id).toBe(diarySpeech.id);
  expect(fs.existsSync(await speechFile(diarySpeech.filename))).toBe(true);
});

test("hands back the Speech already stored when the same bytes arrive again", async () => {
  const again = await createSpeech(spokenDiaryId, SPOKEN_TEXT);

  // The same text in the same voice synthesises to the same bytes, and one
  // Diary speaks a given text once — so this is a collision rather than a
  // failure, and undoing an edit costs nothing.
  expect(again.status).toBe(200);
  expect(again.body.result.id).toBe(diarySpeech.id);

  // The bytes are written before the collision is noticed, over the path the
  // stored Speech is already playing from. Arriving again must not empty it.
  const file = await speechFile(diarySpeech.filename);
  expect(fs.statSync(file).size).toBe(fs.statSync(SAMPLE_AUDIO).size);
});

/**
 * The same sentence, written in two Diaries.
 *
 * Identical text in the identical voice comes back from the synthesis service
 * as identical bytes, and a Speech's file is named by the hash of its own
 * content — so the two Diaries are always going to share one mp3. What each of
 * them needs is a Speech of its own naming that file, because a Speech is
 * looked up by the Diary that spoke it, and one that belongs to the other
 * Diary answers nothing.
 *
 * The same holds across kinds: a Document paragraph and a Diary that say the
 * same sentence are two Speeches too. Which is why deleting one of them cannot
 * be allowed to take the file the other is playing from.
 */

const SHARED_TEXT = "The wind got up in the night and took the apples down.";

let sharedDiaryId: string;
let sharingDiaryId: string;
let documentId: string;
let sharedSpeech: any;

test("keeps a Speech for each of two Diaries that say the same thing", async () => {
  sharedDiaryId = (await createDiary({ content: SHARED_TEXT })).body.result.id;
  sharingDiaryId = (await createDiary({ content: SHARED_TEXT })).body.result.id;

  for (const id of [sharedDiaryId, sharingDiaryId]) {
    const created = await createSpeech(id, SHARED_TEXT, SAMPLE_SHARED_AUDIO);
    expect(created.status).toBe(200);
  }

  // Asked the way the editor asks on the next visit, which is where the second
  // Diary used to find nothing and offer to spend another synthesis arriving at
  // bytes the Library already held.
  const first = (await findSpeech(sharedDiaryId, SHARED_TEXT)).body.result;
  const second = (await findSpeech(sharingDiaryId, SHARED_TEXT)).body.result;
  sharedSpeech = second;

  expect(first?.sourceId).toBe(sharedDiaryId);
  expect(second?.sourceId).toBe(sharingDiaryId);
  expect(second.id).not.toBe(first.id);

  // Two Speeches, one file: what is shared is the audio, not the record of who
  // spoke it.
  expect(second.filename).toBe(first.filename);
  expect(fs.existsSync(await speechFile(first.filename))).toBe(true);
});

test("still hands back the one Speech when the same Diary says it again", async () => {
  const again = await createSpeech(
    sharedDiaryId,
    SHARED_TEXT,
    SAMPLE_SHARED_AUDIO
  );

  // Scoping the collision to the Diary must not turn a Diary edited back to
  // what it said before into a second Speech of its own.
  expect(again.body.result.id).toBe(
    (await findSpeech(sharedDiaryId, SHARED_TEXT)).body.result.id
  );
});

test("keeps a Speech for a Document that says it too, not only for Diaries", async () => {
  const document = (
    await ipc("documents-create", {
      uri: SAMPLE_SHARED_DOCUMENT,
      title: "A page that says the same thing",
    })
  ).body.result;
  documentId = document.id;

  // A Document is spoken a paragraph at a time, so where in it the sentence
  // falls is part of which Speech this is — unlike a Diary, which is spoken
  // whole and so is always at the first of each.
  const created = await ipc(
    "speeches-create",
    {
      sourceId: documentId,
      sourceType: "Document",
      text: SHARED_TEXT,
      section: 0,
      segment: 0,
      configuration: VOICE,
    },
    blobOf(SAMPLE_SHARED_AUDIO, "audio/mp3")
  );
  expect(created.status).toBe(200);

  const { body } = await findDocumentSpeech(documentId);
  expect(body.result?.sourceId).toBe(documentId);
  expect(body.result.id).not.toBe(sharedSpeech.id);
  expect(body.result.filename).toBe(sharedSpeech.filename);
});

test("leaves the other Diary its Speech, and the audio under it, on deletion", async () => {
  expect((await ipc("diaries-destroy", sharedDiaryId)).status).toBe(200);

  const speechFor = async (id: string) =>
    (await findSpeech(id, SHARED_TEXT)).body.result;

  // Read once rather than polled: a Speech's file is taken, or left, as part of
  // its record's departure, so answering the delete has already settled it.
  expect(await speechFor(sharedDiaryId)).toBeNull();

  const kept = await speechFor(sharingDiaryId);
  expect(kept?.id).toBe(sharedSpeech.id);

  // And the Document's, which the same file sits under: tidying up a Diary has
  // no business emptying a page of a book.
  const spokenPage = await findDocumentSpeech(documentId);
  expect(spokenPage.body.result?.filename).toBe(kept.filename);

  // Both halves, because the record surviving with nothing under it is a player
  // that loads and then plays silence.
  expect(fs.existsSync(await speechFile(kept.filename))).toBe(true);
  const played = await fetch(
    `${baseUrl}/media/${kept.src.replace("enjoy://", "")}`,
    { headers: { Range: "bytes=0-99" } }
  );
  expect(played.status).toBe(206);
});

/**
 * Deleting a Speech on its own, which is what refreshing a Document paragraph
 * does: the reader throws away what the page was speaking before asking for it
 * again. The same rule has to hold on that path as on a deleted Diary's — the
 * file goes when nothing speaks it any more, and stays while something does.
 */

test("leaves the file alone when another source still speaks it", async () => {
  const spokenPage = (await findDocumentSpeech(documentId)).body.result;

  expect((await ipc("speeches-delete", spokenPage.id)).status).toBe(200);

  // The record goes, and only that record: the Diary saying the same sentence
  // is still spoken, out of the file the page was sharing with it.
  expect((await findDocumentSpeech(documentId)).body.result).toBeNull();

  const kept = (await findSpeech(sharingDiaryId, SHARED_TEXT)).body.result;
  expect(kept?.filename).toBe(spokenPage.filename);
  expect(fs.existsSync(await speechFile(spokenPage.filename))).toBe(true);
});

test("takes the file with the last Speech that names it", async () => {
  // Last because the Diary that also spoke it has been deleted, and the page
  // that shared its file was refreshed by the test above.
  const last = (await findSpeech(sharingDiaryId, SHARED_TEXT)).body.result;
  const file = await speechFile(last.filename);
  expect(fs.existsSync(file)).toBe(true);

  expect((await ipc("speeches-delete", last.id)).status).toBe(200);

  // Nothing speaks those bytes now, so nothing should be holding them: this is
  // the path a refreshed paragraph took, once per refresh, leaving the Library
  // filling with audio for text nobody says any more.
  expect((await findSpeech(sharingDiaryId, SHARED_TEXT)).body.result).toBeNull();
  expect(fs.existsSync(file)).toBe(false);
});

/**
 * Shadowing a Diary, which is the crossing that makes one practisable: the
 * Speech is handed to the Media library along with the text it speaks, and
 * comes back as an ordinary Media — so Recordings and Assessment work against
 * your own writing with no new plumbing at all.
 *
 * The seeding is the point. Without it the player would run Transcription to
 * recover words we typed ourselves; with it, it aligns the audio against a
 * Transcript it already has.
 */

const SHADOWED_TEXT =
  "I walked to the harbour before breakfast and the gulls were already up.";

const SHADOWED_TITLE = "Before breakfast";

/**
 * What pressing Shadow does, as this seam sees it: look for a Media already
 * made of these bytes, make one seeded with the text if there is none, and go
 * to its address. Anything the renderer does either side of that is the
 * router's.
 */
const shadow = async (title: string, speech: any) => {
  const found = (await ipc("audios-find-one", { md5: speech.md5 })).body.result;
  if (found) return found;

  const created = await ipc("audios-create", speech.filePath, {
    name: `[Diary] ${title}`,
    originalText: speech.text,
  });
  expect(created.status).toBe(200);
  return created.body.result;
};

const transcriptionOf = async (audioId: string) =>
  (await ipc("transcriptions-find-or-create", {
    targetId: audioId,
    targetType: "Audio",
  })).body.result;

let shadowedSpeech: any;
let shadowedAudio: any;

test("makes a Media out of a Diary's Speech, playable from the Library", async () => {
  test.setTimeout(120000);

  const diary = (
    await createDiary({ title: SHADOWED_TITLE, content: SHADOWED_TEXT })
  ).body.result;
  const created = await createSpeech(
    diary.id,
    SHADOWED_TEXT,
    SAMPLE_SPEECH_AUDIO
  );
  expect(created.status).toBe(200);
  shadowedSpeech = created.body.result;

  shadowedAudio = await shadow(SHADOWED_TITLE, shadowedSpeech);
  expect(shadowedAudio.src).toMatch(/^enjoy:\/\/library\/audios\//);

  // The player fetches the Media by that address, so a Media it cannot reach is
  // a Shadow button that lands on an empty page.
  const played = await fetch(
    `${baseUrl}/media/${shadowedAudio.src.replace("enjoy://", "")}`,
    { headers: { Range: "bytes=0-99" } }
  );
  expect(played.status).toBe(206);

  // What it is called in the Audios list, where it now sits among things the
  // learner imported rather than wrote. The marker itself is the renderer's —
  // a localised word this seam cannot see — so what is asserted here is the
  // half that lives on this side: a name asked for at import is the name the
  // list gives back, rather than the filename the bytes arrived under.
  const { body } = await ipc("audios-find-all", {});
  const listed = body.result.find((audio: any) => audio.id === shadowedAudio.id);
  expect(listed.name).toBe(`[Diary] ${SHADOWED_TITLE}`);
  expect(listed.name).not.toContain(path.basename(SAMPLE_SPEECH_AUDIO));
});

test("hands that Media a Transcript already carrying what the Diary says", async () => {
  const transcription = await transcriptionOf(shadowedAudio.id);

  // Asked for the way the player asks: find-or-create answers with whatever is
  // there, so text in the answer can only have arrived with the import.
  expect(transcription.result?.originalText).toBe(SHADOWED_TEXT);
});

test("leaves that Transcript in the state that leads to Alignment", async () => {
  const transcription = await transcriptionOf(shadowedAudio.id);

  // Pending, so the player still has work to do — and holding the text it has
  // to do that work with, which is what sends it to Alignment instead of
  // uploading audio to have words we wrote ourselves guessed back at us.
  expect(transcription.state).toBe("pending");
  expect(transcription.result?.originalText).toBeTruthy();

  // Nothing to click yet: the sentences come out of Alignment, not out of here.
  expect(transcription.result?.timeline).toBeFalsy();
});

test("arrives at the one Media when the same Diary is shadowed again", async () => {
  // Both halves of shadowing again, asserted separately, because either one
  // alone would hide the other failing: the lookup finds what the first visit
  // made, and importing the same bytes again arrives at it rather than beside
  // it.
  const found = (
    await ipc("audios-find-one", { md5: shadowedSpeech.md5 })
  ).body.result;
  expect(found.id).toBe(shadowedAudio.id);

  const reimported = await ipc("audios-create", shadowedSpeech.filePath, {
    name: `[Diary] ${SHADOWED_TITLE}`,
    originalText: shadowedSpeech.text,
  });
  expect(reimported.body.result.id).toBe(shadowedAudio.id);

  // Practice accumulates against a single Media, so a second visit must not
  // start a second history beside the first.
  const { body } = await ipc("audios-find-all", {
    where: { md5: shadowedSpeech.md5 },
  });
  expect(body.result).toHaveLength(1);
});

/**
 * Deleting a Diary, which is the rule most expensive to get wrong. A Speech is
 * a derivative of text that is going away, so it goes too. The Media that
 * Speech became is not a derivative — it is a thing you practised against — so
 * it stays, and with it the Transcript and every Recording made against it.
 *
 * The rule only means anything if there is practice history to destroy, so this
 * Diary gets the whole chain before anything is deleted: two Speeches, since a
 * Diary that has been edited keeps the one it used to say as well as the one it
 * says now, the Media the current Speech becomes, and a Recording against that
 * Media.
 *
 * A regression here is silent — a learner tidies up their writing and finds out
 * long afterwards that their Recordings went with it — so what is asserted is
 * the Library on disk as much as what the channels answer.
 */

const DOOMED_TITLE = "The last of the plums";

const DOOMED_DRAFT = "We picked the last of the plums.";

const DOOMED_TEXT =
  "We picked the last of the plums and the wasps had got to most of them.";

let doomedDiaryId: string;
let doomedDraftSpeech: any;
let doomedSpeech: any;
let survivingAudio: any;
let survivingRecording: any;

test("stands a Diary up with two Speeches, a Media, and a Recording against it", async () => {
  test.setTimeout(120000);

  doomedDiaryId = (
    await createDiary({ title: DOOMED_TITLE, content: DOOMED_DRAFT })
  ).body.result.id;

  // Spoken, then rewritten and spoken again — so the Diary now owns both, and
  // deleting it has to take the pair rather than whichever one it reaches first.
  doomedDraftSpeech = (
    await createSpeech(doomedDiaryId, DOOMED_DRAFT, SAMPLE_DOOMED_DRAFT_AUDIO)
  ).body.result;
  await updateDiary(doomedDiaryId, { content: DOOMED_TEXT });
  doomedSpeech = (
    await createSpeech(doomedDiaryId, DOOMED_TEXT, SAMPLE_DOOMED_SPEECH_AUDIO)
  ).body.result;

  for (const speech of [doomedDraftSpeech, doomedSpeech]) {
    expect(fs.existsSync(await speechFile(speech.filename))).toBe(true);
  }

  survivingAudio = await shadow(DOOMED_TITLE, doomedSpeech);

  const recorded = await ipc("recordings-create", {
    targetId: survivingAudio.id,
    targetType: "Audio",
    referenceId: 0,
    referenceText: DOOMED_TEXT,
    blob: blobOf(SAMPLE_DIARY_RECORDING, "audio/mpeg"),
  });
  expect(recorded.status).toBe(200);
  survivingRecording = recorded.body.result;

  // The history this deletion has to leave alone, confirmed to exist before it
  // is put at risk — otherwise the assertions below would pass against a Diary
  // that never had anything to lose.
  expect(survivingRecording.targetId).toBe(survivingAudio.id);
  expect(fs.existsSync(await recordingFile(survivingRecording.filename))).toBe(
    true
  );
});

test("takes every Speech the Diary owned, and their files, away with it", async () => {
  const destroyed = await ipc("diaries-destroy", doomedDiaryId);
  expect(destroyed.status).toBe(200);

  for (const text of [DOOMED_DRAFT, DOOMED_TEXT]) {
    const { status, body } = await findSpeech(doomedDiaryId, text);
    expect(status).toBe(200);
    expect(body.result).toBeNull();
  }

  // The mp3s go with the records, so that the Library does not fill up with
  // speech for text that no longer exists. They are removed as each record's
  // own departure settles, so this waits for them rather than reading once.
  for (const speech of [doomedDraftSpeech, doomedSpeech]) {
    const file = await speechFile(speech.filename);
    await expect.poll(() => fs.existsSync(file)).toBe(false);
  }
});

test("cannot find the deleted Diary any more, by id or in the list", async () => {
  const { status, body } = await findDiary(doomedDiaryId);
  expect(status).toBe(200);
  expect(body.result ?? null).toBeNull();

  expect(await diaryIds()).not.toContain(doomedDiaryId);
});

test("leaves the Media that Diary's Speech became, still playable", async () => {
  const { body } = await ipc("audios-find-all", {});
  const listed = body.result.find(
    (audio: any) => audio.id === survivingAudio.id
  );
  expect(listed).toBeDefined();

  // Both what the Library holds and what the player can fetch out of it: the
  // Speech's file has just been removed from under this Media, and a Media
  // whose own copy went with it is a page that loads and then plays nothing.
  expect(
    fs.existsSync(await userLibraryFile("audios", path.basename(listed.src)))
  ).toBe(true);

  const played = await fetch(
    `${baseUrl}/media/${listed.src.replace("enjoy://", "")}`,
    { headers: { Range: "bytes=0-99" } }
  );
  expect(played.status).toBe(206);
});

test("leaves that Media's Transcript, still carrying what the Diary said", async () => {
  const transcription = await transcriptionOf(survivingAudio.id);

  // Asked for the way the player asks. Find-or-create would answer a blank one
  // had the original gone, so the Diary's own words coming back is what says
  // the Transcript survived rather than was made again just now.
  expect(transcription.result?.originalText).toBe(DOOMED_TEXT);
});

test("leaves the Recording made against it, file and all", async () => {
  const { body } = await ipc("recordings-find-all", {
    where: { targetId: survivingAudio.id, targetType: "Audio" },
  });
  const kept = body.result.find(
    (recording: any) => recording.id === survivingRecording.id
  );

  // A Recording with no file is an Assessment that can never be played back
  // against what was said, so both halves are asserted.
  expect(kept).toBeDefined();
  expect(fs.existsSync(await recordingFile(kept.filename))).toBe(true);
});

/**
 * Deleting the Media those Recordings were made against, which is the other
 * half of the same rule. A Recording is practice against one Media: with the
 * Media gone there is no sentence left to play it back against and nothing that
 * can reach it, so it goes too — and, like every other derivative, its file
 * goes with it rather than sitting in the Library unnamed.
 *
 * This runs after the Diary above has been deleted, so what it deletes is a
 * Media that has already outlived the text it was spoken from — the state a
 * learner who tidies up their writing and then their Library actually reaches.
 */
test("takes the Recordings made against a Media, and their files, with it", async () => {
  const file = await recordingFile(survivingRecording.filename);
  expect(fs.existsSync(file)).toBe(true);

  const destroyed = await ipc("audios-destroy", survivingAudio.id);
  expect(destroyed.status).toBe(200);

  const { body } = await ipc("recordings-find-all", {
    where: { targetId: survivingAudio.id, targetType: "Audio" },
  });
  expect(body.result).toHaveLength(0);

  // Read once rather than polled: the Recordings are destroyed as part of the
  // Media's own departure, so the file has to be gone by the time the delete is
  // answered, not shortly afterwards.
  expect(fs.existsSync(file)).toBe(false);
});

/**
 * The same rule on the Video path, which is a second copy of the same hook
 * rather than a call into the first — so a Media being a Video is exactly where
 * it would go on being got wrong unnoticed.
 */
test("takes them with a Video too, which deletes down a hook of its own", async () => {
  const imported = await ipc("videos-create", SAMPLE_DOOMED_VIDEO, {
    compressing: false,
  });
  expect(imported.status).toBe(200);
  const video = imported.body.result;

  const recorded = await ipc("recordings-create", {
    targetId: video.id,
    targetType: "Video",
    referenceId: 0,
    referenceText: "Whatever the test pattern is saying.",
    blob: blobOf(SAMPLE_VIDEO_RECORDING, "audio/mpeg"),
  });
  expect(recorded.status).toBe(200);

  const file = await recordingFile(recorded.body.result.filename);
  expect(fs.existsSync(file)).toBe(true);

  const destroyed = await ipc("videos-destroy", video.id);
  expect(destroyed.status).toBe(200);

  const { body } = await ipc("recordings-find-all", {
    where: { targetId: video.id, targetType: "Video" },
  });
  expect(body.result).toHaveLength(0);
  expect(fs.existsSync(file)).toBe(false);
});

test("deletes a Diary that was never spoken, rather than failing", async () => {
  const written = (await createDiary({ content: "Nothing said out loud." }))
    .body.result;

  const { status } = await ipc("diaries-destroy", written.id);
  expect(status).toBe(200);
  expect(await diaryIds()).not.toContain(written.id);
});

/**
 * A ChatMember leaving, which takes with it every ChatMessage that member
 * spoke — and, under each of those, a Speech and the mp3 the Speech names.
 *
 * Chat is a feature Local Web Enjoy's pages never reach, but its deletion path
 * owns Speeches exactly as a Diary's does, and the rule that a file goes with
 * the last record naming it has to hold here too. Asserted at the same seam as
 * the rest, because that is where the handlers answer.
 */

/**
 * A chat to delete something out of. Two agents, because a chat refuses to lose
 * its last one: a member can only be removed if somebody stays behind, and a
 * ChatAgent can only leave a chat that survives it if the same is true.
 */
const chatWithTwoAgents = async (name: string) => {
  const agents = [];
  for (const suffix of ["one", "two"]) {
    const created = await ipc("chat-agents-create", {
      name: `${name} ${suffix}`,
      type: "GPT",
      language: "en-US",
      description: `${name} ${suffix}`,
      config: { prompt: "Talk about the harbour." },
    });
    expect(created.status).toBe(200);
    agents.push(created.body.result);
  }

  const chat = await ipc("chats-create", {
    name,
    config: { sttEngine: "whisper" },
    members: agents.map((agent: any) => ({
      userId: agent.id,
      userType: "ChatAgent",
      config: {},
    })),
  });
  expect(chat.status).toBe(200);

  const members = (
    await ipc("chat-members-find-all", {
      where: { chatId: chat.body.result.id },
    })
  ).body.result;

  return { chatId: chat.body.result.id, agents, members };
};

const CHAT_SPOKEN_TEXT = "Every boat came back before the weather turned.";

let leavingMemberId: string;
let spokenChatMessageId: string;
let chatSpeech: any;
let chatRecording: any;

test("stands a chat up with two agents, and a spoken message from one", async () => {
  const { chatId, agents, members } = await chatWithTwoAgents("The harbour");
  leavingMemberId = members.find(
    (member: any) => member.userId === agents[0].id
  ).id;

  const message = await ipc("chat-messages-create", {
    chatId,
    memberId: leavingMemberId,
    content: CHAT_SPOKEN_TEXT,
  });
  expect(message.status).toBe(200);
  spokenChatMessageId = message.body.result.id;

  const spoken = await ipc(
    "speeches-create",
    {
      sourceId: spokenChatMessageId,
      sourceType: "ChatMessage",
      text: CHAT_SPOKEN_TEXT,
      section: 0,
      segment: 0,
      configuration: VOICE,
    },
    blobOf(SAMPLE_CHAT_SPEECH_AUDIO, "audio/mp3")
  );
  expect(spoken.status).toBe(200);
  chatSpeech = spoken.body.result;

  // A learner shadowing what the agent said, which is the other file hanging
  // off this message.
  const recorded = await ipc("recordings-create", {
    targetId: spokenChatMessageId,
    targetType: "ChatMessage",
    referenceId: 0,
    referenceText: CHAT_SPOKEN_TEXT,
    blob: blobOf(SAMPLE_CHAT_RECORDING, "audio/mpeg"),
  });
  expect(recorded.status).toBe(200);
  chatRecording = recorded.body.result;

  // What the removal below has to take away, confirmed present first.
  expect(fs.existsSync(await speechFile(chatSpeech.filename))).toBe(true);
  expect(fs.existsSync(await recordingFile(chatRecording.filename))).toBe(true);
});

test("takes the leaving member's messages, their Speeches and their files", async () => {
  const removed = await ipc("chat-members-destroy", leavingMemberId);
  expect(removed.status).toBe(200);

  // Read once rather than polled: over HTTP a fire-and-forget destroy would
  // settle before the next request is parsed anyway, so this cannot tell an
  // awaited destroy from an unawaited one — but polling would hide even the
  // difference the seam can see, and the record has to be gone by the time the
  // member is answered as removed.
  const message = await ipc("chat-messages-find-one", {
    id: spokenChatMessageId,
  });
  expect(message.status).toBe(200);
  expect(message.body.result).toBeNull();

  const speech = await ipc("speeches-find-one", {
    sourceId: spokenChatMessageId,
    sourceType: "ChatMessage",
  });
  expect(speech.status).toBe(200);
  expect(speech.body.result).toBeNull();

  // The mp3 too: nothing speaks those bytes any more, and a Library filling
  // with audio for messages nobody can read is what the hook exists to prevent.
  expect(fs.existsSync(await speechFile(chatSpeech.filename))).toBe(false);

  // And the learner's own recording of that message, which the same hook
  // destroyed in bulk — taking the record and leaving the audio behind.
  const recordings = await ipc("recordings-find-all", {
    where: { targetId: spokenChatMessageId, targetType: "ChatMessage" },
  });
  expect(recordings.body.result).toHaveLength(0);
  expect(fs.existsSync(await recordingFile(chatRecording.filename))).toBe(
    false
  );
});

/**
 * The chat above went away one member at a time, which is how a member leaves.
 * A chat goes away whole, and so does the ChatAgent a chat is with — two more
 * paths down to the same messages, and so to the same Speeches and Recordings.
 * Both are asserted here because neither reaches the other: a Chat destroys its
 * members, a ChatAgent destroys its memberships, and the messages under either
 * are the learner's own audio and the agent's.
 */

const DOOMED_CHAT_AGENT_TEXT = "The tide turns twice before anyone notices.";
const DOOMED_CHAT_USER_TEXT = "I said it back, slower.";

let doomedChatId: string;
let doomedChatMemberIds: string[];
let doomedChatMessageIds: string[];
let doomedChatSpeech: any;
let doomedChatRecording: any;

test("stands up a chat to delete whole, spoken by an agent and by the learner", async () => {
  const { chatId, members } = await chatWithTwoAgents("The doomed harbour");
  doomedChatId = chatId;
  doomedChatMemberIds = members.map((member: any) => member.id);

  // One message from an agent, which owns the Speech, and one from the learner,
  // which owns the Recording — the two kinds of audio a chat holds, and neither
  // of them reachable once the chat they were said in is gone.
  const spoken = await ipc("chat-messages-create", {
    chatId,
    memberId: doomedChatMemberIds[0],
    content: DOOMED_CHAT_AGENT_TEXT,
  });
  expect(spoken.status).toBe(200);

  const said = await ipc("chat-messages-create", {
    chatId,
    content: DOOMED_CHAT_USER_TEXT,
  });
  expect(said.status).toBe(200);
  doomedChatMessageIds = [spoken.body.result.id, said.body.result.id];

  const speech = await ipc(
    "speeches-create",
    {
      sourceId: spoken.body.result.id,
      sourceType: "ChatMessage",
      text: DOOMED_CHAT_AGENT_TEXT,
      section: 0,
      segment: 0,
      configuration: VOICE,
    },
    blobOf(SAMPLE_DOOMED_CHAT_SPEECH, "audio/mp3")
  );
  expect(speech.status).toBe(200);
  doomedChatSpeech = speech.body.result;

  const recorded = await ipc("recordings-create", {
    targetId: said.body.result.id,
    targetType: "ChatMessage",
    referenceId: 0,
    referenceText: DOOMED_CHAT_USER_TEXT,
    blob: blobOf(SAMPLE_DOOMED_CHAT_RECORDING, "audio/mpeg"),
  });
  expect(recorded.status).toBe(200);
  doomedChatRecording = recorded.body.result;

  expect(fs.existsSync(await speechFile(doomedChatSpeech.filename))).toBe(true);
  expect(fs.existsSync(await recordingFile(doomedChatRecording.filename))).toBe(
    true
  );
});

test("takes a deleted Chat's members, their messages and every file under them", async () => {
  const destroyed = await ipc("chats-destroy", doomedChatId);
  expect(destroyed.status).toBe(200);

  // Read once rather than polled, as the member's own removal is above: the
  // chat has to be empty by the time it is answered as deleted, not shortly
  // afterwards.
  const members = await ipc("chat-members-find-all", {
    where: { chatId: doomedChatId },
  });
  expect(members.body.result).toHaveLength(0);

  const messages = await ipc("chat-messages-find-all", {
    where: { chatId: doomedChatId },
  });
  expect(messages.body.result).toHaveLength(0);

  const speech = await ipc("speeches-find-one", {
    sourceId: doomedChatMessageIds[0],
    sourceType: "ChatMessage",
  });
  expect(speech.body.result).toBeNull();

  const recordings = await ipc("recordings-find-all", {
    where: { targetId: doomedChatMessageIds[1], targetType: "ChatMessage" },
  });
  expect(recordings.body.result).toHaveLength(0);

  expect(fs.existsSync(await speechFile(doomedChatSpeech.filename))).toBe(
    false
  );
  expect(fs.existsSync(await recordingFile(doomedChatRecording.filename))).toBe(
    false
  );
});

test("takes them down the ChatAgent path too, which deletes through hooks of its own", async () => {
  const { chatId, agents, members } = await chatWithTwoAgents("The other harbour");

  const leavingMemberId = members.find(
    (member: any) => member.userId === agents[0].id
  ).id;

  const spoken = await ipc("chat-messages-create", {
    chatId,
    memberId: leavingMemberId,
    content: DOOMED_CHAT_AGENT_TEXT,
  });
  expect(spoken.status).toBe(200);

  const speech = await ipc(
    "speeches-create",
    {
      sourceId: spoken.body.result.id,
      sourceType: "ChatMessage",
      text: DOOMED_CHAT_AGENT_TEXT,
      section: 0,
      segment: 0,
      configuration: VOICE,
    },
    blobOf(SAMPLE_AGENT_CHAT_SPEECH, "audio/mp3")
  );
  expect(speech.status).toBe(200);

  const recorded = await ipc("recordings-create", {
    targetId: spoken.body.result.id,
    targetType: "ChatMessage",
    referenceId: 0,
    referenceText: DOOMED_CHAT_AGENT_TEXT,
    blob: blobOf(SAMPLE_AGENT_CHAT_RECORDING, "audio/mpeg"),
  });
  expect(recorded.status).toBe(200);

  const speechPath = await speechFile(speech.body.result.filename);
  const recordingPath = await recordingFile(recorded.body.result.filename);
  expect(fs.existsSync(speechPath)).toBe(true);
  expect(fs.existsSync(recordingPath)).toBe(true);

  const destroyed = await ipc("chat-agents-destroy", agents[0].id);
  expect(destroyed.status).toBe(200);

  // The chat itself stays: a second agent is still in it. What goes is the
  // membership the deleted agent held, and everything that hung off it.
  const chat = await ipc("chats-find-one", { where: { id: chatId } });
  expect(chat.body.result).not.toBeNull();

  const remaining = await ipc("chat-members-find-all", {
    where: { chatId, userId: agents[0].id },
  });
  expect(remaining.body.result).toHaveLength(0);

  const message = await ipc("chat-messages-find-one", {
    id: spoken.body.result.id,
  });
  expect(message.body.result).toBeNull();

  expect(fs.existsSync(speechPath)).toBe(false);
  expect(fs.existsSync(recordingPath)).toBe(false);
});

/**
 * Changing a Diary's voice and speaking it again.
 *
 * The voice is not part of how a Speech is found — that is the text and the
 * source, and nothing else — so a new voice on its own changes nothing anybody
 * can hear. The panel answers with a Regenerate button, and this is the
 * sequence behind it: say the Diary in the new voice, then destroy what it said
 * in the old one.
 *
 * The order is the point. Synthesis is the step that can fail, so it goes
 * first: a spent quota leaves the Diary with the audio it had rather than with
 * none. And the destruction leaves exactly one Speech behind, because two
 * Speeches for one text and one source is a question `speeches-find-one` has no
 * way to answer — it returns one, and which one is the database's business.
 */

const RESPOKEN_TEXT = "The lighthouse kept its light on long after sunrise.";

let respokenDiaryId: string;
let firstVoiceSpeechId: string;
let firstVoiceFile: string;

const SECOND_VOICE = { ...VOICE, voice: "Adam" };

test("speaks a Diary in the voice its settings named", async () => {
  const created = await createDiary({
    content: RESPOKEN_TEXT,
    config: { tts: VOICE },
  });
  expect(created.status).toBe(200);
  respokenDiaryId = created.body.result.id;

  const spoken = await createSpeech(
    respokenDiaryId,
    RESPOKEN_TEXT,
    SAMPLE_FIRST_VOICE_AUDIO
  );
  expect(spoken.status).toBe(200);

  firstVoiceSpeechId = spoken.body.result.id;
  firstVoiceFile = await speechFile(spoken.body.result.filename);
  expect(fs.existsSync(firstVoiceFile)).toBe(true);
});

test("still finds the old Speech after the voice alone is changed", async () => {
  const changed = await updateDiary(respokenDiaryId, {
    config: { tts: SECOND_VOICE },
  });
  expect(changed.status).toBe(200);

  // Which is the whole difficulty: the setting is saved, and the Diary goes on
  // saying what it said, in the voice it is no longer set to. Nothing here can
  // fix that — only speaking it again can — so the panel says so instead.
  const { body } = await findSpeech(respokenDiaryId, RESPOKEN_TEXT);
  expect(body.result.id).toBe(firstVoiceSpeechId);
  expect(body.result.configuration.voice).toBe(VOICE.voice);
});

test("leaves one Speech, in the new voice, once it is spoken again", async () => {
  const respoken = await ipc(
    "speeches-create",
    {
      sourceId: respokenDiaryId,
      sourceType: "Diary",
      text: RESPOKEN_TEXT,
      section: 0,
      segment: 0,
      configuration: SECOND_VOICE,
    },
    blobOf(SAMPLE_SECOND_VOICE_AUDIO, "audio/mp3")
  );
  expect(respoken.status).toBe(200);
  expect(respoken.body.result.id).not.toBe(firstVoiceSpeechId);

  // Only now, with the new audio safely stored, does the old go.
  expect((await ipc("speeches-delete", firstVoiceSpeechId)).status).toBe(200);

  const { body } = await findSpeech(respokenDiaryId, RESPOKEN_TEXT);
  expect(body.result.id).toBe(respoken.body.result.id);
  expect(body.result.configuration.voice).toBe(SECOND_VOICE.voice);

  // And the file of the voice nobody chose any more goes with its record,
  // rather than accumulating in the Library once per change of mind.
  expect(fs.existsSync(firstVoiceFile)).toBe(false);
  expect(
    fs.existsSync(await speechFile(respoken.body.result.filename))
  ).toBe(true);
});

test("reached Hosted Enjoy at no point along the way", async () => {
  // The models sync every record they save, and a Recording is no exception.
  // What they sync to is the stand-in, which makes no request at all — so the
  // Hosted Enjoy address this server was started with has never been called,
  // through every import, transcode, recording and restart above.
  expect(hostedEnjoyRequests).toEqual([]);
});
