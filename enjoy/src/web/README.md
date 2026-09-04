# Local Web Enjoy

Everything Local Web Enjoy adds lives here. It runs Desktop Enjoy's main process
code in a plain Node process and serves the same renderer to a browser, with no
Electron and no account.

Run it with `yarn workspace enjoy web`, which starts both halves:

## The local server

- `local.mjs` — the launcher, and the local server on its own. Runs the
  TypeScript through a Vite dev server in SSR mode, which is also what swaps the
  stand-ins in. No build step.
- `fake-electron.ts` — stands in for the `electron` package. Only `ipcMain`,
  `app.getPath` and `app.isPackaged` are faked; main process code that reaches
  for anything else will fail here and only here. See [ADR 0001](../../docs/adr/0001-fake-electron-module-for-local-web.md).
- `fake-window.ts` — stands in for `@main/window`, reproducing the one thing the
  models want from it: the push outlet.
- `push.ts` — the single sink both push outlets funnel into.
- `server.ts` — the HTTP surface, and the only seam this feature is tested on.
  `POST /ipc/:channel` is the one the browser bridge talks to, `GET /media/...`
  serves Media the way the `enjoy://` protocol does under Electron,
  `POST /files/:name` takes in a file the browser has only the bytes of, and
  `GET /health` exists so "runs without Electron" is something a test can check
  rather than something the README merely claims.
- `library.ts` — the Library half of that surface, including byte ranges, without
  which seeking inside a Media re-downloads it, and the content type, without
  which a player has no provider to hand it to.
- `json.ts` — the one envelope everything above answers in.
- `staging.ts` — where a file dragged into the browser lands so that an import
  can name it. Emptied at startup; see [ADR 0005](../../docs/adr/0005-stage-dropped-files-before-importing.md).
- `bootstrap.ts` — seeds the local user and the profile record, and registers
  the handlers served: settings, the database (which registers every model
  handler itself), and the three behind playing a Media — waveform, ffmpeg and
  echogarden.
- `fake-web-api.ts` — stands in for `@/api`, Hosted Enjoy's client, on both
  sides of the wire. Every method resolves to an empty object, except the three
  call sites that read the result rather than merely holding it.

## The browser

- `start.mjs` — the one command. Starts the local server, then a second Vite dev
  server for the frontend, with hot module replacement and no build step. It
  proxies `/ipc/`, `/media/` and `/files/` across, so the browser sees one
  origin.
- `browser/main.ts` — the entry point: install the bridge, then hand over to the
  renderer, which reads the bridge while its own modules are still evaluating.
- `browser/bridge.ts` — builds `window.__ENJOY_APP__`, the object the preload
  script exposes under Electron.
- `browser/channels.ts` — the declaration table almost all of it is generated
  from. Keep it in step with `src/preload.ts`.
- `browser/electron-only.ts` — the five namespaces with no browser counterpart:
  file dialogs, shell calls, the embedded browser view, application lifecycle,
  window controls. Each method is mapped, subscribed, or explicitly unavailable —
  never a silent no-op. `showOpenDialog` is mapped: it opens the browser's own
  picker and answers in paths, the currency Electron's dialog answers in.
- `browser/ipc.ts`, `browser/events.ts` — the two things the bridge is made of: a
  call across to the local server, and a subscription to what it pushes back.
  Nothing pushes yet; carrying the server's sink across is a later ticket.
- `browser/media-url.ts` — the one thing neither side can say in the other's
  terms: a Library address. Rewritten both ways across `ipc.ts`, so the renderer
  only sees addresses it can fetch and the main process only sees addresses it
  can resolve. See [ADR 0006](../../docs/adr/0006-rewrite-library-urls-at-the-bridge.md).
- `browser/files.ts` — sends a file's bytes to `POST /files/`, and is the whole
  of `EnjoyApp.localFile`, the one namespace the preload script has no
  counterpart for. `dialog.showOpenDialog` answers through it too, which is what
  makes the existing "local file" button work unchanged.

The renderer itself is shared whole, unpruned — see [ADR 0002](../../docs/adr/0002-reuse-entire-renderer.md).
`src/distribution.ts` is the one flag it reads. It decides which sidebar entries
to offer, and mounts `MediaDropImport` — the window-wide drop target, which
exists only here because under Electron a dropped file already has a path.
Pages that need a Hosted Enjoy account stay routable by address.

## Configuration

Four environment variables steer it, the first two shared with Desktop Enjoy:

| Variable | Meaning |
| --- | --- |
| `SETTINGS_PATH` | Directory holding `settings.json`. |
| `LIBRARY_PATH` | Where the Library goes. |
| `ENJOY_WEB_PORT` | Port for the local server; `0` picks a free one. Defaults to 7100. |
| `ENJOY_WEB_UI_PORT` | Port for the frontend; `0` picks a free one. Defaults to 7101. |

Both servers bind the loopback address only.

The local user is a fixed 8-digit id rather than a removal of the account
concept; that id is baked into Library paths and Recording UUIDs, so it is not a
constant you can edit. See [ADR 0003](../../docs/adr/0003-fake-local-user-instead-of-removing-accounts.md).

## Tests

`yarn workspace enjoy test:web` runs `e2e/web-server.spec.ts`, which drives the
local server's HTTP surface. That surface is the only seam this feature is
tested on; the browser half is judged by hand, by design — see issue #1.

Importing was verified by hand in the browser: dropping an audio file anywhere
in the app imports it and opens it, dropping a video does the same, the "local
file" button opens the browser's picker and imports what it returns, pasting an
absolute path imports without a byte crossing `/files/`, and seeking inside an
imported Media lands where it was dragged to.

The browser half of the previous ticket was verified by hand: the browser opens
on the main interface rather than the landing page, the sidebar offers no chat, course
or community entry, entering one of those addresses in the running app still
gets there (a cold deep link passes through the initialization gate and lands on
Home, as it does under Electron), an Electron-only
method names itself in the console, opening an external link and reloading both
work, editing a renderer file updates the page with nothing rebuilt, and neither
server answers on a non-loopback address.

## Known rough edges

A Media list does not notice an import until it is remounted, because it
refreshes from database transactions the main process pushes and nothing is
pushed to the browser yet. Importing opens the new Media, so this is invisible
until several files are imported at once. The push line is a later ticket.

The console carries a running commentary of degraded calls — the system proxy
settings the app reads at startup have no handler registered here, and every
Electron-only method that is out of reach names itself when called. That is the
trade [ADR 0004](../../docs/adr/0004-electron-only-namespaces-fail-loudly.md)
makes on purpose.
