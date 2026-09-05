import { UserSettingKeyEnum } from "@/types/enums";
import { LOCAL_USER_ID, LOCAL_USER_NAME } from "./constants";

/**
 * Stands in for `@/api` under Local Web Enjoy, by module resolution — the same
 * trick `fake-electron.ts` uses. Both halves swap it in: the renderer reads
 * Hosted Enjoy for the pages it still compiles, and the main process models
 * reach for it too, to sync every record they save.
 *
 * The real `Client` talks to Hosted Enjoy, which this distribution has no
 * account for. Rather than find every call site and guard it, every method
 * resolves to an empty object: a request that cannot be made returns nothing,
 * and the caller's own "no data" branches take over.
 *
 * The methods below are the ones that cannot be nothing: three whose result is
 * dereferenced rather than merely held, and one — `updateProfile` — whose whole
 * point is the write.
 */

/**
 * The profile row, reached the only way this module can reach it.
 *
 * It lives in the database, behind a channel in the main process. In the
 * browser the bridge that `src/web/browser/bridge.ts` installs is already on
 * `window`, so the renderer's own route to that channel is open to this module
 * too. On the main process side there is no bridge — and no caller either:
 * what the models reach `@/api` for is syncing a record, never reading the
 * account. So nothing there, and the seeded values answer instead.
 */
const bridge = (): any => (globalThis as any).window?.__ENJOY_APP__;

const userSettings = ():
  | {
      get: (key: string) => Promise<any>;
      set: (key: string, value: any) => Promise<void>;
    }
  | undefined => bridge()?.userSettings;

const seededProfile = () => ({ id: LOCAL_USER_ID, name: LOCAL_USER_NAME });

/**
 * What is stored, falling back to what was seeded.
 *
 * The row is written on the first database connection, and `me` is asked
 * before that on a fresh start — so its absence is an ordinary state, not a
 * failure, and neither is a channel that answers before the database behind it
 * is open. A name is not worth failing a startup over.
 */
const storedProfile = async () => {
  try {
    return (
      (await userSettings()?.get(UserSettingKeyEnum.PROFILE)) ?? seededProfile()
    );
  } catch {
    return seededProfile();
  }
};

const overrides: Record<string, (...args: any[]) => Promise<unknown>> = {
  // `findTranscriptionOnline` reads `.transcriptions.length` off the result.
  transcriptions: async () => ({
    transcriptions: [],
    page: 1,
    next: null as number | null,
    last: 1,
  }),

  // The account the app settings provider refreshes; under Local Web Enjoy the
  // account is the seeded local user and nothing else. Its name, though, is the
  // user's to change, so what is stored outranks what was seeded. Answering
  // with the constant either way is what made the rename below look like it had
  // never happened: Preferences writes the new name and then calls this to read
  // it back, and read back the old one.
  me: async () => storedProfile(),

  // The rename Hosted Enjoy would do, done here instead. Preferences toasts
  // success on any promise that resolves, so under the catch-all this method
  // reported having saved a name that nothing had written down.
  //
  // Merged rather than replaced, because a caller sends only the fields it
  // edited — `{ name }` from the user settings, `{ email }` from the email
  // settings beside them.
  updateProfile: async (_id: number, params: Record<string, unknown>) => {
    const profile = { ...(await storedProfile()), ...params };
    await userSettings()?.set(UserSettingKeyEnum.PROFILE, profile);

    // The second copy of the name, and the one the app paints first: the
    // settings record is what `autoLogin` has to show before the database is
    // open. Left behind, a rename is correct everywhere except the moment the
    // window appears, which reads as the rename having been forgotten.
    await bridge()?.appSettings?.setUser({
      id: profile.id,
      name: profile.name,
    });

    return profile;
  },

  // Remote configuration is read as an object (`config.version`, and a
  // destructured `{ discussUrl }`), so the empty answer has to be an object
  // rather than nothing at all.
  config: async () => ({}),
};

/**
 * Property names a promise-aware caller probes for. Answering them with a
 * function would make every client look like a thenable, and `await client`
 * would hang or resolve to something absurd.
 */
const NOT_A_METHOD = new Set(["then", "catch", "finally"]);

export class Client {
  public baseUrl: string;

  constructor(options: { baseUrl: string }) {
    this.baseUrl = options?.baseUrl;

    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (typeof property !== "string") return undefined;
        if (property in target) return Reflect.get(target, property, receiver);
        if (NOT_A_METHOD.has(property)) return undefined;

        return overrides[property] ?? (async () => ({}));
      },
    });
  }
}
