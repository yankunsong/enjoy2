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
 * The user's own Azure Speech resource, which is what Assessment scores on when
 * there is no Hosted Enjoy account to hand out a token.
 *
 * A key and a region, stored as plain JSON in the local database beside the
 * OpenAI key — the same trade the parent issue makes for that one: with a
 * single user on a loopback-only server this is the risk of an environment
 * file, and the settings table is already here.
 */
export const AzureSpeechSettings = () => {
  const { azureSpeech, setAzureSpeech } = useContext(AISettingsProviderContext);
  const [editing, setEditing] = useState(false);

  const azureSpeechConfigSchema = z.object({
    key: z.string().optional(),
    region: z.string().optional(),
  });

  const form = useForm<z.infer<typeof azureSpeechConfigSchema>>({
    resolver: zodResolver(azureSpeechConfigSchema),
    values: {
      key: azureSpeech?.key,
      region: azureSpeech?.region,
    },
  });

  const onSubmit = async (data: z.infer<typeof azureSpeechConfigSchema>) => {
    await setAzureSpeech({ ...data });
    setEditing(false);
    toast.success(t("azureSpeechConfigSaved"));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex items-start justify-between py-4">
          <div className="">
            <div className="mb-2">{t("azureSpeech")}</div>
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
                      {t("azureSpeechDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center space-x-2">
                      <FormLabel className="min-w-max">
                        {t("region")}:
                      </FormLabel>
                      <Input
                        disabled={!editing}
                        placeholder="eastus"
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </div>
                    <FormDescription>
                      {t("azureSpeechRegionDescription")}
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
