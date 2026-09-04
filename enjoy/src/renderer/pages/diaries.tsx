import { Button, Input, toast } from "@renderer/components/ui";
import { DiaryCard, LoaderSpin } from "@renderer/components";
import { useContext, useEffect, useState } from "react";
import { AppSettingsProviderContext } from "@renderer/context";
import { t } from "i18next";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "@uidotdev/usehooks";
import { PlusIcon } from "lucide-react";

export default () => {
  const [diaries, setDiaries] = useState<DiaryType[]>([]);
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const { EnjoyApp } = useContext(AppSettingsProviderContext);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 500);

  const fetchDiaries = () => {
    setLoading(true);
    EnjoyApp.diaries
      .findAll({ query: debouncedQuery })
      .then((diaries) => setDiaries(diaries))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  // A blank Diary is created straight away and opened, the way a notes app
  // does: there is nothing to fill in before you can start writing, and the
  // title arrives on its own from the first line.
  const createDiary = () => {
    if (creating) return;

    setCreating(true);
    EnjoyApp.diaries
      .create({})
      .then((diary) => navigate(`/diaries/${diary.id}`))
      .catch((err) => toast.error(err.message))
      .finally(() => setCreating(false));
  };

  useEffect(() => {
    fetchDiaries();
  }, [debouncedQuery]);

  return (
    <div className="min-h-full max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <Input
          className="max-w-48"
          placeholder={t("search")}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button onClick={createDiary} disabled={creating}>
          <PlusIcon className="w-4 h-4 mr-2" />
          {t("newDiary")}
        </Button>
      </div>

      {loading ? (
        <LoaderSpin />
      ) : diaries.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          {t("noDiariesYet")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {diaries.map((diary) => (
            <DiaryCard
              key={diary.id}
              diary={diary}
              onDelete={() =>
                setDiaries(diaries.filter((d) => d.id !== diary.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
