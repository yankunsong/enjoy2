import { t } from "i18next";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@renderer/components/ui";
import { AISettingsProviderContext } from "@renderer/context";
import { useContext } from "react";
import { SttEngineOptionEnum } from "@/types/enums";

export const SttSettings = () => {
  const { sttEngine, setSttEngine } = useContext(AISettingsProviderContext);

  return (
    <div className="flex items-start justify-between py-4">
      <div className="">
        <div className="flex items-center mb-2">
          <span>{t("sttAiService")}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {sttEngine === SttEngineOptionEnum.ENJOY_AZURE &&
            t("enjoyAzureSpeechToTextDescription")}
          {sttEngine === SttEngineOptionEnum.ENJOY_CLOUDFLARE &&
            t("enjoyCloudflareSpeechToTextDescription")}
          {sttEngine === SttEngineOptionEnum.OPENAI &&
            t("openaiSpeechToTextDescription")}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Select
          value={sttEngine}
          onValueChange={(value) => {
            setSttEngine(value);
          }}
        >
          <SelectTrigger className="min-w-fit">
            <SelectValue placeholder="service"></SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SttEngineOptionEnum.OPENAI}>OpenAI</SelectItem>
            <SelectItem value={SttEngineOptionEnum.ENJOY_AZURE}>
              {t("enjoyAzure")}
            </SelectItem>
            <SelectItem value={SttEngineOptionEnum.ENJOY_CLOUDFLARE}>
              {t("enjoyCloudflare")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
