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
 * Three call sites read the result rather than merely holding it, so they get
 * the shape they dereference.
 */

const overrides: Record<string, (...args: any[]) => Promise<unknown>> = {
  // `findTranscriptionOnline` reads `.transcriptions.length` off the result.
  transcriptions: async () => ({
    transcriptions: [],
    page: 1,
    next: null as number | null,
    last: 1,
  }),

  // The account the app settings provider refreshes; under Local Web Enjoy the
  // account is the seeded local user and nothing else.
  me: async () => ({ id: LOCAL_USER_ID, name: LOCAL_USER_NAME }),

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
