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
  serves Media the way the `enjoy://` protocol does under Electron, and
  `GET /health` exists so "runs without Electron" is something a test can check
  rather than something the README merely claims.
- `library.ts` — the Library half of that surface, including byte ranges, without
  which seeking inside a Media re-downloads it.
- `bootstrap.ts` — seeds the local user and the profile record, and registers
  the handlers served. Only the settings and database handlers so far.

## The browser

- `start.mjs` — the one command. Starts the local server, then a second Vite dev
  server for the frontend, with hot module replacement and no build step. It
  proxies `/ipc/` and `/media/` across, so the browser sees one origin.
- `browser/main.ts` — the entry point: install the bridge, then hand over to the
  renderer, which reads the bridge while its own modules are still evaluating.
- `browser/bridge.ts` — builds `window.__ENJOY_APP__`, the object the preload
  script exposes under Electron.
- `browser/channels.ts` — the declaration table almost all of it is generated
  from. Keep it in step with `src/preload.ts`.
- `browser/electron-only.ts` — the five namespaces with no browser counterpart:
  file dialogs, shell calls, the embedded browser view, application lifecycle,
  window controls. Each method is mapped, subscribed, or explicitly unavailable —
  never a silent no-op.
- `browser/ipc.ts`, `browser/events.ts` — the two things the bridge is made of: a
  call across to the local server, and a subscription to what it pushes back.
  Nothing pushes yet; carrying the server's sink across is a later ticket.
- `browser/fake-web-api.ts` — stands in for `@/api`, Hosted Enjoy's client. Every
  method resolves to an empty object, except the three call sites that read the
  result rather than merely holding it.

The renderer itself is shared whole, unpruned — see [ADR 0002](../../docs/adr/0002-reuse-entire-renderer.md).
`src/distribution.ts` is the one flag it reads, and it only decides which
sidebar entries to offer. Pages that need a Hosted Enjoy account stay routable
by address.

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

The browser half of this ticket was verified by hand: the browser opens on the
main interface rather than the landing page, the sidebar offers no chat, course
or community entry, entering one of those addresses in the running app still
gets there (a cold deep link passes through the initialization gate and lands on
Home, as it does under Electron), an Electron-only
method names itself in the console, opening an external link and reloading both
work, editing a renderer file updates the page with nothing rebuilt, and neither
server answers on a non-loopback address.

## Known rough edges

The console carries a running commentary of degraded calls — the system proxy
settings the app reads at startup have no handler registered here, and every
Electron-only method that is out of reach names itself when called. That is the
trade [ADR 0004](../../docs/adr/0004-electron-only-namespaces-fail-loudly.md)
makes on purpose.
