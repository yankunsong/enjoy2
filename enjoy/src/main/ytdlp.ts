import path from "path";
import { spawn } from "child_process";
import fs from "fs-extra";
import ffmpegPath from "ffmpeg-static";
import log from "@main/logger";
import snakeCase from "lodash/snakeCase";
import settings from "@main/settings";
import mainWin from "@main/window";
import ytDlpPackage from "youtube-dl-exec";

const logger = log.scope("YTDLP");

/**
 * yt-dlp, the external downloader a YouTube link is fetched with.
 *
 * The binary is not ours: `youtube-dl-exec` fetches the current release at
 * install time, and `ENJOY_YT_DLP_PATH` points at another one — a newer
 * release, or the stub the tests drive this module with. YouTube changes
 * often enough that a downloader pinned by us goes stale between our releases;
 * see docs/adr/0009-yt-dlp-as-the-youtube-downloader.md.
 */
const packagedBinary = (
  ytDlpPackage as unknown as { constants: { YOUTUBE_DL_PATH: string } }
).constants.YOUTUBE_DL_PATH;

/**
 * 720p, and said so rather than settled for: the first stream that happened to
 * carry both picture and sound is 360p, which is too coarse to read a speaker's
 * mouth. Picture and sound come down separately at this quality and are merged
 * by the ffmpeg this app already ships — the same binary the transcodes use.
 * The fallbacks behind the first branch are for material that has no 720p at
 * all, where something is better than an error.
 */
const FORMAT_SELECTOR =
  "bestvideo[height<=720]+bestaudio/best[height<=720]/best";

/**
 * The two lines we ask yt-dlp to print for us, each prefixed so it can be told
 * apart from everything else it says. A progress line names the stream it
 * belongs to, because the picture and the sound are two downloads and one bar.
 */
const PROGRESS_PREFIX = "ENJOY_PROGRESS";
const FILE_PREFIX = "ENJOY_FILE";

const PROGRESS_TEMPLATE = `download:${PROGRESS_PREFIX} %(info.format_id)s %(progress.downloaded_bytes)s %(progress.total_bytes,progress.total_bytes_estimate)s %(progress.speed)s`;

const FILE_TEMPLATE = `after_move:${FILE_PREFIX} %(filepath)s`;

const ONE_MINUTE = 1000 * 60;

/**
 * How long yt-dlp may say nothing at all before we call it stuck. A clock on
 * the whole run would kill a long video on a slow line partway through and
 * report it as a bare exit code; silence is what actually means something has
 * gone wrong. Generous enough to cover the merge, which is ffmpeg working with
 * nothing to report.
 */
const STALL_TIMEOUT = 1000 * 60 * 5;

const validQueryDomains = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "gaming.youtube.com",
]);

const validPathDomains =
  /^https?:\/\/(youtu\.be\/|(www\.)?youtube\.com\/(embed|v|shorts)\/)/;

/**
 * Where progress is pushed: Electron's `WebContents`, or the stand-in Local
 * Web Enjoy funnels into `GET /events`. Only `send` is ever used.
 */
type PushOutlet = { send: (channel: string, ...args: any[]) => void };

type YtDlpFormat = {
  filesize?: number;
  filesize_approx?: number;
};

type YtDlpInfo = YtDlpFormat & {
  id: string;
  title: string;
  requested_formats?: YtDlpFormat[];
};

/**
 * How large the download is going to be, so progress can be reported against
 * something. The two streams are described separately, so this is their sum;
 * a live stream describes neither, and then there is no total to report.
 */
const expectedBytes = (info: YtDlpInfo): number | undefined => {
  const formats = info.requested_formats ?? [info];
  const total = formats.reduce(
    (sum, format) => sum + (format.filesize ?? format.filesize_approx ?? 0),
    0
  );
  return total > 0 ? total : undefined;
};

const humanSpeed = (bytesPerSecond: number) => {
  const units = ["B/s", "KiB/s", "MiB/s", "GiB/s"];
  let value = bytesPerSecond;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
};

