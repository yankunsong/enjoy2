import { expect, test } from "@playwright/test";
import ts from "typescript";
import fs from "fs";
import path from "path";
import { channels } from "../src/web/browser/channels";
import type { Namespace, Spec } from "../src/web/browser/channels";

/**
 * The two declarations of the main process interface, made to agree.
 *
 * `src/preload.ts` builds `window.__ENJOY_APP__` under Electron; the browser
 * distribution builds the same object from `src/web/browser/channels.ts` and
 * `electron-only.ts`. Nothing has ever made the two sides match, and adding a
 * feature to one and not the other produces an interface that works in Desktop
 * Enjoy and fails at runtime in Local Web Enjoy — with an error naming a
 * missing property rather than a missing channel. That is how the Diary first
 * broke while it was being built, which is what this test exists to prevent.
 *
 * What is compared is the namespaces, not the methods. A namespace is the unit
 * a feature arrives as (`diaries`, `documents`), and it is a whole namespace
 * that gets forgotten; within one, the browser side deliberately says different
 * things from Electron — a method it can answer honestly, a rejection naming
 * itself where it cannot — and comparing those would be fighting the design.
 *
 * The asymmetry that is legitimate is `electron-only.ts`: the namespaces with
 * no main process handler on the browser side live there on purpose. The test
 * reads that file rather than keeping a list of its own, so declaring a
 * namespace Electron-only is the same act as implementing it.
 *
 * One namespace is outside the comparison in both directions: `bridge.ts`
 * installs `localFile` alongside these two, and it is the browser's own — a
 * way to hand the local server bytes the browser is holding, which under
 * Electron is not a thing that has to happen. The interface type marks it
 * optional for that reason. It is an addition rather than a copy of anything
 * preload declares, so neither list is missing it.
 */

const enjoyRoot = process.cwd();

const PRELOAD = path.join(enjoyRoot, "src", "preload.ts");
const ELECTRON_ONLY = path.join(
  enjoyRoot,
  "src",
  "web",
  "browser",
  "electron-only.ts"
);

test("declares every namespace the preload script exposes, or says why not", () => {
  expect(
    missingFrom(preloadNamespaces(), browserNamespaces()),
    "Namespaces src/preload.ts exposes that the browser distribution has " +
      "not got. Add each to src/web/browser/channels.ts, or to " +
      "electron-only.ts if the local server has no handler for it."
  ).toEqual([]);
});

test("exposes no namespace of its own that the preload script has not got", () => {
  expect(
    missingFrom(browserNamespaces(), preloadNamespaces()),
    "Namespaces the browser distribution declares that src/preload.ts does " +
      "not expose, so Desktop Enjoy has nothing behind them."
  ).toEqual([]);
});

test("counts a namespace declared Electron-only as answered for", () => {
  // `dialog` has no main process handler on the browser side, so it appears in
  // electron-only.ts and nowhere in the channel table. The comparison above
  // must read that as answered rather than missing, or every namespace that
  // lives there would fail.
  expect(electronOnlyNamespaces()).toContain("dialog");
  expect(namespacesOf(channels)).not.toContain("dialog");

  expect(missingFrom(["dialog"], browserNamespaces())).toEqual([]);
});

test("would have caught the Diary being added to only one side", () => {
  // The failure this file was written for, run as an experiment rather than
  // asserted from memory: take `diaries` off the browser side and the same
  // comparison that passes above has to name the namespace that went.
  const withoutDiaries = browserNamespaces().filter(
    (namespace) => namespace !== "diaries"
  );

  expect(missingFrom(preloadNamespaces(), withoutDiaries)).toEqual(["diaries"]);
});

/** Those of `namespaces` that `declared` has not got. */
const missingFrom = (namespaces: string[], declared: string[]) =>
  namespaces.filter((namespace) => !declared.includes(namespace));

/**
 * The namespaces the browser distribution answers for: the channel table's own,
 * plus those it declares Electron-only.
 */
const browserNamespaces = () => [
  ...namespacesOf(channels),
  ...electronOnlyNamespaces(),
];

/**
 * The channel table is read as the value it is — it is plain data with no
 * imports, so the test can hold the real thing rather than a reading of it. A
 * `Spec` is one method; anything else with children is a namespace.
 */
function namespacesOf(namespace: Namespace, prefix = ""): string[] {
  return Object.entries(namespace).flatMap(([name, value]) => {
    if (typeof (value as Spec).kind === "string") return [];

    const qualified = prefix + name;
    return [qualified, ...namespacesOf(value as Namespace, `${qualified}.`)];
  });
}

/**
 * The other two are read as source. Neither can be imported: the preload script
 * asks for `electron`, which exists only inside a running Electron process, and
 * `electron-only.ts` asks for a JSON module the test runner will not load. That
 * is also what keeps the test honest about its cost — it reads two files and
 * needs no packaged build, so it runs in CI beside the linter.
 */
