import { ipcMain } from "electron";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "@andrkrn/ffprobe-static";
import Ffmpeg from "fluent-ffmpeg";
import log from "@main/logger";
import path from "path";
import fs from "fs-extra";
import settings from "@main/settings";
import url from "url";
import { FFMPEG_CONVERT_WAV_OPTIONS } from "@/constants";
import { enjoyUrlToPath, pathToEnjoyUrl } from "@main/utils";

/*
 * ffmpeg and ffprobe bin file will be in /app.asar.unpacked instead of /app.asar
 * the /samples folder is also in /app.asar.unpacked
 */
Ffmpeg.setFfmpegPath(ffmpegPath.replace("app.asar", "app.asar.unpacked"));
Ffmpeg.setFfprobePath(ffprobePath.replace("app.asar", "app.asar.unpacked"));
const __dirname = import.meta.dirname.replace("app.asar", "app.asar.unpacked");

const logger = log.scope("ffmpeg");
export default class FfmpegWrapper {
  checkCommand(): Promise<boolean> {
    const ffmpeg = Ffmpeg();
    const sampleFile = path.join(__dirname, "samples", "jfk.wav");
    return new Promise((resolve, _reject) => {
      ffmpeg.input(sampleFile).getAvailableFormats((err, _formats) => {
        if (err) {
          logger.error("Command not valid:", err);
          resolve(false);
        } else {
          logger.info("Command valid, available formats");
          resolve(true);
        }
      });
    });
  }

  generateMetadata(input: string): Promise<Ffmpeg.FfprobeData> {
    const ffmpeg = Ffmpeg();
    return new Promise((resolve, reject) => {
      ffmpeg
        .input(input)
        .on("start", (commandLine) => {
          logger.info("Spawned FFmpeg with command: " + commandLine);
        })
        .on("error", (err) => {
          logger.error(err);
          reject(err);
        })
        .ffprobe((err, metadata) => {
          if (err) {
            logger.error(err);
            reject(err);
          }

          resolve(metadata);
        });
    });
  }

  generateCover(input: string, output: string): Promise<string> {
    const ffmpeg = Ffmpeg();
    return new Promise((resolve, reject) => {
      ffmpeg
        .input(input)
        .thumbnail({
          count: 1,
          filename: path.basename(output),
          folder: path.dirname(output),
        })
        .on("start", (commandLine) => {
          logger.info("Spawned FFmpeg with command: " + commandLine);
          fs.ensureDirSync(path.dirname(output));
        })
        .on("end", () => {
          logger.info(`File ${output} created`);
          resolve(output);
        })
        .on("error", (err) => {
          logger.error(err);
          reject(err);
        });
    });
  }

  async transcode(
    input: string,
    output?: string,
    options?: string[]
  ): Promise<string> {
    input = enjoyUrlToPath(input);

    if (!output) {
      output = path.join(settings.cachePath(), `${path.basename(input)}.wav`);
    } else {
      output = enjoyUrlToPath(output);
    }

    options = options || FFMPEG_CONVERT_WAV_OPTIONS;

    const ffmpeg = Ffmpeg();
    return new Promise((resolve, reject) => {
      ffmpeg
        .input(input)
        .outputOptions(...options)
        .on("start", (commandLine) => {
          logger.debug(`Trying to convert ${input} to ${output}`);
          logger.info("Spawned FFmpeg with command: " + commandLine);
          fs.ensureDirSync(path.dirname(output));
        })
        .on("end", (stdout, stderr) => {
          if (stdout) {
            logger.debug(stdout);
          }

          if (stderr) {
            logger.info(stderr);
          }

          if (fs.existsSync(output)) {
            resolve(pathToEnjoyUrl(output));
          } else {
            reject(new Error("FFmpeg command failed"));
          }
        })
        .on("error", (err: Error) => {
          logger.error(err);
          reject(err);
        })
        .save(output);
    });
  }

  // Crop video or audio from start to end time to a mp3 file
  // Save the file to the output path
  crop(
    input: string,
    options: {
      startTime: number;
      endTime: number;
      output: string;
    }
  ) {
    const { startTime, endTime, output } = options;
    const ffmpeg = Ffmpeg();

    return new Promise((resolve, reject) => {
      ffmpeg
        .input(input)
        .outputOptions("-ss", startTime.toString(), "-to", endTime.toString())
        .on("start", (commandLine) => {
          logger.info("Spawned FFmpeg with command: " + commandLine);
          fs.ensureDirSync(path.dirname(output));
        })
        .on("end", () => {
          logger.info(`File "${output}" created`);
          resolve(output);
        })
        .on("error", (err) => {
          logger.error(err);
          reject(err);
        })
        .save(output);
    });
  }