/**
 * What yt-dlp said went wrong, rather than that something did. yt-dlp reports
 * an unusable link, an unavailable video and its own obsolescence all as
 * `ERROR:` lines on stderr, and which of those it is is the whole of what a
 * person needs to know.
 */
const downstreamError = (stderr: string, fallback: string) => {
  const reported = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("ERROR:"));

  return new Error(
    reported.length ? reported.join("; ") : stderr.trim() || fallback
  );
};

class Ytdlp {
  get binFile() {
    return (
      process.env.ENJOY_YT_DLP_PATH ||
      // The binary lives outside the asar archive, where it can be executed.
      packagedBinary.replace("app.asar", "app.asar.unpacked")
    );
  }

  /**
   * Merging is ffmpeg's, and the ffmpeg is the one already shipped for the
   * transcodes rather than whatever the machine happens to have on its PATH.
   */
  private get ffmpegLocation() {
    return (ffmpegPath as unknown as string).replace(
      "app.asar",
      "app.asar.unpacked"
    );
  }

  /**
   * yt-dlp reads YouTube's player with a JavaScript runtime, and without one it
   * warns that some formats — 720p among them — may simply not be offered. It
   * looks for Deno on its own; the other runtime worth naming is the Node this
   * process is very often already running under, which is the case under Local
   * Web Enjoy. Under Electron there is no Node to point at, so yt-dlp is left
   * to find one on the PATH.
   */
  private get jsRuntimeArgs() {
    const executable = process.execPath;
    const underNode =
      path.basename(executable, path.extname(executable)) === "node";

    return [
      "--js-runtimes",
      "deno",
      "--js-runtimes",
      underNode ? `node:${executable}` : "node",
    ];
  }

  async autoDownload(url: string, options: { webContents?: PushOutlet } = {}) {
    logger.debug("fetching video info", url);
    const info = await this.info(url);

    return this.download(url, {
      filename: `${snakeCase(info.title || info.id)}.mp4`,
      directory: settings.cachePath(),
      expected: expectedBytes(info),
      webContents: options.webContents,
    });
  }

