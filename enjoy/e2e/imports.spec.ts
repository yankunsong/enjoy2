import { expect, test } from "@playwright/test";
import ts from "typescript";
import fs from "fs";
import path from "path";
import { isBuiltin } from "module";
import { fileURLToPath } from "url";

/**
 * Every import in the suite, checked against what the package actually
 * exports and against what the workspace actually declares.
 *
 * Both Electron specs opened with `ElectronApplication` and `Page` in a value
 * import. They are types, so under ESM the module has no such export and the
 * file does not load at all — Playwright reported `No tests found` and the
 * whole of Desktop Enjoy's coverage sat dead for as long as the line had been
 * written that way. Nothing said so: a spec that never loads looks the same
 * from CI as a suite with nothing in it.
 *
 * The same two files imported from `playwright`, which the workspace does not
 * declare. It resolves today only because `@playwright/test` depends on it, so
 * a hoisting change is all it would take to make the import vanish.
 *
 * Both are questions a machine can ask of the source, so it asks them here
 * rather than waiting for someone to read the line: for each bare specifier,
 * does the package export every name imported as a value, and is it a
 * dependency of the workspace or a builtin.
 *
 * The export question is asked by importing the package, which is the only
 * answer that counts — a declaration file can promise an export the built
 * module has not got, and it was a declaration file that made the original
 * line look right. It does mean a package's top-level code runs inside this
 * test, so the suite's own imports are held to being safe to load; the
 * neighbouring channels.spec.ts reads its subject as source for the opposite
 * reason, that the preload script cannot be loaded outside Electron at all.
 */

const enjoyRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const E2E_DIR = path.join(enjoyRoot, "e2e");

type ValueImport = {
  file: string;
  specifier: string;
  /** The name as the package exports it, not as the file renames it. */
  exported: string;
};

const sourceFiles = () =>
  fs
    .readdirSync(E2E_DIR, { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith(".ts"));

const read = (file: string) =>
  fs.readFileSync(path.join(E2E_DIR, file), "utf-8");

/** A bare specifier is a package; anything relative is our own source. */
const isPackage = (specifier: string) =>
  !specifier.startsWith(".") && !specifier.startsWith("/");

const packageName = (specifier: string) =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];

/** Every `import ... from "<package>"` in a file, with the package it names. */
const packageImports = (file: string, source: string) =>
  ts
    .createSourceFile(file, source, ts.ScriptTarget.ESNext, true)
    .statements.filter(ts.isImportDeclaration)
    .flatMap((statement) =>
      ts.isStringLiteral(statement.moduleSpecifier) &&
      isPackage(statement.moduleSpecifier.text)
        ? [{ statement, specifier: statement.moduleSpecifier.text }]
        : []
    );

/**
 * The exports a file asks a package for by name, as values. Type-only imports
 * are skipped in all three spellings — the whole clause (`import type {}`),
 * the single specifier (`{ type Foo }`) and a type-only default — because
 * those are erased before anything runs and so cannot fail. A namespace
 * import (`import * as ns`) asks for nothing in particular and so cannot
 * either; a default import asks for `default`, which is a name a package can
 * be missing exactly like any other.
 */
const valueImports = (file: string, source: string): ValueImport[] => {
  const found: ValueImport[] = [];

  for (const { statement, specifier } of packageImports(file, source)) {
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;

    if (clause.name) found.push({ file, specifier, exported: "default" });

    const bindings = clause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      found.push({
        file,
        specifier,
        exported: (element.propertyName ?? element.name).text,
      });
    }
  }

  return found;
};

/** Those of `imports` whose package does not export the name at runtime. */
const notExported = async (imports: ValueImport[]) => {
  const missing: string[] = [];

  for (const { file, specifier, exported } of imports) {
    const module = await import(specifier);
    if (!(exported in module))
      missing.push(`${file}: ${exported} from "${specifier}"`);
  }

  return missing;
};

/** Those of `names` that are neither a dependency of enjoy nor a builtin. */
const notDeclared = (names: string[]) => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(enjoyRoot, "package.json"), "utf-8")
  );
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);

  return [
    ...new Set(
      names.filter((name) => !declared.has(name) && !isBuiltin(name))
    ),
  ];
};

test("imports only names the package exports at runtime", async () => {
  const missing = await notExported(
    sourceFiles().flatMap((file) => valueImports(file, read(file)))
  );

  expect(
    missing,
    "Names imported as values that the package does not export at runtime, " +
      "which makes the whole file fail to load and its tests silently stop " +
      "running. A type is the usual cause: write `import type { ... }`."
  ).toEqual([]);
});

test("imports only from packages the workspace declares", () => {
  const undeclared = notDeclared(
    sourceFiles().flatMap((file) =>
      packageImports(file, read(file)).map(({ specifier }) =>
        packageName(specifier)
      )
    )
  );

  expect(
    undeclared,
    "Packages imported without being declared in enjoy/package.json. These " +
      "resolve only as long as something else happens to depend on them, and " +
      "vanish on any change to how the workspace hoists."
  ).toEqual([]);
});

test("would have caught the Electron specs importing a type as a value", async () => {
  // The failure this file was written for, run as an experiment rather than
  // asserted from memory. The line is the one both specs opened with, against
  // a package the workspace does declare, so the experiment turns on the
  // mistake rather than on where the package came from.
  const asItWas = `import { ElectronApplication, Page, _electron as electron } from "@playwright/test";`;

  expect(
    await notExported(valueImports("main.spec.ts", asItWas))
  ).toEqual([
    `main.spec.ts: ElectronApplication from "@playwright/test"`,
    `main.spec.ts: Page from "@playwright/test"`,
  ]);
});

test("would have caught them importing from a package nothing declares", () => {
  // The other half of the same line: `playwright` is not a dependency of the
  // workspace, and resolved only because `@playwright/test` brought it along.
  const asItWas = `import { _electron as electron } from "playwright";`;

  expect(
    notDeclared(
      packageImports("main.spec.ts", asItWas).map(({ specifier }) =>
        packageName(specifier)
      )
    )
  ).toEqual(["playwright"]);
});
