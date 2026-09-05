/**
 * The settings that decide how a piece of text sounds.
 *
 * Three fields, and only three: `use-speech.tsx` destructures `engine`,
 * `model` and `voice` before calling any synthesiser, and `speeches-create`
 * stores those three against the Speech it writes. A `language` travels with
 * them through the forms — it filters Azure's several hundred voices down to
 * the ones worth showing — but it is never sent anywhere, so two settings that
 * differ only in language produce the same audio.
 */
export type VoiceSettings = {
  engine?: string;
  model?: string;
  voice?: string;
};

/**
 * Whether audio made under `a` would sound like audio made under `b`.
 *
 * A Speech is found by the text it speaks, so nothing else notices when the
 * voice moves on. This is how a panel showing an old Speech can tell that it
 * is old, and offer to say the text again rather than leaving the new setting
 * looking ignored.
 *
 * Settings that are absent answer `true`. A Speech from before this question
 * existed, or one stored with nothing in its configuration, gives no grounds
 * for telling the user their audio is out of date — and a warning that might
 * be wrong is worse than no warning at all.
 */
export const sameVoice = (a?: VoiceSettings, b?: VoiceSettings): boolean => {
  if (!settled(a) || !settled(b)) return true;

  return a.engine === b.engine && a.model === b.model && a.voice === b.voice;
};

/** Settings that actually say which voice they mean. */
const settled = (settings?: VoiceSettings): settings is VoiceSettings =>
  Boolean(settings?.engine && settings?.model && settings?.voice);