  /**
   * What yt-dlp knows about the link, at the quality we are going to ask for.
   * A link that is not a video, or a video that cannot be played, fails here
   * rather than partway through a download.
   */
  async info(url: string): Promise<YtDlpInfo> {
    const stdout = await this.run([
      url,
      "--dump-single-json",
      "--no-playlist",
      "--format",
      FORMAT_SELECTOR,
      ...this.jsRuntimeArgs,
    ]);

    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error(`yt-dlp described ${url} in a form we cannot read`);
    }
  }

  async download(
    url: string,
    options: {
      filename: string;
      directory?: string;
      expected?: number;
      webContents?: PushOutlet;
    }
  ): Promise<string> {
    const {
      filename,
      directory = settings.cachePath(),
      expected,
      webContents = mainWin.win.webContents,
    } = options;

    const output = path.join(directory, filename);
    fs.ensureDirSync(directory);

    const args = [
      url,
      "--no-playlist",
      "--format",
      FORMAT_SELECTOR,
      "--merge-output-format",
      "mp4",
      "--ffmpeg-location",
      this.ffmpegLocation,
      "--newline",
      "--no-colors",
      "--progress",
      "--progress-template",
      PROGRESS_TEMPLATE,
      "--print",
      FILE_TEMPLATE,
      "--output",
      output,
      ...this.jsRuntimeArgs,
    ];

    logger.info(`Running: ${this.binFile} ${args.join(" ")}`);

    // The picture and the sound are two downloads, each counted from zero
    // against its own size, and the interface has one bar. `format_id` says
    // which of them a line belongs to, so the finished ones can be carried in
    // `completed`.
    let completed = 0;
    let stream: string | undefined;
    let streamTotal = 0;

    // Where the download landed, said by the only party that knows: normally
    // `output`, but a format that cannot be merged into mp4 keeps its own
    // container.
    let landed: string | undefined;

    try {
      await this.run(args, {
        onLine: (line) => {
          if (line.startsWith(FILE_PREFIX)) {
            landed = line.slice(FILE_PREFIX.length).trim();
            return;
          }
          if (!line.startsWith(PROGRESS_PREFIX)) return;

          const [id, ...rest] = line
            .slice(PROGRESS_PREFIX.length)
            .trim()
            .split(/\s+/);
          const [received, total, speed] = rest.map(Number);
          if (!Number.isFinite(received)) return;

          if (id !== stream) {
            completed += streamTotal;
            stream = id;
            streamTotal = 0;
          }
          if (Number.isFinite(total)) streamTotal = total;

          const overall = expected ?? completed + streamTotal;
          webContents.send("download-on-state", {
            name: filename,
            state: "progressing",
            // `expected` was described before the download; where it turns out
            // to have been short, the bar stops at full rather than past it.
            received: Math.min(completed + received, overall),
            total: overall,
            speed: Number.isFinite(speed) ? humanSpeed(speed) : undefined,
          });
        },
      });
    } catch (err) {
      webContents.send("download-on-state", {
        name: filename,
        state: "interrupted",
      });
      throw err;
    }

    // Nothing was moved when the file was already there from a previous run,
    // and then yt-dlp has no path to print.
    const downloaded = landed ?? (fs.existsSync(output) ? output : undefined);
    if (!downloaded) {
      throw new Error(`yt-dlp reported success but wrote no file for ${url}`);
    }

    const { size } = fs.statSync(downloaded);
    webContents.send("download-on-state", {
      name: filename,
      state: "completed",
      received: size,
      total: size,
    });

    return downloaded;
  }

  /**
   * One yt-dlp run, which is the same shape for both calls this module makes:
   * read stdout a line at a time — chunk boundaries fall wherever they like —
   * and on a non-zero exit reject with what yt-dlp said rather than with the
   * exit code.
   */
  private run(
    args: string[],
    options: { onLine?: (line: string) => void } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binFile, args, { env: this.proxyEnv() });

      let stdout = "";
      let stderr = "";
      let partial = "";
      let stalled = false;

      const giveUp = () => {
        stalled = true;
        proc.kill();
        reject(
          new Error(
            `yt-dlp said nothing for ${STALL_TIMEOUT / ONE_MINUTE} minutes and was stopped`
          )
        );
      };

      let silence = setTimeout(giveUp, STALL_TIMEOUT);
      const heard = () => {
        clearTimeout(silence);
        silence = setTimeout(giveUp, STALL_TIMEOUT);
      };

      proc.stdout.on("data", (data) => {
        heard();
        const chunk = data.toString();
        stdout += chunk;

        partial += chunk;
        const lines = partial.split("\n");
        partial = lines.pop() ?? "";
        for (const line of lines) options.onLine?.(line);
      });

      proc.stderr.on("data", (data) => {
        heard();
        stderr += data.toString();
      });

      proc.on("error", (err) => {
        clearTimeout(silence);
        reject(err);
      });

      proc.on("close", (code) => {
        clearTimeout(silence);
        if (stalled) return;
        if (partial) options.onLine?.(partial);

        if (code !== 0) {
          logger.error(stderr);
          return reject(
            downstreamError(stderr, `yt-dlp exited with code ${code}`)
          );
        }
        resolve(stdout);
      });
    });
  }

  /**
   * Whether the link is YouTube's at all, which is what decides who fetches it.
   * Deliberately no stricter than the domain: a YouTube address carrying an
   * unusable video id is still yt-dlp's to refuse, and it says why in its own
   * words. Handing it to the generic file downloader instead only ever
   * produced an HTML page.
   */
  isYoutubeUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return (
        validQueryDomains.has(parsed.hostname) ||
        validPathDomains.test(url.trim())
      );
    } catch {
      return false;
    }
  };

  /**
   * Set the proxy environment variables
   * @returns env object
   */
  proxyEnv = () => {
    // keep current environment variables
    const env = { ...process.env };
    const proxyConfig = settings.getSync("proxy") as ProxyConfigType;
    if (proxyConfig?.enabled && proxyConfig.url) {
      env["HTTP_PROXY"] = proxyConfig.url;
      env["HTTPS_PROXY"] = proxyConfig.url;
    }
    return env;
  };
}

export default new Ytdlp();
