/**
 * The declaration table the browser bridge is generated from.
 *
 * Almost every namespace the preload script exposes does one thing: forward a
 * call to a main process channel. The method names and the channel names do not
 * follow a rule (`dict.getDicts` is `dict-list`), so the mapping is spelled out
 * rather than derived — but it is still a table, not a hand-written function per
 * method. Keep it in step with `src/preload.ts`.
 *
 * The five namespaces with no browser counterpart are not here; they live in
 * `electron-only.ts`.
 */

export type Spec =
  /** Forward to a main process channel over HTTP. */
  | { kind: "invoke"; channel: string }
  /** Subscribe to a channel the main process pushes on. */
  | { kind: "listen"; channel: string }
  /** Drop one listener, by identity. */
  | { kind: "unlistenOne"; channel: string }
  /** Drop every listener on a channel — possibly several channels. */
  | { kind: "unlisten"; channels: string[] }
  /** Broadcast within the browser, the way the widgets do under Electron. */
  | { kind: "emit"; channel: string };

export type Namespace = { [key: string]: Spec | Namespace };

const invoke = (channel: string): Spec => ({ kind: "invoke", channel });
const listen = (channel: string): Spec => ({ kind: "listen", channel });
const unlistenOne = (channel: string): Spec => ({
  kind: "unlistenOne",
  channel,
});
const unlisten = (...channels: string[]): Spec => ({
  kind: "unlisten",
  channels,
});
const emit = (channel: string): Spec => ({ kind: "emit", channel });

/** A CRUD namespace, which most of the model namespaces are. */
const crud = (prefix: string, extra: Namespace = {}): Namespace => ({
  findAll: invoke(`${prefix}-find-all`),
  findOne: invoke(`${prefix}-find-one`),
  create: invoke(`${prefix}-create`),
  update: invoke(`${prefix}-update`),
  destroy: invoke(`${prefix}-destroy`),
  ...extra,
});

