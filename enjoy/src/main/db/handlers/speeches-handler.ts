import { ipcMain, IpcMainEvent } from "electron";
import { Speech } from "@main/db/models";
import fs from "fs-extra";
import path from "path";
import settings from "@main/settings";
import { hashFile } from "@main/utils";
import { Attributes, WhereOptions } from "sequelize";

class SpeechesHandler {
  private async findOne(
    _event: IpcMainEvent,
    where: WhereOptions<Attributes<Speech>>
  ) {
    const speech = await Speech.findOne({ where });
    if (!speech) {
      return null;
    }

    return speech.toJSON();
  }

  private async create(
    event: IpcMainEvent,
    params: {
      sourceId: string;
      sourceType: string;
      text: string;
      section?: number;
      segment?: number;
      configuration: {
        engine: string;
        model: string;
        voice: string;
      };
    },
    blob: {
      type: string;
      arrayBuffer: ArrayBuffer;
    }
  ) {
    const format = blob.type.split("/")[1];
    const filename = `${Date.now()}.${format}`;
    const file = path.join(settings.userDataPath(), "speeches", filename);
    await fs.outputFile(file, Buffer.from(blob.arrayBuffer));
    const md5 = await hashFile(file, { algo: "md5" });
    fs.renameSync(file, path.join(path.dirname(file), `${md5}.${format}`));

    // The same text in the same voice synthesises to the same bytes, so
    // synthesising it twice is a collision, not a failure: say so by handing
    // back what is already there. Reachable from a Diary, whose text can be
    // edited back to what it said before.
    //
    // The collision is with what this source already said, not with the bytes
    // alone. A file is named by its own content and so is shared by everything
    // that speaks it, but a Speech is looked up by the source that spoke it —
    // so two Diaries saying the same sentence need a Speech each, or the second
    // one finds the first one's and reads it as nothing.
    //
    // Section and segment are settled here rather than left to the column's
    // default, so that what is stored and what is looked up cannot drift: a
    // caller that names neither — a Message — is one of each.
    const { section = 0, segment = 0, ...source } = params;
    const existing = await Speech.findOne({
      where: {
        md5,
        sourceId: source.sourceId,
        sourceType: source.sourceType,
        section,
        segment,
      },
    });
    if (existing) {
      return existing.toJSON();
    }

    return Speech.create({
      ...source,
      section,
      segment,
      extname: `.${format}`,
      md5,
    })
      .then((speech) => {
        return speech.toJSON();
      })
      .catch((err) => {
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  /**
   * Destroys the instance rather than the rows matching it, deliberately.
   *
   * A bulk destroy fires only the bulk hooks, so `Speech.cleanupFile` — which
   * takes the mp3 with the record, unless another source still speaks it —
   * never runs on that path, and the file stays in the Library with nothing
   * pointing at it. The ebook reader refreshes a paragraph through here on
   * every regeneration, so that is a file left behind each time.
   *
   * `Diary.destroySpeeches`, `Message.destroySpeeches` and
   * `ChatMessage.destroyRecordings` destroy one at a time for the same reason.
   */
  private async delete(_event: IpcMainEvent, id: string) {
    const speech = await Speech.findByPk(id);
    if (!speech) return;

    await speech.destroy();
  }

  register() {
    ipcMain.handle("speeches-find-one", this.findOne);
    ipcMain.handle("speeches-create", this.create);
    ipcMain.handle("speeches-delete", this.delete);
  }

  unregister() {
    ipcMain.removeHandler("speeches-find-one");
    ipcMain.removeHandler("speeches-create");
    ipcMain.removeHandler("speeches-delete");
  }
}

export const speechesHandler = new SpeechesHandler();
