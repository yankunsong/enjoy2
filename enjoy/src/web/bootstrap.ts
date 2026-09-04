import settings from "@main/settings";
import db from "@main/db";
import echogarden from "@main/echogarden";
import Ffmpeg from "@main/ffmpeg";
import { Waveform } from "@main/waveform";
import { UserSetting } from "@main/db/models";
import { UserSettingKeyEnum } from "@/types/enums";
import { LOCAL_USER_ID, LOCAL_USER_NAME } from "./constants";

/**
 * Registers the main process handlers Local Web Enjoy serves, and seeds the
 * local user they depend on.
 *
 * Only the handlers a served feature needs are registered; a channel with no
 * handler answers 404 naming itself, which is a better answer than a page that
 * half works.
 *
 * Seeding has to happen before anything connects the database: the Library
 * database path is derived from the user id, so without it `settings.dbPath()`
 * returns null and the connection fails.
 */
export const bootstrap = () => {
  seedLocalUser();

  settings.registerIpcHandlers();
  db.registerIpcHandlers();

  // Playing a Media needs more than the record: the waveform under the player,
  // and the transcoding both that and Alignment read. `db.connect` registers
  // the model handlers itself, this one included.
  new Waveform().registerIpcHandlers();
  new Ffmpeg().registerIpcHandlers();
  echogarden.registerIpcHandlers();
};

const seedLocalUser = () => {
  if (settings.getSync("user.id")) return;

  settings.setSync("user", { id: LOCAL_USER_ID, name: LOCAL_USER_NAME });
};

/**
 * Seeds the profile record the renderer reads back after an account-less login.
 *
 * It lives in the database rather than in settings, so it can only be written
 * once a connection exists — which is why a fresh environment always reaches
 * the first connection without one. That is the state the renderer's app
 * settings provider dereferences blind, so seed it as soon as we can.
 */
export const seedLocalProfile = async () => {
  if (await UserSetting.get(UserSettingKeyEnum.PROFILE)) return;

  await UserSetting.set(UserSettingKeyEnum.PROFILE, {
    id: LOCAL_USER_ID,
    name: LOCAL_USER_NAME,
  });
};
