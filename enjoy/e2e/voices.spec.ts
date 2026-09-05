import { expect, test } from "@playwright/test";
import { fetchElevenLabsVoices } from "../src/renderer/lib/elevenlabs";

/**
 * What the voice list has to carry beyond a name and an id.
 *
 * A voice id says nothing about how a voice sounds, and the labels the app
 * shows — "Laid-Back, Casual, Resonant" — are somebody's words for a sound, not
 * the sound. Picking one blind meant synthesising a whole diary to find out.
 *
 * ElevenLabs already answers this: every voice `GET /v1/voices` returns comes
 * with `preview_url`, a hosted sample of that voice. It is the official demo,
 * it costs no credits, and it is served straight from the CDN — so the only
 * thing standing between the user and a preview is that the field was being
 * dropped on the way through. It isn't any more.
 */

const voicesResponse = (voices: unknown[]) =>
  ({
    ok: true,
    json: async () => ({ voices }),
  }) as Response;

test("keeps the sample ElevenLabs hosts for each voice", async () => {
  const fetched: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string) => {
    fetched.push(String(url));
    return voicesResponse([
      {
        name: "Roger",
        voice_id: "CwhRBWXzGAHq8TQ4Fs17",
        category: "premade",
        preview_url: "https://storage.googleapis.com/eleven-public/roger.mp3",
      },
    ]);
  }) as typeof globalThis.fetch;

  try {
    const voices = await fetchElevenLabsVoices("a-key");

    expect(voices).toEqual([
      {
        label: "Roger",
        value: "CwhRBWXzGAHq8TQ4Fs17",
        previewUrl: "https://storage.googleapis.com/eleven-public/roger.mp3",
      },
    ]);
    expect(fetched).toEqual(["https://api.elevenlabs.io/v1/voices"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("leaves the sample undefined when a voice has none", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    voicesResponse([
      { name: "Mine", voice_id: "cloned-id", category: "cloned" },
    ])) as typeof globalThis.fetch;

  try {
    const [voice] = await fetchElevenLabsVoices("a-key");

    expect(voice.label).toEqual("Mine (cloned)");
    expect(voice.previewUrl).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
