import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * The specs that drive a packaged Electron build, and the only ones that do.
 * Everything else in e2e/ is plain Node.
 */
const ELECTRON_SPECS = [/main\.spec\.ts$/, /renderer\.spec\.ts$/];

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },
  timeout: 60000,

  /*
   * The suites, split by what a spec needs in order to run.
   *
   * `electron` drives a packaged build and so has to wait behind
   * `yarn package` on every runner it is tried on. `node` needs nothing built
   * at all — it starts the local server itself, or reads source files where it
   * is only checking that two declarations agree — so it runs on one cheap
   * runner in seconds.
   *
   * `node` is declared as the complement of `electron` rather than a list of
   * its own, so a spec added tomorrow belongs to a project, a script and a CI
   * job without anybody remembering to wire it up. e2e/suites.spec.ts holds
   * that chain to it.
   */
  projects: [
    { name: "electron", testMatch: ELECTRON_SPECS },
    { name: "node", testIgnore: ELECTRON_SPECS },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
