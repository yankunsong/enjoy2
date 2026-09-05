import {
  AppSettingsProviderContext,
  AISettingsProviderContext,
} from "@renderer/context";
import { useSpeech } from "@renderer/hooks";
import { useContext, useEffect, useState } from "react";
import { Button, toast } from "@renderer/components/ui";
import { LoaderSpin, WavesurferPlayer } from "@renderer/components";
import { t } from "i18next";
import {
  AudioLinesIcon,
  LoaderIcon,
  MicIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { sameVoice } from "@/voice-settings";

/**
 * Turns a Diary into something you can hear, and then into something you can
 * shadow.
 *
 * The Speech is looked up by the exact text it speaks, so editing the Diary
 * silently puts this back to "not generated yet" — and nothing is destroyed on
 * the way. An earlier Speech, and any Audio and Recordings that grew out of it,
 * outlive the text they came from.
 *
 * The voice is not part of that lookup, and cannot be: the settings live on the
 * Diary, the Speech is one row, and choosing a new voice changes neither the
 * text nor which row is found. So changing the voice used to be invisible —
 * saving the setting produced the same audio, in the old voice, with nothing on
 * screen to say why. It is said here instead, next to a button that speaks the
 * Diary again.
 */
export const DiarySpeech = (props: { diary: DiaryType }) => {
  const { diary } = props;
  const { EnjoyApp } = useContext(AppSettingsProviderContext);
  const { ttsConfig } = useContext(AISettingsProviderContext);
  const { tts } = useSpeech();
  const navigate = useNavigate();

  const [speech, setSpeech] = useState<SpeechType | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resourcing, setResourcing] = useState(false);

  const text = (diary.content || "").trim();

  // What this Diary would be spoken in if it were spoken now. A Diary that has
  // never had its own settings falls back to the app's, which is the same
  // fallback `useSpeech` makes at the point of synthesis.
  const config = diary.config?.tts || ttsConfig;

  const findSpeech = async () => {
    if (!text) {
      setSpeech(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    EnjoyApp.speeches
      .findOne({
        sourceId: diary.id,
        sourceType: "Diary",
        text,
      })
      .then((found) => setSpeech(found || null))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  /**
   * Speaks the Diary, replacing whatever it said before.
   *
   * Synthesised first and the old Speech destroyed second, so a synthesis that
   * fails — a bad key, a spent quota, a diary past the model's character limit
   * — leaves the Diary with the audio it already had rather than with none.
   *
   * And destroyed only when the new Speech really is another row. The same text
   * in the same voice hashes to the same file, and `speeches-create` answers
   * that collision by handing back the Speech already stored; deleting it would
   * be deleting what was just returned. Two rows for one text and one source is
   * the ambiguity worth avoiding here, since `findSpeech` asks for one and lets
   * the database choose which.
   *
   * What grew out of the old Speech is untouched either way. A Media keeps its
   * own copy of the file, so a Diary already being shadowed stays shadowable,
   * with every Recording made against it.
   */
  const generate = async () => {
    if (generating || !text) return;

    const previous = speech;
    setGenerating(true);

    try {
      const created = await tts({
        sourceId: diary.id,
        sourceType: "Diary",
        // A Diary is spoken whole: the shadowing player splits the result into
        // sentences itself, by aligning it against the text it already knows.
        // Sectioning here would only be a worse guess at the same thing.
        section: 0,
        segment: 0,
        text,
        configuration: config,
      });

      setSpeech(created || null);

      if (created && previous && created.id !== previous.id) {
        await EnjoyApp.speeches.delete(previous.id);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Hands the synthesised file to the Media library, seeded with the text it
   * speaks, and goes to the shadowing player.
   *
   * `originalText` is what saves a round of Transcription: the player aligns
   * text it was given rather than transcribing audio to recover words we wrote
   * ourselves.
   */
  const startShadow = async () => {
    if (!speech || resourcing) return;

    setResourcing(true);
    try {
      let audio = await EnjoyApp.audios.findOne({ md5: speech.md5 });

      if (!audio) {
        audio = await EnjoyApp.audios.create(speech.filePath, {
          name: `[${t("sidebar.diary")}] ${diary.title || t("untitledDiary")}`,
          originalText: speech.text,
        });
      }

      navigate(`/audios/${audio.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResourcing(false);
    }
  };

  useEffect(() => {
    findSpeech();
  }, [diary.id, text]);

  if (!text) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        {t("writeSomethingToGenerateSpeech")}
      </div>
    );
  }

  if (loading) return <LoaderSpin />;

  if (!speech) {
    return (
      <div className="py-4">
        <Button onClick={generate} disabled={generating}>
          {generating ? (
            <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <AudioLinesIcon className="w-4 h-4 mr-2" />
          )}
          {t("generateSpeech")}
        </Button>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-3">
      <WavesurferPlayer id={speech.id} src={speech.src} height={80} />

      <div className="flex items-center gap-2">
        <Button onClick={startShadow} disabled={resourcing}>
          {resourcing ? (
            <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <MicIcon className="w-4 h-4 mr-2" />
          )}
          {t("startShadowing")}
        </Button>

        <Button variant="outline" onClick={generate} disabled={generating}>
          {generating ? (
            <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <RefreshCwIcon className="w-4 h-4 mr-2" />
          )}
          {t("regenerateSpeech")}
        </Button>
      </div>

      {!sameVoice(speech.configuration, config) && (
        <div className="text-xs text-muted-foreground">
          {t("speechWasSpokenInAnotherVoice")}
        </div>
      )}
    </div>
  );
};
