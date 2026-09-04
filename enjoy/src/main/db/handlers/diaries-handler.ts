import { ipcMain, IpcMainEvent } from "electron";
import { Diary } from "@main/db/models";
import { Attributes, FindOptions, Op, WhereOptions } from "sequelize";
import log from "@main/logger";
import { t } from "i18next";

const logger = log.scope("db/handlers/diaries-handler");

class DiariesHandler {
  private async findAll(
    _event: IpcMainEvent,
    options: FindOptions<Attributes<Diary>> & { query?: string }
  ) {
    const { query, where = {} } = options || {};
    delete options?.query;
    delete options?.where;

    if (query) {
      (where as any)[Op.or] = [
        { title: { [Op.like]: `%${query}%` } },
        { content: { [Op.like]: `%${query}%` } },
      ];
    }

    const diaries = await Diary.findAll({
      order: [["updatedAt", "DESC"]],
      where,
      ...options,
    });

    return diaries.map((diary) => diary.toJSON());
  }

  private async findOne(
    _event: IpcMainEvent,
    where: WhereOptions<Attributes<Diary>>
  ) {
    const diary = await Diary.findOne({ where: { ...where } });
    if (!diary) return;

    return diary.toJSON();
  }

  private async create(
    _event: IpcMainEvent,
    params: {
      title?: string;
      content?: string;
      config?: Record<string, any>;
    }
  ) {
    const { title = "", content = "", config = {} } = params || {};

    try {
      const diary = await Diary.create({ title, content, config });
      return diary.toJSON();
    } catch (err) {
      logger.error(err.message);
      throw err;
    }
  }

  private async update(
    _event: IpcMainEvent,
    id: string,
    params: Attributes<Diary>
  ) {
    const diary = await Diary.findByPk(id);
    if (!diary) {
      throw new Error(t("models.diary.notFound"));
    }

    const { title, content, config } = params;
    // Only what was named: the editor saves the body without touching the TTS
    // configuration, and the configuration popover the other way round.
    const changes: Partial<Attributes<Diary>> = {};
    if (title !== undefined) changes.title = title;
    if (content !== undefined) changes.content = content;
    if (config !== undefined) changes.config = config;

    await diary.update(changes);
    return diary.toJSON();
  }

  private async destroy(_event: IpcMainEvent, id: string) {
    const diary = await Diary.findByPk(id);
    if (!diary) {
      throw new Error(t("models.diary.notFound"));
    }

    return await diary.destroy();
  }

  register() {
    ipcMain.handle("diaries-find-all", this.findAll);
    ipcMain.handle("diaries-find-one", this.findOne);
    ipcMain.handle("diaries-create", this.create);
    ipcMain.handle("diaries-update", this.update);
    ipcMain.handle("diaries-destroy", this.destroy);
  }

  unregister() {
    ipcMain.removeHandler("diaries-find-all");
    ipcMain.removeHandler("diaries-find-one");
    ipcMain.removeHandler("diaries-create");
    ipcMain.removeHandler("diaries-update");
    ipcMain.removeHandler("diaries-destroy");
  }
}

export const diariesHandler = new DiariesHandler();
