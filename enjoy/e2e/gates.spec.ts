import { expect, test } from "@playwright/test";
import path from "path";
import { enjoyRoot, scripts, stepsRunning, triggerPaths } from "./workflow";

/**
 * The two gates that are not test suites: lint and typecheck.
 *
 * Both existed in name and neither could stop anything. `lint` ran ESLint 9
 * against an `.eslintrc.json` it has not read since the major bump, so it
 * failed to start rather than to lint; the typecheck had no script at all, and
 * so ran wherever somebody happened to have an editor open. Nothing in CI
 * called either, which is why both stayed broken quietly.
 *
 * `suites.spec.ts` asserts the same chain for test suites, and for the same
 * reason: a gate nothing runs is not a gate, and a gate CI runs behind
 * `continue-on-error` is not one either. So the chain is asserted here too —
 * the script exists, a root script delegates to it, and the workflow runs that
 * root script as a step that can fail the build.
 */

/** The scripts that answer whether the code is fit to merge, by name. */
const GATES = ["lint", "typecheck"];

test("gives each quality gate a script of its own", () => {
  const enjoyScripts = scripts(path.join(enjoyRoot, "package.json"));

  expect(
    GATES.filter((gate) => !enjoyScripts[gate]),
    "Quality gates with no script in enjoy/package.json to run them."
  ).toEqual([]);
});

test("calls every one of those scripts from the workflow, as a gate", () => {
  const uncalled: string[] = [];
  const ungated: string[] = [];

  for (const gate of GATES) {
    const running = stepsRunning(gate);

    if (running.length === 0) uncalled.push(gate);
    if (running.some((step) => step.includes("continue-on-error: true")))
      ungated.push(gate);
  }

  expect(
    uncalled,
    "Quality gates the workflow never calls. Each needs a root script " +
      "delegating to it, and a step in .github/workflows/test-enjoy-app.yml " +
      "running that root script."
  ).toEqual([]);
  expect(
    ungated,
    "Quality gates the workflow runs behind `continue-on-error: true`, so a " +
      "new error leaves the workflow green — a gate that is run but cannot " +
      "fail anything is not a gate."
  ).toEqual([]);
});

test("watches the same paths on a push as on a pull request", () => {
  const [onPush, onPullRequest, ...rest] = triggerPaths();

  expect(
    rest,
    "More `paths:` filters in the workflow than the two triggers this knows " +
      "about, so the two it compared may not be the two that matter."
  ).toEqual([]);
  expect(
    onPullRequest,
    "The push and pull_request `paths:` filters have drifted apart, so a " +
      "change runs the gates on one and not the other. GitHub Actions does " +
      "not resolve YAML anchors, so the two lists are written out and have " +
      "to be edited together."
  ).toEqual(onPush);
});

test("runs on a change to what decides whether it runs", () => {
  const [onPush] = triggerPaths();

  expect(
    ["package.json", ".github/workflows/test-enjoy-app.yml"].filter(
      (file) => !onPush.includes(file)
    ),
    "Files the gates depend on that the workflow does not watch: the root " +
      "scripts the gates are called through, and the workflow itself. A pull " +
      "request touching only these would run no gate at all."
  ).toEqual([]);
});
