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
 * Turns the credentials in the environment — which is what a `.env` file
 * becomes, see `loadEnvFiles` in `local.mjs` — into the user settings the app
 * already reads.
 *
 * Written into the settings rather than read at the point of use, so that
 * nothing downstream has to learn a second place to look: the OpenAI client,
 * Assessment's Azure config and ElevenLabs all go on reading the same rows the
 * preference boxes write. The boxes stay usable for anyone who would rather
 * type a key than keep a file.
 *
 * A variable that is set wins over what is stored, on every start — a key
 * edited in `.env` is meant to take effect. A variable that is *not* set says
 * nothing at all, and in particular does not erase what is stored, so filling
 * in one key does not clear the two beside it.
 */
export const seedCredentialsFromEnv = async () => {
  const {
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    AZURE_SPEECH_KEY,
    AZURE_SPEECH_REGION,
    ELEVENLABS_API_KEY,
  } = process.env;

  await mergeSetting(UserSettingKeyEnum.OPENAI, {
    key: OPENAI_API_KEY,
    baseUrl: OPENAI_BASE_URL,
  });

  await mergeSetting(UserSettingKeyEnum.AZURE_SPEECH, {
    key: AZURE_SPEECH_KEY,
    region: AZURE_SPEECH_REGION,
  });

  await mergeSetting(UserSettingKeyEnum.ELEVENLABS, {
    key: ELEVENLABS_API_KEY,
  });
};

/**
 * Writes the fields the environment actually named onto whatever is stored,
 * and writes nothing at all when it named none of them.
 */
const mergeSetting = async (
  key: UserSettingKeyEnum,
  fields: Record<string, string | undefined>
) => {
  const named = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value)
  );
  if (Object.keys(named).length === 0) return;

  const stored = ((await UserSetting.get(key)) as Record<string, unknown>) ?? {};

  await UserSetting.set(key, { ...stored, ...named });
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
