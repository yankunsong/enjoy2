import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Form } from "@renderer/components/ui";
import { t } from "i18next";
import { TTSForm } from "@renderer/components";
import { LoaderIcon } from "lucide-react";
import { useContext, useState } from "react";
import { AISettingsProviderContext } from "@renderer/context";

const diaryConfigSchema = z.object({
  config: z.object({
    tts: z.object({
      engine: z.string(),
      model: z.string(),
      voice: z.string(),
      language: z.string(),
    }),
  }),
});

/**
 * A Diary configures only its voice. Document's form carries reading options —
 * translation, layout, advancing to the next paragraph — that belong to reading
 * a book, and a Diary is not read that way.
 */
export const DiaryConfigForm = (props: {
  config?: DiaryType["config"];
  onSubmit: (data: z.infer<typeof diaryConfigSchema>) => Promise<void>;
}) => {
  const { config, onSubmit } = props;
  const [submitting, setSubmitting] = useState<boolean>(false);
  const { ttsConfig } = useContext(AISettingsProviderContext);

  const tts = { ...(ttsConfig || {}), ...(config?.tts || {}) };
  if (!tts.language) {
    tts.language = "en-US";
  }

  const form = useForm<z.infer<typeof diaryConfigSchema>>({
    resolver: zodResolver(diaryConfigSchema),
    defaultValues: { config: { tts } },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => {
          setSubmitting(true);
          onSubmit(data).finally(() => {
            setSubmitting(false);
          });
        })}
      >
        <div className="space-y-4">
          <TTSForm form={form} />
        </div>

        <div className="flex justify-end my-4">
          <Button type="submit" disabled={submitting}>
            {submitting && <LoaderIcon className="w-4 h-4 animate-spin mr-2" />}
            {t("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
};
