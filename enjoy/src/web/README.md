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
- `events.ts` — `GET /events`, which carries that sink to the browser as
  server-sent events. See [ADR 0007](../../docs/adr/0007-push-over-sse-keyed-by-channel.md).
- `server.ts` — the HTTP surface, and the only seam this feature is tested on.
  `POST /ipc/:channel` is the one the browser bridge talks to, `GET /media/...`
  serves Media the way the `enjoy://` protocol does under Electron,
  `POST /files/:name` takes in a file the browser has only the bytes of,
  `GET /events` streams what the main process pushes, and
  `GET /health` exists so "runs without Electron" is something a test can check
  rather than something the README merely claims.
- `library.ts` — the Library half of that surface, including byte ranges, without
  which seeking inside a Media re-downloads it, and the content type, without
  which a player has no provider to hand it to.
- `json.ts` — the one envelope everything above answers in.
- `binary.ts` — the one thing a JSON argument list cannot carry. A recording
  made in the browser is bytes and nothing else, and so is the audio Alignment
  reads; both travel inside the argument list as base64, carrying which kind
  they are. Both halves of the encoding live here so the wire form cannot
  drift. See [ADR 0008](../../docs/adr/0008-binary-arguments-travel-inside-the-argument-list.md).
- `traverse.ts` — the one walk both bridge transforms take through an argument
  list, since both look for their own thing in the same places.
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
  proxies `/ipc/`, `/media/`, `/files/` and `/events` across, so the browser
  sees one origin.
- `browser/main.ts` — the entry point: install the bridge, subscribe to the push
  channel, then hand over to the renderer, which reads the bridge while its own
  modules are still evaluating.
- `browser/bridge.ts` — builds `window.__ENJOY_APP__`, the object the preload
  script exposes under Electron.
- `browser/channels.ts` — the declaration table almost all of it is generated
  from. Keep it in step with `src/preload.ts`.
- `browser/electron-only.ts` — the six namespaces the local server has no
  handler for: file dialogs, shell calls, the embedded browser view, application
  lifecycle, window controls, and the system, whose handlers live in the
  `@main/window` module `fake-window.ts` stands in for. Each method is mapped,
  subscribed, or explicitly unavailable — never a silent no-op. `showOpenDialog`
  is mapped: it opens the browser's own picker and answers in paths, the
  currency Electron's dialog answers in. So is the microphone gate the record
  button reads: the browser raises that prompt itself, and what is left to
  answer is whether the permission has been refused outright.
- `browser/ipc.ts`, `browser/events.ts` — the two things the bridge is made of: a
  call across to the local server, and a subscription to what it pushes back.
  The call is where an argument's bytes are encoded, alongside its addresses.
  The subscription is one `EventSource` on `/events`, dispatched by the channel
  name the message carries, which is what lets every `onState(callback)`-shaped
  signature survive the move unchanged.
- `browser/media-url.ts` — the one thing neither side can say in the other's
  terms: a Library address. Rewritten both ways across `ipc.ts`, and on the way
  in across `events.ts`, so the renderer only sees addresses it can fetch and
  the main process only sees addresses it can resolve. See [ADR 0006](../../docs/adr/0006-rewrite-library-urls-at-the-bridge.md).
- `browser/files.ts` — sends a file's bytes to `POST /files/`, and is the whole
  of `EnjoyApp.localFile`, the one namespace the preload script has no
  counterpart for. `dialog.showOpenDialog` answers through it too, which is what
  makes the existing "local file" button work unchanged.

The renderer itself is shared whole, unpruned — see [ADR 0002](../../docs/adr/0002-reuse-entire-renderer.md).
`src/distribution.ts` is the one flag it reads. It decides which sidebar entries
to offer, and mounts `MediaDropImport` — the window-wide drop target, which
exists only here because under Electron a dropped file already has a path. It
does not open what it imported: the list that entry lands in refreshes itself
now, and that navigation was only ever standing in for the push line.
Pages that need a Hosted Enjoy account stay routable by address.

## Transcription

Transcription goes to OpenAI on the user's own key; the Hosted Enjoy engines
stay selectable but need an account, and the local Whisper engine is gone
along with the model downloads it needed. Alignment is untouched by any of
that — it reads the audio signal, needs no model and no network, and is the
only source of a Timeline.

