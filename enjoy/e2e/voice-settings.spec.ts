import { expect, test } from "@playwright/test";
import { sameVoice } from "../src/voice-settings";

/**
 * Whether a Speech already on disk was spoken in the voice now chosen.
 *
 * A Diary's Speech is looked up by the text it speaks, and by nothing else. So
 * changing the voice and saving used to do nothing anybody could see: the same
 * audio was found, in the old voice, with no button offering to make another
 * and nothing on screen admitting why. The setting appeared to be ignored.
 *
 * This is the question the panel had no way to ask. Only three fields reach a
 * synthesiser — `use-speech.tsx` destructures `engine`, `model` and `voice`,
 * and `speeches-create` stores those three — so those three are what "the same
 * voice" means. `language` is not among them: it filters Azure's voice list on
 * the way in and is never sent, so a Diary whose language changed and whose
 * voice did not still says exactly what it said before.
 */

const azure = {
  engine: "enjoyai",
  model: "azure/speech",
  voice: "en-US-AriaNeural",
};

test("calls two identical settings the same voice", () => {
  expect(sameVoice(azure, { ...azure })).toBe(true);
});

test("hears a different voice in the same engine and model", () => {
  expect(sameVoice(azure, { ...azure, voice: "en-US-GuyNeural" })).toBe(false);
});

test("hears a different model in the same engine and voice", () => {
  expect(
    sameVoice(
      { engine: "elevenlabs", model: "eleven_multilingual_v2", voice: "abc" },
      { engine: "elevenlabs", model: "eleven_v3", voice: "abc" }
    )
  ).toBe(false);
});

test("hears a different engine", () => {
  expect(sameVoice(azure, { ...azure, engine: "openai" })).toBe(false);
});

test("ignores a language, which never reaches the synthesiser", () => {
  expect(
    sameVoice({ ...azure, language: "en-US" }, { ...azure, language: "zh-CN" })
  ).toBe(true);
});

test("claims nothing about a Speech that recorded no settings", () => {
  expect(sameVoice(undefined, azure)).toBe(true);
  expect(sameVoice({}, azure)).toBe(true);
  expect(sameVoice(azure, undefined)).toBe(true);
});
