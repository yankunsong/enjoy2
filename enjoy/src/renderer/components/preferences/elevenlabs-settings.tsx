import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "i18next";
import {
  Button,
  FormField,
  Form,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
  FormDescription,
} from "@renderer/components/ui";
import { AISettingsProviderContext } from "@renderer/context";
import { useContext, useState } from "react";

/**
 * The user's own ElevenLabs account, which is what speech synthesis runs on.
 *
 * One box, unlike Azure's two: the voices are the account's, and are asked for
 * with the key rather than configured beside it. Stored as plain JSON in the
 * local database next to the other two, on the same terms — one user, loopback
 * only — or set as `ELEVENLABS_API_KEY` in `.env`, which lands in this same
 * row at startup.
 */
export const ElevenLabsSettings = () => {
  const { elevenlabs, setElevenlabs } = useContext(AISettingsProviderContext);
  const [editing, setEditing] = useState(false);

  const elevenLabsConfigSchema = z.object({
    key: z.string().optional(),
  });

  const form = useForm<z.infer<typeof elevenLabsConfigSchema>>({
    resolver: zodResolver(elevenLabsConfigSchema),
    values: { key: elevenlabs?.key },
  });

  const onSubmit = async (data: z.infer<typeof elevenLabsConfigSchema>) => {
    await setElevenlabs({ ...data });
    setEditing(false);
    toast.success(t("elevenLabsConfigSaved"));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex items-start justify-between py-4">
          <div className="">
            <div className="mb-2">{t("elevenLabs")}</div>
            <div className="text-sm text-muted-foreground space-y-3">
              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormLabel className="min-w-max">{t("key")}:</FormLabel>
                      <Input
                        disabled={!editing}
                        type="password"
                        placeholder=""
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </div>
                    <FormDescription>
                      {t("elevenLabsDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant={editing ? "outline" : "secondary"}
              size="sm"
              type="reset"
              onClick={(event) => {
                event.preventDefault();
                form.reset();
                setEditing(!editing);
              }}
            >
              {editing ? t("cancel") : t("edit")}
            </Button>
            <Button className={editing ? "" : "hidden"} size="sm" type="submit">
              {t("save")}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};