One Media yields two transcodes and both are needed. `echogarden.transcode`
writes the 16 kHz WAV Alignment reads. `ffmpeg.compressForUpload` writes a
16 kHz mono Opus copy, and that is the one uploaded: an uncompressed WAV
crosses OpenAI's 25 MB limit after under seven minutes of stereo, where the
copy holds over two hours. Neither is spare work for the other.

## Assessment

Phoneme-level scoring runs on the user's own Azure Speech resource, set as a key
and a region under Preferences → Advanced. Desktop Enjoy asks Hosted Enjoy for a
short-lived authorization token against an account instead; with a key there is
no token to fetch, and asking anyway would come back as the empty object
`fake-web-api.ts` answers with, leaving the failure to surface deep inside the
Azure SDK. With the boxes empty, Local Web Enjoy says so by name rather than
trying.

Both credentials are stored as plain JSON in the local database, beside the
OpenAI key and on the same reasoning: one user, loopback only.

## Shadowing

Looping a sentence, recording against it and comparing the two waveforms is the
renderer's, unchanged. What Local Web Enjoy adds under it is the bytes: two runs
of them cross the seam on this path and neither is a file, so both travel inside
the argument list — the recording the microphone made, and the audio Alignment
reads to produce the Timeline the sentences are drawn from. Under Electron both
cross by structured clone; see [ADR 0008](../../docs/adr/0008-binary-arguments-travel-inside-the-argument-list.md)
for what they cross as here.

The Recording that comes back is a Library address like any other, so the
waveform under it is drawn from `GET /media/`, byte ranges and all.

The record button's microphone gate is the browser's own — see
`browser/electron-only.ts`.

None of it reaches Hosted Enjoy. The models sync every record they save, and
`fake-web-api.ts` is what they sync to.

## Configuration

Five environment variables steer it, the first three shared with Desktop Enjoy:

| Variable | Meaning |
| --- | --- |
| `SETTINGS_PATH` | Directory holding `settings.json`. |
| `LIBRARY_PATH` | Where the Library goes. |
| `WEB_API_URL` | Where Hosted Enjoy would be. Nothing here calls it — `fake-web-api.ts` answers instead — so the tests point it at a local address and assert nothing ever arrives. |
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

Shadowing is checked on that seam as far as it reaches. The audio the browser
holds aligns into a Timeline; the bytes it holds arrive as a Recording with a
duration and a playable address; bytes holding no sound are refused by name
rather than by dereference; and after a restart the Timeline is still there and
a new Recording lands in the same Library directory as the old one — one
directory holding both, which is the assertion the local user id has to survive
for. Both of those first two go through the bridge's own encoder rather than a
copy of it, so what is asserted is the wire form that ships.

Hosted Enjoy is checked by pointing every server the suite starts at a local
address that records what arrives, and asserting nothing ever did.

What the seam cannot reach is the browser, and that half was verified by hand:
the record button is live — its microphone gate is the browser's own now —
clicking a sentence in the Timeline loops that sentence alone, and a Recording
made against it draws its waveform beside the original and plays against it.

The compressed upload copy and the WAV beside it are checked on that seam too,
on fifteen minutes of stereo — the length that made the limit a real one.
What no test here can reach is the request itself: that OpenAI accepts the
copy, that a stalled upload ends at the timeout with a message rather than
hanging, and that the Transcript aligns into sentences a person would draw the
same way, are on the manual list.

Pushing was verified by hand in the browser: with the Media list open and
untouched, a Media imported from outside the browser appeared in it; a handler's
failure arrived as a toast carrying the real message; a subscription that lost
its connection received the next push after reconnecting, with no reload; and
the Library address on a pushed record arrived in the browser's own scheme and
answered a range request.

Importing was verified by hand in the browser: dropping an audio file anywhere
in the app imports it, dropping a video does the same, the "local file" button
opens the browser's picker and imports what it returns, pasting an absolute
path imports without a byte crossing `/files/`, and seeking inside an
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

The console carries a running commentary of degraded calls — the system proxy
settings the app reads at startup are out of reach here, and every Electron-only
method that is out of reach names itself when called. That is the
trade [ADR 0004](../../docs/adr/0004-electron-only-namespaces-fail-loudly.md)
makes on purpose.
