import {
  AppSettingsProviderContext,
  AISettingsProviderContext,
} from "@renderer/context";
import { useContext } from "react";
import OpenAI from "openai";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { t } from "i18next";
import { elevenLabsSpeech } from "@renderer/lib/elevenlabs";

export const useSpeech = () => {
  const { EnjoyApp, webApi, user, apiUrl, learningLanguage } = useContext(
    AppSettingsProviderContext
  );
  const { openai, ttsConfig, elevenlabs } = useContext(
    AISettingsProviderContext
  );

  const tts = async (params: Partial<SpeechType>) => {
    const { configuration } = params;
    const { engine, model, voice } = configuration || ttsConfig;

    let buffer;
    // On the engine first, not the model: ElevenLabs names its models
    // `eleven_*`, and matching those by prefix as well would be a second rule
    // saying the same thing.
    if (engine === "elevenlabs") {
      buffer = await elevenLabsTTS(params);
    } else if (model.match(/^(openai|tts-)/)) {
      buffer = await openaiTTS(params);
    } else if (model.startsWith("azure")) {
      buffer = await azureTTS(params);
    }

    return EnjoyApp.speeches.create(
      {
        text: params.text,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        section: params.section,
        segment: params.segment,
        configuration: {
          engine,
          model,
          voice,
        },
      },
      {
        type: "audio/mp3",
        arrayBuffer: buffer,
      }
    );
  };

  /**
   * Speech on the user's own ElevenLabs key.
   *
   * Azure's branch below asks Hosted Enjoy for a short-lived token against an
   * account; this one has a key, so there is nothing to ask. When a box is
   * empty it says which one rather than sending a request that cannot work —
   * the same trade Assessment makes in `use-pronunciation-assessments`.
   */
  const elevenLabsTTS = async (
    params: Partial<SpeechType>
  ): Promise<ArrayBuffer> => {
    const { configuration } = params;
    const { model = ttsConfig.model, voice = ttsConfig.voice } =
      configuration || {};

    if (!elevenlabs?.key) {
      throw new Error(t("elevenLabsKeyIsRequired"));
    }

    if (!voice) {
      throw new Error(t("elevenLabsVoiceIsRequired"));
    }

    return elevenLabsSpeech({
      key: elevenlabs.key,
      voiceId: voice,
      modelId: model,
      text: params.text,
    });
  };

  const openaiTTS = async (params: Partial<SpeechType>) => {
    const { configuration } = params;
    const {
      engine = ttsConfig.engine,
      model = ttsConfig.model,
      voice = ttsConfig.voice,
      baseUrl,
    } = configuration || {};

    let client: OpenAI;

    if (engine === "enjoyai") {
      client = new OpenAI({
        apiKey: user.accessToken,
        baseURL: `${apiUrl}/api/ai`,
        dangerouslyAllowBrowser: true,
        maxRetries: 1,
      });
    } else if (openai) {
      client = new OpenAI({
        apiKey: openai.key,
        baseURL: baseUrl || openai.baseUrl,
        dangerouslyAllowBrowser: true,
        maxRetries: 1,
      });
    } else {
      throw new Error(t("openaiKeyRequired"));
    }

    const file = await client.audio.speech.create({
      input: params.text,
      model: model.replace("openai/", ""),
      voice,
    });

    return file.arrayBuffer();
  };

  const azureTTS = async (
    params: Partial<SpeechType>
  ): Promise<ArrayBuffer> => {
    const { configuration = ttsConfig, text } = params;
    const { model, voice } = configuration;

    if (model !== "azure/speech") return;

    const { id, token, region } = await webApi.generateSpeechToken({
      purpose: "tts",
      input: text,
    });
    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
    speechConfig.speechRecognitionLanguage = learningLanguage;
    speechConfig.speechSynthesisVoiceName = voice;

    // const speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig, sdk.AudioConfig.fromDefaultSpeakerOutput());
    // Do not playback audio when transcribed
    const speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    return new Promise((resolve, reject) => {
      speechSynthesizer.speakTextAsync(
        text,
        (result) => {
          speechSynthesizer.close();

          if (result && result.audioData) {
            webApi.consumeSpeechToken(id);
            resolve(result.audioData);
          } else {
            webApi.revokeSpeechToken(id);
            reject(result);
          }
        },
        (error) => {
          speechSynthesizer.close();
          webApi.revokeSpeechToken(id);
          reject(error);
        }
      );
    });
  };

  return {
    tts,
  };
};
