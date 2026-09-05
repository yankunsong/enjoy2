import { t } from "i18next";
import { Switch } from "@renderer/components/ui";
import { useContext } from "react";
import { AppSettingsProviderContext } from "@renderer/context";

export const AssessmentSettings = () => {
  const { assessmentConfig, setAssessmentConfig } = useContext(
    AppSettingsProviderContext
  );

  return (
    <div className="flex items-start justify-between py-4">
      <div className="">
        <div className="mb-2">{t("autoAssessRecordings")}</div>
        <div className="text-sm text-muted-foreground">
          {t("autoAssessRecordingsDescription")}
        </div>
      </div>

      <div className="">
        <Switch
          checked={Boolean(assessmentConfig?.autoAssess)}
          onCheckedChange={() => {
            setAssessmentConfig({
              ...assessmentConfig,
              autoAssess: !assessmentConfig?.autoAssess,
            });
          }}
        />
      </div>
    </div>
  );
};

export const ProsodyAssessmentSettings = () => {
  const { assessmentConfig, setAssessmentConfig } = useContext(
    AppSettingsProviderContext
  );

  return (
    <div className="flex items-start justify-between py-4">
      <div className="">
        <div className="mb-2">{t("assessProsody")}</div>
        <div className="text-sm text-muted-foreground">
          {t("assessProsodyDescription")}
        </div>
      </div>

      <div className="">
        <Switch
          checked={Boolean(assessmentConfig?.assessProsody)}
          onCheckedChange={() => {
            setAssessmentConfig({
              ...assessmentConfig,
              assessProsody: !assessmentConfig?.assessProsody,
            });
          }}
        />
      </div>
    </div>
  );
};
