# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In this repo, also check `<workspace>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is multi-context: a Yarn workspace monorepo whose contexts are the
top-level workspace directories, not subdirectories of a shared `src/`.

```
/
├── CONTEXT-MAP.md                     ← points at the three CONTEXT.md files below
├── docs/adr/                          ← system-wide decisions, spanning workspaces
├── enjoy/
│   ├── CONTEXT.md                     ← Electron app: media library, transcription,
│   │                                    shadowing, pronunciation assessment
│   └── docs/adr/                      ← context-specific decisions
├── 1000-hours/
│   ├── CONTEXT.md                     ← VitePress book site
│   └── docs/adr/
└── 1000h-portal/
    ├── CONTEXT.md                     ← Nuxt page generator
    └── docs/adr/
```

For contrast, a single-context repo (most repos) looks like this:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