export const channels: Namespace = {
  onNotification: listen("on-notification"),
  lookup: emit("on-lookup"),
  onLookup: listen("on-lookup"),
  offLookup: unlisten("on-lookup"),
  onTranslate: listen("on-translate"),
  offTranslate: unlisten("on-translate"),

  system: {
    preferences: {
      mediaAccess: invoke("system-preferences-media-access"),
    },
    proxy: {
      get: invoke("system-proxy-get"),
      set: invoke("system-proxy-set"),
      refresh: invoke("system-proxy-refresh"),
    },
  },

  providers: {
    audible: {
      categories: invoke("audible-provider-categories"),
      bestsellers: invoke("audible-provider-bestsellers"),
    },
    ted: {
      talks: invoke("ted-provider-talks"),
      ideas: invoke("ted-provider-ideas"),
      downloadTalk: invoke("ted-provider-download-talk"),
    },
    youtube: {
      videos: invoke("youtube-provider-videos"),
    },
  },

  appSettings: {
    get: invoke("app-settings-get"),
    set: invoke("app-settings-set"),
    getLibrary: invoke("app-settings-get-library"),
    setLibrary: invoke("app-settings-set-library"),
    getSessions: invoke("app-settings-get-sessions"),
    getUser: invoke("app-settings-get-user"),
    setUser: invoke("app-settings-set-user"),
    getUserDataPath: invoke("app-settings-get-user-data-path"),
    getApiUrl: invoke("app-settings-get-api-url"),
    setApiUrl: invoke("app-settings-set-api-url"),
  },

  userSettings: {
    get: invoke("user-settings-get"),
    set: invoke("user-settings-set"),
  },

  path: {
    join: invoke("path-join"),
  },

  db: {
    connect: invoke("db-connect"),
    disconnect: invoke("db-disconnect"),
    onTransaction: listen("db-on-transaction"),
    removeListeners: unlisten("db-on-transaction"),
  },

  camdict: {
    lookup: invoke("camdict-lookup"),
  },

  mdict: {
    remove: invoke("mdict-remove"),
    getResource: invoke("mdict-read-file"),
    lookup: invoke("mdict-lookup"),
    import: invoke("mdict-import"),
  },

  dict: {
    getDicts: invoke("dict-list"),
    remove: invoke("dict-remove"),
    getResource: invoke("dict-read-file"),
    lookup: invoke("dict-lookup"),
    import: invoke("dict-import"),
  },

  audios: crud("audios", {
    upload: invoke("audios-upload"),
    crop: invoke("audios-crop"),
    cleanUp: invoke("audios-clean-up"),
  }),

  videos: crud("videos", {
    upload: invoke("videos-upload"),
    crop: invoke("videos-crop"),
    cleanUp: invoke("videos-clean-up"),
  }),

  recordings: crud("recordings", {
    sync: invoke("recordings-sync"),
    syncAll: invoke("recordings-sync-all"),
    destroyBulk: invoke("recordings-destroy-bulk"),
    upload: invoke("recordings-upload"),
    stats: invoke("recordings-stats"),
    groupByDate: invoke("recordings-group-by-date"),
    groupByTarget: invoke("recordings-group-by-target"),
    groupBySegment: invoke("recordings-group-by-segment"),
    statsForDeleteBulk: invoke("recordings-stats-for-delete-bulk"),
    export: invoke("recordings-export"),
  }),

  conversations: crud("conversations", {
    migrate: invoke("conversations-migrate"),
  }),

  pronunciationAssessments: crud("pronunciation-assessments"),

  messages: {
    findAll: invoke("messages-find-all"),
    findOne: invoke("messages-find-one"),
    createInBatch: invoke("messages-create-in-batch"),
    destroy: invoke("messages-destroy"),
    createSpeech: invoke("messages-create-speech"),
  },

  speeches: {
    findOne: invoke("speeches-find-one"),
    create: invoke("speeches-create"),
    delete: invoke("speeches-delete"),
  },

  audiowaveform: {
    generate: invoke("audiowaveform-generate"),
    frequencies: invoke("audiowaveform-frequencies"),
  },

  echogarden: {
    getPackagesDir: invoke("echogarden-get-packages-dir"),
    recognize: invoke("echogarden-recognize"),
    align: invoke("echogarden-align"),
    alignSegments: invoke("echogarden-align-segments"),
    wordToSentenceTimeline: invoke("echogarden-word-to-sentence-timeline"),
    transcode: invoke("echogarden-transcode"),
    check: invoke("echogarden-check"),
    checkAlign: invoke("echogarden-check-align"),
  },

  ffmpeg: {
    check: invoke("ffmpeg-check-command"),
    transcode: invoke("ffmpeg-transcode"),
  },

  decompress: {
    dashboard: invoke("decompress-tasks"),
    onComplete: listen("decompress-task-done"),
    // The mismatch with `onComplete` above is the preload script's, kept rather
    // than quietly corrected here: fixing it belongs in both places at once.
    onUpdate: listen("decompress-tasks-update"),
    removeAllListeners: unlisten("decompress-tasks-update", "decompress-tasks-done"),
  },

  download: {
    start: invoke("download-start"),
    printAsPdf: invoke("print-as-pdf"),
    cancel: invoke("download-cancel"),
    pause: invoke("download-pause"),
    remove: invoke("download-remove"),
    resume: invoke("download-resume"),
    cancelAll: invoke("download-cancel-all"),
    dashboard: invoke("download-dashboard"),
    onState: listen("download-on-state"),
    removeAllListeners: unlisten("download-on-state"),
  },

  cacheObjects: {
    get: invoke("cache-objects-get"),
    set: invoke("cache-objects-set"),
    delete: invoke("cache-objects-delete"),
    clear: invoke("cache-objects-clear"),
    writeFile: invoke("cache-objects-write-file"),
  },

  transcriptions: {
    findOrCreate: invoke("transcriptions-find-or-create"),
    update: invoke("transcriptions-update"),
  },

  waveforms: {
    find: invoke("waveforms-find"),
    save: invoke("waveforms-save"),
  },

  segments: {
    findAll: invoke("segments-find-all"),
    find: invoke("segments-find"),
    create: invoke("segments-create"),
    sync: invoke("segments-sync"),
  },

  notes: {
    groupByTarget: invoke("notes-group-by-target"),
    groupBySegment: invoke("notes-group-by-segment"),
    findAll: invoke("notes-find-all"),
    update: invoke("notes-update"),
    delete: invoke("notes-delete"),
    create: invoke("notes-create"),
    sync: invoke("notes-sync"),
  },

  chats: crud("chats"),
  chatAgents: crud("chat-agents"),
  chatMembers: crud("chat-members"),
  chatMessages: crud("chat-messages"),

  documents: crud("documents", {
    upload: invoke("documents-upload"),
    cleanUp: invoke("documents-clean-up"),
  }),
};
