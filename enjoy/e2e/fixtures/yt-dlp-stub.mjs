#!/usr/bin/env node
/**
 * The stand-in for yt-dlp, which the web server suite points at through the
 * same `ENJOY_YT_DLP_PATH` a person would use to point at a newer release than
 * the bundled one.
 *
 * Downloading from YouTube is the one thing on this path that cannot be
 * asserted without YouTube. What can be, and is what actually breaks, is
 * everything around it: the quality asked for, the progress reported, the file
 * imported, and the downloader's own words when it fails. So this answers the
 * two calls the module makes — a description of the video, then the download —
 * from a directory the suite names in `YT_DLP_STUB_DIR`:
 *
 * - `control.json` says whether to fail, and with what, so a failure can be
 *   asked for without restarting the server.
 * - `argv.json` is written on every call, and is how the suite reads back what
 *   the module asked for.
 * - `youtube.mp4` is what a download produces.
 */
import fs from "fs";
import path from "path";

const dir = process.env.YT_DLP_STUB_DIR;
const argv = process.argv.slice(2);
fs.writeFileSync(path.join(dir, "argv.json"), JSON.stringify(argv));

const control = JSON.parse(
  fs.readFileSync(path.join(dir, "control.json"), "utf8")
);

if (control.failWith) {
  process.stderr.write(control.failWith + "\n");
  process.exit(1);
}

// Real yt-dlp refuses a YouTube address whose video id is not a video id, and
// says why. The routing that sends such an address here rather than to the
// generic file downloader is what that answer is being read through.
const id = new URL(argv[0]).searchParams.get("v") ?? "";
if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
  process.stderr.write(
    `ERROR: [youtube] ${id}: Incomplete YouTube ID ${id}.\n`
  );
  process.exit(1);
}

// A 720p picture and its sound come down as two separate downloads, each
// counted from zero against its own size — the shape one progress bar has to
// be made out of. yt-dlp names them by format id.
const streams = [
  { id: "137", filesize: 1_000_000 },
  { id: "140", filesize: 400_000 },
];

if (argv.includes("--dump-single-json")) {
  process.stdout.write(
    JSON.stringify({
      id,
      title: "A Talk Worth Shadowing",
      requested_formats: streams.map(({ filesize }) => ({ filesize })),
    })
  );
  process.exit(0);
}

// Written in pieces that do not end on a line boundary, because yt-dlp's
// output does not either and a progress line read half at a time is a wrong
// number on the bar.
const say = (text) => {
  for (let at = 0; at < text.length; at += 30) {
    process.stdout.write(text.slice(at, at + 30));
  }
};

for (const { id: format, filesize } of streams) {
  for (const received of [Math.floor(filesize / 2), filesize]) {
    say(`ENJOY_PROGRESS ${format} ${received} ${filesize} 250000\n`);
  }
}

const output = argv[argv.indexOf("--output") + 1];
fs.copyFileSync(path.join(dir, "youtube.mp4"), output);
say(`ENJOY_FILE ${output}\n`);
