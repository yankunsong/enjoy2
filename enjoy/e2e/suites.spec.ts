import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "../playwright.config";

/**
 * The path from a spec file to a CI run, checked at every joint.
 *
 * A test that nothing runs is not a gate. Both halves of this suite were
 * written and neither ran anywhere but a laptop: `test:web` named one file, so
 * `channels.spec.ts` belonged to no script at all, and the workflow called
 * neither. Adding a test did not make the codebase any better watched, which is
 * the thing that has to stop being true.
 *
 * So the chain is asserted rather than remembered. A spec file belongs to a
 * project, a project is run by a script, and a script is called by the
 * workflow. Break a link — a new spec no project claims, a project no script
 * names, a script CI never calls — and this fails on the way in.
 *
 * The projects split on what a spec needs to run, not on what it is about: the
 * two Electron specs drive a packaged build, everything else is plain Node and
 * wants none. That is why the second project is declared as the complement of
 * the first rather than a list of its own — a spec added tomorrow is claimed by
 * it without anybody saying so.
 */

const enjoyRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.join(enjoyRoot, "..");

const E2E_DIR = path.join(enjoyRoot, "e2e");
const WORKFLOW = path.join(
  repoRoot,
  ".github",
  "workflows",
  "test-enjoy-app.yml"
);

type Pattern = string | RegExp;

const patterns = (value: Pattern | Pattern[] | undefined): Pattern[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const matches = (candidates: Pattern[], file: string) =>
  candidates.some((candidate) =>
    candidate instanceof RegExp ? candidate.test(file) : file.endsWith(candidate)
  );

/**
 * Whether a project would run a spec. A project with no `testMatch` of its own
 * takes Playwright's default, which is every spec file in the directory — the
 * only shape of default this reasoning has to cover, since `testDir` is set
 * once for the whole config.
 */
const claims = (
  project: { testMatch?: Pattern | Pattern[]; testIgnore?: Pattern | Pattern[] },
  file: string
) =>
  (project.testMatch === undefined ||
    matches(patterns(project.testMatch), file)) &&
  !matches(patterns(project.testIgnore), file);

const projects = () => config.projects ?? [];

const specFiles = () =>
  fs
    .readdirSync(E2E_DIR, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith(".spec.ts"));

/**
 * The workflow read as the steps it would actually run: one string per `- ` at
 * step indentation, with commented-out lines dropped first. Both halves matter.
 * A step parked behind a `#` is a step CI does not run, and a step is the unit
 * `continue-on-error` applies to — asked of the file as a whole, the question
 * cannot tell which step was let off.
 */
const workflowSteps = () =>
  fs
    .readFileSync(WORKFLOW, "utf-8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n")
    .split(/^      - /m)
    .slice(1);

/** The scripts that run a Playwright project, which is to say a whole suite. */
const suiteScripts = (enjoyScripts: Record<string, string>) =>
  Object.entries(enjoyScripts)
    .filter(([, script]) => script.includes("--project="))
    .map(([name]) => name);

const scripts = (packageJson: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(packageJson, "utf-8")).scripts ?? {};

test("claims every spec in the directory for exactly one project", () => {
  const unclaimed: string[] = [];
  const contested: string[] = [];

  for (const file of specFiles()) {
    const owners = projects().filter((project) => claims(project, file));
    if (owners.length === 0) unclaimed.push(file);
    if (owners.length > 1) contested.push(file);
  }

  expect(
    unclaimed,
    "Spec files no project in playwright.config.ts runs, so no script and no " +
      "CI job runs them either."
  ).toEqual([]);
  expect(
    contested,
    "Spec files more than one project runs, which spends a CI run twice on " +
      "the same assertions."
  ).toEqual([]);
});

test("runs every project from a script of its own", () => {
  const enjoyScripts = scripts(path.join(enjoyRoot, "package.json"));

  const unrun = projects()
    .map((project) => project.name)
    .filter(
      (name) =>
        !Object.values(enjoyScripts).some((script) =>
          script.includes(`--project=${name}`)
        )
    );

  expect(
    unrun,
    "Playwright projects that no script in enjoy/package.json runs. Add a " +
      "`test:<project>` script calling `playwright test --project=<project>`."
  ).toEqual([]);
});

test("calls every one of those scripts from the workflow, as a gate", () => {
  const enjoyScripts = scripts(path.join(enjoyRoot, "package.json"));
  const rootScripts = scripts(path.join(repoRoot, "package.json"));
  const steps = workflowSteps();

  const uncalled: string[] = [];
  const ungated: string[] = [];

  for (const name of suiteScripts(enjoyScripts)) {
    const fromRoot = Object.entries(rootScripts).find(([, script]) =>
      script.includes(`workspace enjoy ${name}`)
    );
    const running = fromRoot
      ? steps.filter((step) => step.includes(`yarn ${fromRoot[0]}`))
      : [];

    if (running.length === 0) uncalled.push(name);
    if (running.some((step) => step.includes("continue-on-error: true")))
      ungated.push(name);
  }

  expect(
    uncalled,
    "Suite scripts the workflow never calls. Each needs a root script " +
      "delegating to it, and a step in .github/workflows/test-enjoy-app.yml " +
      "running that root script."
  ).toEqual([]);
  expect(
    ungated,
    "Suite scripts the workflow runs behind `continue-on-error: true`, so a " +
      "failing test in them leaves the workflow green — a suite that is run " +
      "but cannot fail anything is not a gate."
  ).toEqual([]);
});
