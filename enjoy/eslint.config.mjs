import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

// ESLint 9 reads this file and nothing else. The `.eslintrc.json` it replaces
// had not linted a line since the major bump, because eslintrc is not a config
// format ESLint 9 looks for.
//
// Severity here is a gate, not an opinion: an `error` fails CI, so a rule is an
// error only where the codebase already holds to it. The one rule with a
// standing backlog is `no-unused-vars`, and it warns — see its note below.
export default [
  {
    // Everything generated, vendored, or written by a test run. Linting these
    // says nothing about the code we write and drowns what does.
    ignores: [
      ".vite/**",
      "out/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "tmp/**",
      "lib/**",
      "src/main/db/migrations/**",
    ],
  },
  js.configs.recommended,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.electron,
  importPlugin.flatConfigs.typescript,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    settings: {
      // `electron/renderer` is a subpath export of the electron package; the
      // node resolver cannot see it, and it is as much a core module here as
      // `electron` itself.
      "import/core-modules": ["electron", "electron/renderer"],
      "import/resolver": {
        typescript: {
          project: "tsconfig.json",
        },
      },
    },
    rules: {
      ...tsPlugin.configs["eslint-recommended"].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      // `let { a, b } = params` where only some of the names are reassigned
      // later. Splitting the pattern in two to satisfy the rule reads worse
      // than the pattern does; flag it only when the whole pattern is const.
      "prefer-const": ["error", { destructuring: "all" }],
      // `onSave && onSave(note)` is how this codebase calls an optional
      // callback. It is an expression statement on purpose, in a hundred
      // places, and reads fine.
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
      // shadcn/ui components are generated with `interface Props extends
      // React.ComponentProps<...> {}` — an empty body that exists to name the
      // type. Empty object *types* are still an error; empty extends is not.
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],
      // A backlog, not a standard: 113 unused bindings predate this config, and
      // removing them is its own change — an unused binding can hold a
      // side-effecting initializer. So it warns rather than errors, and the
      // `lint` script pins `--max-warnings` to the count that exists today: the
      // backlog is allowed to stay and allowed to shrink, and one more fails
      // the build. Lower the pin as it comes down.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    // Plain JS: config files, scripts, and the `.mjs` entry points. They get
    // the recommended core rules and nothing TypeScript-shaped.
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // This file imports its plugins from `enjoy/node_modules`, which the
      // plugin's node resolver does not walk from an `.mjs` at the root.
      "import/no-unresolved": "off",
    },
  },
  {
    // zx scripts, run through `zx`, which injects `$`, `fs`, `path`, `chalk`
    // and friends as globals rather than imports.
    files: ["scripts/**/*.mjs", "src/main/db/create-migration.mjs"],
    languageOptions: {
      globals: {
        $: "readonly",
        argv: "readonly",
        cd: "readonly",
        chalk: "readonly",
        echo: "readonly",
        fetch: "readonly",
        fs: "readonly",
        glob: "readonly",
        os: "readonly",
        path: "readonly",
        question: "readonly",
        sleep: "readonly",
        which: "readonly",
        within: "readonly",
        YAML: "readonly",
      },
    },
  },
];
