import { expect, test } from "@playwright/test";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import fs from "fs-extra";

// Duplicated from src/constants rather than imported: importing that module
// pulls in a JSON asset the plain Node test runner cannot load, and the test is
// asserting the on-disk layout a user would see, not the app's own constants.
const LIBRARY_PATH_SUFFIX = "EnjoyLibrary";

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
    const child = spawn(process.execPath, ["src/web/start.mjs"], {
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

test("names the channel when no handler is registered for it", async () => {
  const { status, body } = await ipc("no-such-channel");

  expect(status).toBe(404);
  expect(body.error).toContain("no-such-channel");
});