const preloadNamespaces = () =>
  namespacesIn(
    PRELOAD,
    // The second argument to `contextBridge.exposeInMainWorld` is the whole
    // interface, written out as one literal.
    (source) =>
      only(
        source,
        (node): node is ts.CallExpression =>
          ts.isCallExpression(node) &&
          node.expression.getText(source).endsWith("exposeInMainWorld")
      ).arguments[1],
    // Preload spells every namespace out and writes every method as an arrow
    // function, so it builds neither by calling anything.
    { namespaces: [], methods: [] }
  );

const electronOnlyNamespaces = () =>
  namespacesIn(
    ELECTRON_ONLY,
    (source) =>
      only(
        source,
        (node): node is ts.VariableDeclaration =>
          ts.isVariableDeclaration(node) &&
          node.name.getText(source) === "electronOnly"
      ).initializer,
    {
      // `unavailable("system.proxy", [...])` builds an object of methods that
      // each reject — a namespace where it is assigned to a name, and the same
      // methods where it is spread into one.
      namespaces: ["unavailable"],
      // These three build a single method against the push bus.
      methods: ["subscribe", "unsubscribe", "unsubscribeOne"],
    }
  );

/** The calls a file uses to build a namespace, and to build a single method. */
type Builders = { namespaces: string[]; methods: string[] };

/** The namespaces declared by the object literal `locate` points at. */
const namespacesIn = (
  file: string,
  locate: (source: ts.SourceFile) => ts.Expression | undefined,
  builders: Builders
) =>
  cached(file, (source) => {
    const shape = locate(source);
    if (!shape || !ts.isObjectLiteralExpression(shape)) {
      throw new Error(`Could not find the interface declared in ${file}`);
    }

    return declaredNamespaces(shape, source, builders);
  });

/**
 * The namespaces an object literal declares, qualified by the path to them.
 *
 * Every property is classified, and one the parser has not been taught stops
 * the run rather than being passed over. That is the whole point: a guard that
 * quietly reads a namespace as a method still passes, and goes on passing while
 * the two interfaces drift apart — which is the failure it was written to catch,
 * arriving through the guard itself.
 */
function declaredNamespaces(
  object: ts.ObjectLiteralExpression,
  source: ts.SourceFile,
  builders: Builders,
  prefix = ""
): string[] {
  return object.properties.flatMap((property) => {
    // A method written elsewhere and brought in by name, or the methods of a
    // built object merged into this one. Neither declares a namespace here.
    if (ts.isShorthandPropertyAssignment(property)) return [];
    if (ts.isSpreadAssignment(property)) {
      return built(property.expression, builders.namespaces, source)
        ? []
        : refuse(property, source, prefix);
    }

    if (!ts.isPropertyAssignment(property)) return refuse(property, source, prefix);

    const qualified = prefix + property.name.getText(source);
    const value = property.initializer;

    if (ts.isObjectLiteralExpression(value)) {
      return [
        qualified,
        ...declaredNamespaces(value, source, builders, `${qualified}.`),
      ];
    }

    if (built(value, builders.namespaces, source)) return [qualified];

    // A method, or a value the interface answers with directly.
    if (
      ts.isArrowFunction(value) ||
      ts.isFunctionExpression(value) ||
      ts.isIdentifier(value) ||
      ts.isPropertyAccessExpression(value) ||
      ts.isLiteralExpression(value) ||
      built(value, builders.methods, source)
    ) {
      return [];
    }

    return refuse(property, source, prefix);
  });
}

/** Whether an expression is a call to one of the named builders. */
const built = (
  expression: ts.Expression,
  builders: string[],
  source: ts.SourceFile
) =>
  ts.isCallExpression(expression) &&
  builders.includes(expression.expression.getText(source));

const refuse = (
  property: ts.ObjectLiteralElementLike,
  source: ts.SourceFile,
  prefix: string
): never => {
  throw new Error(
    `Cannot tell whether \`${prefix}${property.getText(source).split("\n")[0]}\`` +
      ` in ${source.fileName} is a namespace or a method. Teach this test the ` +
      `shape it is written in — leaving it unclassified would let a namespace ` +
      `go missing without the comparison noticing.`
  );
};

/** The one node in the file the predicate accepts, and not the first of many. */
function only<T extends ts.Node>(
  source: ts.SourceFile,
  predicate: (node: ts.Node) => node is T
): T {
  const found: T[] = [];

  const visit = (node: ts.Node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (found.length !== 1) {
    throw new Error(
      `Expected one declaration of the interface in ${source.fileName}, ` +
        `found ${found.length}. A second one would go uncompared.`
    );
  }

  return found[0];
}

const readings = new Map<string, string[]>();

/** Each file is parsed once, however many assertions ask what is in it. */
function cached(file: string, read: (source: ts.SourceFile) => string[]) {
  if (!readings.has(file)) {
    readings.set(
      file,
      read(
        ts.createSourceFile(
          file,
          fs.readFileSync(file, "utf8"),
          ts.ScriptTarget.Latest,
          true
        )
      )
    );
  }

  return readings.get(file)!;
}
