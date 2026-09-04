import {
  AfterCreate,
  AfterDestroy,
  AfterUpdate,
  BeforeSave,
  Column,
  DataType,
  Default,
  IsUUID,
  Model,
  Table,
} from "sequelize-typescript";
import mainWindow from "@main/window";
import log from "@main/logger";

const logger = log.scope("db/models/diary");

/**
 * A Diary is text you wrote yourself, kept for practising against.
 *
 * Where a Media is imported and then transcribed, a Diary runs the other way:
 * the Transcript is what you typed, and the audio is derived from it by Speech
 * synthesis. Nothing here is content-addressed for that reason — a Diary is
 * expected to change, which is exactly what a `Document`'s md5 identity rules
 * out.
 *
 * Local only: unlike Document there is no remote counterpart to sync or upload
 * to, so there is no `syncedAt`/`uploadedAt` and no `Client` in this file.
 */
@Table({
  modelName: "Diary",
  tableName: "diaries",
  underscored: true,
  timestamps: true,
})
export class Diary extends Model<Diary> {
  @IsUUID("all")
  @Default(DataType.UUIDV4)
  @Column({ primaryKey: true, type: DataType.UUID })
  id: string;

  @Default("")
  @Column(DataType.STRING)
  title: string;

  @Default("")
  @Column(DataType.TEXT)
  content: string;

  @Default({})
  @Column(DataType.JSON)
  config: Record<string, any>;

  @Column(DataType.VIRTUAL)
  get ttsConfig(): Record<string, any> {
    return this.config?.tts || {};
  }

  /**
   * Titles itself from the first line, the way a notes app does, so that a
   * Diary never reaches the list nameless. An explicit title always wins: this
   * only ever fills a blank.
   */
  @BeforeSave
  static titleFromFirstLine(diary: Diary) {
    if (diary.title?.trim()) return;

    const firstLine = (diary.content || "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    diary.title = (firstLine || "").slice(0, 100);
  }

  /**
   * Speeches are derivatives of text that is going away, so they go with it.
   *
   * The Audios they became do not: those are things you practised against, and
   * they carry Recordings and Assessments that tidying up a Diary has no
   * business destroying. Destroying each Speech one at a time rather than in
   * bulk is deliberate — it is what runs the hooks that remove the mp3.
   */
  @AfterDestroy
  static async destroySpeeches(diary: Diary) {
    const speeches = await diary.sequelize.models.Speech.findAll({
      where: { sourceType: "Diary", sourceId: diary.id },
    });

    for (const speech of speeches) {
      await speech.destroy().catch((err: Error) => {
        logger.error("failed to destroy speech:", err.message);
      });
    }
  }

  @AfterCreate
  static notifyForCreate(diary: Diary) {
    this.notify(diary, "create");
  }

  @AfterUpdate
  static notifyForUpdate(diary: Diary) {
    this.notify(diary, "update");
  }

  @AfterDestroy
  static notifyForDestroy(diary: Diary) {
    this.notify(diary, "destroy");
  }

  static notify(diary: Diary, action: "create" | "update" | "destroy") {
    if (!mainWindow.win) return;

    mainWindow.win.webContents.send("db-on-transaction", {
      model: "Diary",
      id: diary.id,
      action,
      record: diary.toJSON(),
    });
  }
}
