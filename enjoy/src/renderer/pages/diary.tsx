import { Input, Separator, Textarea, toast } from "@renderer/components/ui";
import {
  DiaryConfigButton,
  DiarySpeech,
  LoaderSpin,
} from "@renderer/components";
import { useContext, useEffect, useRef, useState } from "react";
import { AppSettingsProviderContext } from "@renderer/context";
import { t } from "i18next";
import { Link, useParams } from "react-router-dom";
import { useDebounce } from "@uidotdev/usehooks";
import { ChevronLeftIcon } from "lucide-react";

export default () => {
  const { id } = useParams<{ id: string }>();
  const { EnjoyApp } = useContext(AppSettingsProviderContext);

  // The saved Diary and the draft you are typing are deliberately two things:
  // the speech panel below reads the saved one, so it settles when your typing
  // does rather than flickering on every keystroke.
  const [diary, setDiary] = useState<DiaryType | null>(null);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const debouncedTitle = useDebounce(title, 1000);
  const debouncedContent = useDebounce(content, 1000);
  const loaded = useRef(false);

  const fetchDiary = () => {
    setLoading(true);
    EnjoyApp.diaries
      .findOne({ id })
      .then((diary) => {
        if (!diary) return;
        setDiary(diary);
        setTitle(diary.title || "");
        setContent(diary.content || "");
        loaded.current = true;
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  const save = () => {
    if (!loaded.current || !diary) return;
    if (debouncedTitle === diary.title && debouncedContent === diary.content) {
      return;
    }

    setSaving(true);
    EnjoyApp.diaries
      .update(diary.id, { title: debouncedTitle, content: debouncedContent })
      .then((updated) => {
        setDiary(updated);
        // The title may have been filled in from the first line on the way
        // through; show what was actually stored.
        setTitle(updated.title || "");
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setSaving(false));
  };

  useEffect(() => {
    fetchDiary();
  }, [id]);

  useEffect(() => {
    save();
  }, [debouncedTitle, debouncedContent]);

  if (loading) return <LoaderSpin />;

  if (!diary) {
    return (
      <div className="min-h-full max-w-3xl mx-auto px-4 py-6">
        <div className="text-center text-muted-foreground py-12">
          {t("models.diary.notFound")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full max-w-3xl mx-auto px-4 py-6 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Link to="/diaries" className="text-muted-foreground hover:text-primary">
          <ChevronLeftIcon className="w-5 h-5" />
        </Link>

        <Input
          className="border-none shadow-none text-lg font-semibold px-0 focus-visible:ring-0"
          placeholder={t("untitledDiary")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <span className="text-xs text-muted-foreground shrink-0 w-12 text-right">
          {saving ? t("saving") : ""}
        </span>

        <DiaryConfigButton diary={diary} onUpdate={setDiary} />
      </div>

      <Textarea
        className="flex-1 min-h-[16rem] resize-none border-none shadow-none px-0 focus-visible:ring-0 text-base leading-7"
        placeholder={t("writeYourDiaryHere")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <Separator className="my-2" />

      <DiarySpeech diary={diary} />
    </div>
  );
};
