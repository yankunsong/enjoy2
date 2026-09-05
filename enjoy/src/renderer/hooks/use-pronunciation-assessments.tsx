import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { useContext } from "react";
import { t } from "i18next";
import { isLocalWebEnjoy } from "@/distribution";
import {
  AISettingsProviderContext,
  AppSettingsProviderContext,
} from "@renderer/context";
import camelcaseKeys from "camelcase-keys";
import { map, forEach, sum, filter, cloneDeep } from "lodash";
import * as Diff from "diff";
import {
  mergeAssessedUtterances,
  supportsProsodyAssessment,
  type AssessedUtterance,
} from "@/pronunciation-score";

const THIRTY_SECONDS = 30 * 1000;

/**
 * The assessment configuration both paths share.
 *
 * Prosody is the one part of it that costs extra — it is an enhanced add-on,
 * billed by the hour on top of the transcription itself — so it is asked for
 * only when it was asked for, and only in the one locale Azure offers it in.
 * Requesting it elsewhere would be paying for an answer that does not come.
 */
const assessmentConfigFor = (params: {
  reference: string;
  language: string;
  prosody?: boolean;
}) => {
  const { reference, language, prosody } = params;

  const config = new sdk.PronunciationAssessmentConfig(
    reference,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    true
  );
  config.phonemeAlphabet = "IPA";

  if (prosody && supportsProsodyAssessment(language)) {
    config.enableProsodyAssessment = true;
  }

  return config;
};
export const usePronunciationAssessments = () => {
  const { webApi, EnjoyApp } = useContext(AppSettingsProviderContext);
  const { azureSpeech } = useContext(AISettingsProviderContext);

  /**
   * How the Azure SDK is told who is asking.
   *
   * Desktop Enjoy asks Hosted Enjoy for a short-lived authorization token
   * against an account. With the user's own resource there is no token to
   * fetch and nothing to ask: the key speaks for itself, and asking Hosted
   * Enjoy anyway would answer with the empty object `fake-web-api.ts` returns,
   * leaving `token` and `region` undefined and the failure to surface deep
   * inside the SDK.
   */
  const speechConfig = async (params: {
    targetId: string;
    targetType: string;
  }): Promise<{ config: sdk.SpeechConfig; tokenId?: number }> => {
    if (azureSpeech?.key && azureSpeech?.region) {
      return {
        config: sdk.SpeechConfig.fromSubscription(
          azureSpeech.key,
          azureSpeech.region
        ),
      };
    }

    if (isLocalWebEnjoy) {
      // The one distribution that has no account to fall back on, so say which
      // two boxes are empty rather than fail somewhere less obvious.
      throw new Error(t("azureSpeechKeyIsRequired"));
    }

    const { id, token, region } = await webApi.generateSpeechToken({
      purpose: "pronunciation_assessment",
      ...params,
    });

    return {
      config: sdk.SpeechConfig.fromAuthorizationToken(token, region),
      tokenId: id,
    };
  };

  const createAssessment = async (params: {
    language: string;
    recording: RecordingType;
    reference?: string;
    targetId?: string;
    targetType?: string;
    /** Whether to pay for prosody on top of the assessment itself. */
    prosody?: boolean;
  }) => {
    let { recording, targetId, targetType } = params;
    if (targetId && targetType && !recording) {
      recording = await EnjoyApp.recordings.findOne({ targetId });
    }

    EnjoyApp.recordings.sync(recording.id);
    const url = await EnjoyApp.echogarden.transcode(recording.src);
    const blob = await (await fetch(url)).blob();
    targetId = recording.id;
    targetType = "Recording";

    const { language, reference = recording.referenceText } = params;

    const { config, tokenId } = await speechConfig({ targetId, targetType });

    let result = null;

    if (recording.duration < THIRTY_SECONDS) {
      result = await assess(
        {
          blob,
          language,
          reference,
          prosody: params.prosody,
        },
        config
      );
    } else {
      result = await continousAssess(
        {
          blob,
          language,
          reference,
          prosody: params.prosody,
        },
        config
      );
    }

    console.log("assess result: ", result);
    const resultJson = camelcaseKeys(
      JSON.parse(JSON.stringify(result.detailResult)),
      {
        deep: true,
      }
    );
    resultJson.tokenId = tokenId;
    resultJson.duration = recording?.duration;

    return EnjoyApp.pronunciationAssessments.create({
      targetId: recording.id,
      targetType: "Recording",
      pronunciationScore: result.pronunciationScore,
      accuracyScore: result.accuracyScore,
      completenessScore: result.completenessScore,
      fluencyScore: result.fluencyScore,
      prosodyScore: result.prosodyScore,
      grammarScore: result.contentAssessmentResult?.grammarScore,
      vocabularyScore: result.contentAssessmentResult?.vocabularyScore,
      topicScore: result.contentAssessmentResult?.topicScore,
      result: resultJson,
      language: params.language || recording.language,
    });
  };

  const assess = async (
    params: {
      blob: Blob;
      language: string;
      reference?: string;
      prosody?: boolean;
    },
    config: sdk.SpeechConfig
  ): Promise<sdk.PronunciationAssessmentResult> => {
    const { blob, language, reference } = params;
    const audioConfig = sdk.AudioConfig.fromWavFileInput(
      new File([blob], "audio.wav")
    );

    const pronunciationAssessmentConfig = assessmentConfigFor({
      reference,
      language,
      prosody: params.prosody,
    });

    // setting the recognition language
    config.speechRecognitionLanguage = language;

    // create the speech recognizer.
    const reco = new sdk.SpeechRecognizer(config, audioConfig);
    pronunciationAssessmentConfig.applyTo(reco);

    return new Promise((resolve, reject) => {
      reco.recognizeOnceAsync((result) => {
        reco.close();

        switch (result.reason) {
          case sdk.ResultReason.RecognizedSpeech: {
            const pronunciationResult =
              sdk.PronunciationAssessmentResult.fromResult(result);
            console.debug(
              "Received pronunciation assessment result.",
              pronunciationResult.detailResult
            );
            resolve(pronunciationResult);
            break;
          }
          case sdk.ResultReason.NoMatch:
            reject(new Error("No speech could be recognized."));
            break;
          case sdk.ResultReason.Canceled: {
            const cancellationDetails =
              sdk.CancellationDetails.fromResult(result);
            console.debug(
              "CANCELED: Reason=" +
                cancellationDetails.reason +
                " ErrorDetails=" +
                cancellationDetails.errorDetails
            );
            reject(new Error(cancellationDetails.errorDetails));
            break;
          }
          default:
            reject(result);
        }
      });
    });
  };

  /**
   * A Recording too long for one-shot recognition, scored as a whole.
   *
   * Azure hands back one result per utterance here, and what the Recording
   * scored is a question the SDK does not answer — `mergeAssessedUtterances`
   * does, rebuilding each component from what it is made of rather than
   * averaging the utterances flat. See `src/pronunciation-score.ts`.
   */
  const continousAssess = async (
    params: {
      blob: Blob;
      language: string;
      reference?: string;
      prosody?: boolean;
    },
    config: sdk.SpeechConfig
  ): Promise<sdk.PronunciationAssessmentResult> => {
    const { blob, language, reference } = params;
    const audioConfig = sdk.AudioConfig.fromWavFileInput(
      new File([blob], "audio.wav")
    );

    const pronunciationAssessmentConfig = assessmentConfigFor({
      reference,
      language,
      prosody: params.prosody,
    });

    // setting the recognition language
    config.speechRecognitionLanguage = language;

    // create the speech recognizer.
    const reco = new sdk.SpeechRecognizer(config, audioConfig);
    pronunciationAssessmentConfig.applyTo(reco);

    return new Promise((resolve, reject) => {
      const utterances: AssessedUtterance[] = [];

      // Cancellation rejects and the session stops immediately afterwards, so
      // both ends of the recognition would answer the same promise. The first
      // one to speak is the one that knows why it ended.
      let settled = false;
      const succeed = (result: sdk.PronunciationAssessmentResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      // The event recognized signals that a final recognition result is received.
      // For continuous recognition, you will get one recognized event for each
      // phrase recognized.
      reco.recognized = function (s, e) {
        const assessed = sdk.PronunciationAssessmentResult.fromResult(e.result);
        if (!assessed?.detailResult) return;

        console.debug("pronunciation assessment for: ", e.result.text);
        utterances.push(JSON.parse(JSON.stringify(assessed.detailResult)));
      };

      // The event signals that the service has stopped processing speech.
      // https://docs.microsoft.com/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognitioncanceledeventargs?view=azure-node-latest
      // This can happen for two broad classes of reasons.
      // 1. An error is encountered.
      //    In this case the .errorDetails property will contain a textual representation of the error.
      // 2. Speech was detected to have ended.
      //    This can be caused by the end of the specified file being reached, or ~20 seconds of silence from a microphone input.
      reco.canceled = function (s, e) {
        if (e.reason === sdk.CancellationReason.Error) {
          console.error(
            "(cancel) Reason: " +
              sdk.CancellationReason[e.reason] +
              ": " +
              e.errorDetails
          );
          fail(new Error(e.errorDetails));
        }
        reco.stopContinuousRecognitionAsync();
      };

      // Signals the end of a session with the speech service.
      reco.sessionStopped = function (s, e) {
        reco.stopContinuousRecognitionAsync();
        reco.close();

        try {
          const detailResult = mergeAssessedUtterances(utterances);
          const scores = detailResult.PronunciationAssessment;
          console.debug("Merged detail result:", detailResult);

          succeed({
            pronunciationScore: scores.PronScore,
            accuracyScore: scores.AccuracyScore,
            completenessScore: scores.CompletenessScore,
            fluencyScore: scores.FluencyScore,
            prosodyScore: scores.ProsodyScore,
            detailResult,
            contentAssessmentResult: detailResult.ContentAssessmentResult,
          } as unknown as sdk.PronunciationAssessmentResult);
        } catch (error) {
          fail(error as Error);
        }
      };

      reco.startContinuousRecognitionAsync();
    });
  };

  return {
    createAssessment,
    assess,
    continousAssess,
  };
};
