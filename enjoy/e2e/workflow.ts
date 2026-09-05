/**
 * The workflow, read the way CI would run it.
 *
 * Two specs ask questions of the same file — `suites.spec.ts` about the test
 * suites, `gates.spec.ts` about lint and typecheck — and both need the same
 * three things: where the workflow is, what its steps are, and what a
 * package.json's scripts are. Kept in one place so a change in how a step is
 * spelled reaches both, rather than one of them going quietly blind.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const enjoyRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const repoRoot = path.join(enjoyRoot, "..");

export const WORKFLOW = path.join(
  repoRoot,
  ".github",
  "workflows",
  "test-enjoy-app.yml"
);

/**
 * The workflow read as the steps it would actually run: one string per `- ` at
 * step indentation, with commented-out lines dropped first. Both halves matter.
 * A step parked behind a `#` is a step CI does not run, and a step is the unit
 * `continue-on-error` applies to — asked of the file as a whole, the question
 * cannot tell which step was let off.
 */
export const workflowSteps = () =>
  fs
    .readFileSync(WORKFLOW, "utf-8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n")
    .split(/^ {6}- /m)
    .slice(1);

export const scripts = (packageJson: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(packageJson, "utf-8")).scripts ?? {};

/**
 * The steps that run a root script, and whether any of them is let off failing
 * the build. `name` is a script in enjoy/package.json; the root script that
 * delegates to it is what the workflow actually calls.
 */
export const stepsRunning = (name: string) => {
  const rootScripts = scripts(path.join(repoRoot, "package.json"));
  const fromRoot = Object.entries(rootScripts).find(([, script]) =>
    script.includes(`workspace enjoy ${name}`)
  );

  return fromRoot
    ? workflowSteps().filter((step) => step.includes(`yarn ${fromRoot[0]}`))
    : [];
};

/**
 * The `paths:` filter under each trigger, as the list of globs it holds. Read
 * textually rather than through a YAML parser: the only dependency that would
 * bring one is transitive, and the shape asked of the file here is one
 * indented list per `paths:`.
 */
export const triggerPaths = () => {
  const lines = fs.readFileSync(WORKFLOW, "utf-8").split("\n");
  const filters: string[][] = [];

  lines.forEach((line, index) => {
    if (line.trimEnd() !== "    paths:") return;

    const globs: string[] = [];
    for (const rest of lines.slice(index + 1)) {
      const entry = rest.trim();
      if (entry.startsWith("#")) continue;
      if (!entry.startsWith("- ")) break;
      globs.push(entry.slice(2).replace(/^"|"$/g, ""));
    }
    filters.push(globs);
  });

  return filters;
};
