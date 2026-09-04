import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from "@renderer/components/ui";
import { SettingsIcon } from "lucide-react";
import { useContext, useState } from "react";
import { DiaryConfigForm } from "@renderer/components";
import { AppSettingsProviderContext } from "@renderer/context";
import { t } from "i18next";

export const DiaryConfigButton = (props: {
  diary: DiaryType;
  onUpdate?: (diary: DiaryType) => void;
}) => {
  const { diary, onUpdate } = props;
  const [configOpen, setConfigOpen] = useState(false);
  const { EnjoyApp } = useContext(AppSettingsProviderContext);

  return (
    <Popover open={configOpen} onOpenChange={setConfigOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <SettingsIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80">
        <DiaryConfigForm
          config={diary.config}
          onSubmit={(data: any) => {
            return EnjoyApp.diaries
              .update(diary.id, { config: data.config })
              .then((updated) => {
                toast.success(t("saved"));
                onUpdate?.(updated);
                setConfigOpen(false);
              })
              .catch((err) => {
                toast.error(err.message);
              });
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
