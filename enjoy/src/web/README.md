# Local Web Enjoy — local server

Everything Local Web Enjoy adds lives here. It runs Desktop Enjoy's main process
code in a plain Node process and exposes it over HTTP, so the same renderer can
be served to a browser with no Electron and no account.

- `start.mjs` — the launcher. Runs the TypeScript through a Vite dev server in
  SSR mode, which is also what swaps the two stand-ins in. No build step.
- `fake-electron.ts` — stands in for the `electron` package. Only `ipcMain`,
  `app.getPath` and `app.isPackaged` are faked; main process code that reaches
  for anything else will fail here and only here. See [ADR 0001](../../docs/adr/0001-fake-electron-module-for-local-web.md).
- `fake-window.ts` — stands in for `@main/window`, reproducing the one thing the
  models want from it: the push outlet.
- `push.ts` — the single sink both push outlets funnel into.
- `server.ts` — the HTTP surface, and the only seam this feature is tested on.
  `POST /ipc/:channel` is the one the browser bridge talks to; `GET /health`
  exists so "runs without Electron" is something a test can check rather than
  something the README merely claims.
- `bootstrap.ts` — seeds the local user and the profile record, and registers
  the handlers served. Only the settings and database handlers so far.

Run it with `yarn workspace enjoy web:server`, test it with
`yarn workspace enjoy test:web`. Three environment variables steer it, the first
two shared with Desktop Enjoy:

| Variable | Meaning |
| --- | --- |
| `SETTINGS_PATH` | Directory holding `settings.json`. |
| `LIBRARY_PATH` | Where the Library goes. |
| `ENJOY_WEB_PORT` | Port to listen on; `0` picks a free one. Defaults to 7100. |

The local user is a fixed 8-digit id rather than a removal of the account
concept; that id is baked into Library paths and Recording UUIDs, so it is not a
constant you can edit. See [ADR 0003](../../docs/adr/0003-fake-local-user-instead-of-removing-accounts.md).