  // Concatenate videos or audios into a single file
  concat(inputs: string[], output: string) {
    let command = Ffmpeg();
    inputs.forEach((input) => {
      command = command.input(input);
    });
    return new Promise((resolve, reject) => {
      command
        .on("start", (commandLine) => {
          logger.info("Spawned FFmpeg with command: " + commandLine);
          fs.ensureDirSync(path.dirname(output));
        })
        .on("end", () => {
          logger.info(`File "${output}" created`);
          resolve(output);
        })
        .on("error", (err) => {
          logger.error(err);
          reject(err);
        })
        .mergeToFile(output, settings.cachePath());
    });
  }

  compressVideo(input: string, output: string) {
    const ffmpeg = Ffmpeg();
    return new Promise((resolve, reject) => {
      ffmpeg
        .input(input)
        .outputOptions(
          "-c:v",
          "libx264",
          "-tag:v",
          "avc1",
          "-movflags",
          "faststart",
          "-crf",
          "30",
          "-preset",
          "superfast",
          "-c:a",
          "aac",
          "-b:a",
          "128k"
        )
        .on("start", (commandLine) => {
          logger.info("Spawned FFmpeg with command: " + commandLine);
          fs.ensureDirSync(path.dirname(output));
        })
        .on("end", () => {
          logger.info(`File "${output}" created`);
          resolve(output);
        })
        .on("error", (err) => {
          logger.error(err);
          reject(err);
        })
        .save(output);
    });
  }

  compressAudio(input: string, output: string) {
    const ffmpeg = Ffmpeg();
    return new Promise((resolve, reject) => {
      ffmpeg
        .input(input)
        .outputOptions(
          "-ar",
          "16000",
          "-b:a",
          "32000",
          "-ac",
          "1",
          "-preset",
          "superfast"
        )
        .on("start", (commandLine) => {
          logger.info("Spawned FFmpeg with command: " + commandLine);
          fs.ensureDirSync(path.dirname(output));
        })
        .on("end", () => {
          logger.info(`File "${output}" created`);
          resolve(output);
        })
        .on("error", (err) => {
          logger.error(err.message);
          reject(err);
        })
        .save(output);
    });
  }

  /**
   * Writes the copy Transcription uploads: 16 kHz mono Opus in an Ogg
   * container.
   *
   * This is a second product beside the WAV `echogarden.transcode` writes, not
   * a replacement for it, and deleting either one breaks something. Alignment
   * reads the audio signal itself and is given the WAV; Transcription only has
   * to get the audio across a wire, and an uncompressed 16 kHz WAV crosses
   * OpenAI's 25 MB limit after under seven minutes of stereo. At 24 kbps the
   * same limit holds over two hours.
   *
   * @param input - an `enjoy://` address, or a path
   * @returns the `enjoy://` address of the copy
   */
  async compressForUpload(input: string): Promise<string> {
    const filePath = enjoyUrlToPath(input);
    const output = path.join(
      settings.cachePath(),
      `${path.basename(filePath, path.extname(filePath))}-${Date.now()}.ogg`
    );

    const ffmpeg = Ffmpeg();
    return new Promise((resolve, reject) => {
      ffmpeg
        .input(filePath)
        .outputOptions(
          // prettier-ignore
          "-ar", "16000", "-ac", "1",
          "-c:a", "libopus", "-b:a", "24k",
          // Constrained, so the bitrate above is a ceiling rather than a hope:
          // it is what the two-hour figure is worked out from.
          "-vbr", "constrained"
        )
        .on("start", (commandLine) => {
          logger.info("Spawned FFmpeg with command: " + commandLine);
          fs.ensureDirSync(path.dirname(output));
        })
        .on("end", () => {
          logger.info(`File "${output}" created`);
          resolve(pathToEnjoyUrl(output));
        })
        .on("error", (err: Error) => {
          logger.error(err);
          reject(err);
        })
        .save(output);
    });
  }

  registerIpcHandlers() {
    ipcMain.handle("ffmpeg-check-command", async (_event) => {
      return await this.checkCommand();
    });

    ipcMain.handle(
      "ffmpeg-transcode",
      async (_event, input, output, options) => {
        return await this.transcode(input, output, options);
      }
    );

    ipcMain.handle("ffmpeg-compress-for-upload", async (_event, input) => {
      return await this.compressForUpload(input);
    });
  }
}
