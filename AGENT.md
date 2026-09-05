# How this fork is used

This is a personal fork, run by one person on one machine. It exists to be
used, not to be shipped: there are no other users, no releases, and no support
obligations to anyone.

These are this repository's conventions, not the project's. If you forked it to
run Enjoy some other way — as the Electron app, against enjoy.bot, on more than
one machine — then rewriting this file is the first change to make, before the
rules below start costing you work they were never meant to cost.

## Only Local Web Enjoy is run

Of the three distributions the domain docs name, only **Local Web Enjoy** is
ever started here:

```
yarn workspace enjoy web
```

**Desktop Enjoy** — the Electron build — is not run, not packaged, and not
tested. **Hosted Enjoy** (enjoy.bot) is not used at all: there is no account,
and `fake-web-api.ts` answers every call the code would have made to it.

## What that means for feature work

Build and verify every feature in Local Web Enjoy. A change is done when it
works in the browser; that is the whole bar.

- **Do not add work to keep Electron running.** If a change would need an
  Electron-only code path, an Electron-only build step, or an Electron-only
  test, leave it out and say so rather than writing it speculatively.
- **Do not add work for Hosted Enjoy.** No syncing, no accounts, no uploading,
  no `webApi` call sites beyond the ones already there.
- **Breaking the Electron build is acceptable** when the alternative is
  carrying a second code path for a distribution nobody starts. Prefer not to
  break it gratuitously, but do not design around it.
- Main process code still runs unchanged under `fake-electron.ts`, so keep
  writing it as main process code. The stand-in fakes only `ipcMain`,
  `app.getPath` and `app.isPackaged`; anything else reached for will fail here.
  See `enjoy/src/web/README.md`.

## The other workspaces

`1000-hours` and `1000h-portal` are untouched by this. Nothing above applies to
them.

## Where the data lives

Local Web Enjoy keeps its settings in `~/.config/enjoy-local-web/settings.json`
and everything else under the Library it names — by default
`~/Documents/EnjoyLibrary`, with the database and media files under the local
user's `10000001/` subdirectory. None of it is inside this repository, so
deleting the repository leaves it behind.
