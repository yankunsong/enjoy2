import { AppSettingsProviderContext } from "@renderer/context";
import { useSpeech } from "@renderer/hooks";
import { useContext, useEffect, useState } from "react";
import { Button, toast } from "@renderer/components/ui";
import { LoaderSpin, WavesurferPlayer } from "@renderer/components";
import { t } from "i18next";
import { AudioLinesIcon, LoaderIcon, MicIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Turns a Diary into something you can hear, and then into something you can
 * shadow.
 *
 * The Speech is looked up by the exact text it speaks, so editing the Diary
 * silently puts this back to "not generated yet" — and nothing is destroyed on
 * the way. An earlier Speech, and any Audio and Recordings that grew out of it,
 * outlive the text they came from.
 */
export const DiarySpeech = (props: { diary: DiaryType }) => {
  const { diary } = props;
  const { EnjoyApp } = useContext(AppSettingsProviderContext);
  const { tts } = useSpeech();
  const navigate = useNavigate();

  const [speech, setSpeech] = useState<SpeechType | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resourcing, setResourcing] = useState(false);

  const text = (diary.content || "").trim();

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

  const generate = async () => {
    if (generating || !text) return;

    setGenerating(true);
    tts({
      sourceId: diary.id,
      sourceType: "Diary",
      // A Diary is spoken whole: the shadowing player splits the result into
      // sentences itself, by aligning it against the text it already knows.
      // Sectioning here would only be a worse guess at the same thing.
      section: 0,
      segment: 0,
      text,
      configuration: diary.config?.tts,
    })
      .then((res) => setSpeech(res))
      .catch((err) => toast.error(err.message))
      .finally(() => setGenerating(false));
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
      </div>
    </div>
  );
};
