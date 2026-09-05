/**
 * ElevenLabs, spoken to directly with the user's own key.
 *
 * There is no SDK here and no proxy in front of it: two REST calls, both
 * documented and both stable, against `xi-api-key`. The rest of the app knows
 * ElevenLabs only through this module.
 */

const API_URL = "https://api.elevenlabs.io/v1";

export type ElevenLabsVoice = {
  label: string;
  value: string;
  /**
   * A hosted sample of this voice, when ElevenLabs has one — the same clip its
   * own voice library plays. Free to fetch and free to play: it is a file on a
   * CDN, not a synthesis, so previewing a voice costs no credits.
   */
  previewUrl?: string;
};

/**
 * The voices this key can reach — the account's built-in ones, whatever has
 * been added from the voice library, anything cloned.
 *
 * This is the only place the list exists. A voice is named by an id rather than
 * by a name every account shares, so unlike OpenAI's six there is nothing to
 * write down ahead of time.
 */
export const fetchElevenLabsVoices = async (
  key: string
): Promise<ElevenLabsVoice[]> => {
  const response = await fetch(`${API_URL}/voices`, {
    headers: { "xi-api-key": key },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const { voices = [] } = await response.json();

  return voices.map((voice: any) => ({
    // The category is worth seeing only when it says something: an account's
    // voices are nearly all `premade`, and a list where every row carries the
    // same suffix is a list with a wasted column. A cloned or generated voice
    // is the one you want to be able to pick out.
    label:
      voice.category && voice.category !== "premade"
        ? `${voice.name} (${voice.category})`
        : voice.name,
    value: voice.voice_id,
    previewUrl: voice.preview_url,
  }));
};

/**
 * Speaks `text`, and hands back the MP3 as bytes — the shape
 * `EnjoyApp.speeches.create` stores, the same as OpenAI's and Azure's.
 */
export const elevenLabsSpeech = async (params: {
  key: string;
  voiceId: string;
  modelId: string;
  text: string;
}): Promise<ArrayBuffer> => {
  const { key, voiceId, modelId, text } = params;

  const response = await fetch(`${API_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: modelId }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.arrayBuffer();
};

/**
 * What ElevenLabs said went wrong, in its own words where it gave any.
 *
 * A failure here is nearly always the key or the quota, and both are things the
 * user can act on — but only if the sentence survives the trip to the toast.
 */
const readError = async (response: Response): Promise<string> => {
  const fallback = `ElevenLabs: ${response.status} ${response.statusText}`;

  try {
    const body = await response.json();
    const detail = body?.detail;

    if (typeof detail === "string") return detail;
    if (typeof detail?.message === "string") return detail.message;

    return fallback;
  } catch {
    return fallback;
  }
};
