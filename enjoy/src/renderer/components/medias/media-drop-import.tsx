import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "i18next";
import { LoaderIcon, UploadIcon } from "lucide-react";
import { toast } from "@renderer/components/ui";
import { AppSettingsProviderContext } from "@renderer/context";
import { AudioFormats, VideoFormats } from "@/constants";

/**
 * Importing a Media by dropping its file on the window.
 *
 * Local Web Enjoy only, and mounted once by the layout so a drop lands wherever
 * the user happens to be. It leans on `EnjoyApp.localFile`, which the browser
 * bridge offers and the preload script does not — under Electron a dropped file
 * already has a path, and nothing here would be the way to use it.
 */
export const MediaDropImport = () => {
  const { EnjoyApp } = useContext(AppSettingsProviderContext);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();

  const carriesFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  useEffect(() => {
    // Without a handler that cancels these, the browser navigates away from the
    // app to display the dropped file.
    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;

      event.preventDefault();
      setDragging(true);
    };

    // Fires on the way into a child element too, so the counter-free version of
    // this would flicker; leaving the window is the one that reports no target.
    const onDragLeave = (event: DragEvent) => {
      if (!event.relatedTarget) setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;

      event.preventDefault();
      setDragging(false);
      importFiles(Array.from(event.dataTransfer?.files ?? []));
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [importing]);

  const importFiles = async (files: File[]) => {
    if (importing) return;

    const media = files.filter((file) => mediaTypeOf(file));
    if (media.length === 0) {
      return toast.error(t("droppedFileIsNotMedia"));
    }
    if (media.length > 50) {
      return toast.error(t("resourcesAddInBatchLimitError", { limit: 50 }));
    }

    setImporting(true);
    try {
      const imported = await Promise.allSettled(media.map(importOne));
      const created = imported.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      const reasons = imported.flatMap((result) =>
        result.status === "rejected" ? [result.reason?.message] : []
      );

      if (created.length === 0) {
        toast.error(reasons.join("; "));
      } else if (reasons.length > 0) {
        toast.warning(
          t("resourcesAdded", {
            fulfilled: created.length,
            rejected: reasons.length,
            reasons: reasons.join("; "),
          })
        );
      } else {
        toast.success(t("resourceAdded"));
      }

      // A Media list refreshes from the database transactions it is told about,
      // and nothing is pushed to the browser yet, so opening what was imported
      // is both the useful thing to do and the thing that shows it landed.
      if (created.length > 0) navigate(created[0]);
    } finally {
      setImporting(false);
    }
  };

  /** Returns where the imported Media can be found. */
  const importOne = async (file: File) => {
    const kind = MEDIA_KINDS[mediaTypeOf(file)];
    const path = await EnjoyApp.localFile.stage(file);
    const media = await EnjoyApp[kind.namespace].create(path);

    return `${kind.route}/${media.id}`;
  };

  if (!dragging && !importing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 pointer-events-none">
      <div className="flex items-center gap-3 rounded-lg border-2 border-dashed px-8 py-6 text-lg">
        {importing ? (
          <>
            <LoaderIcon className="w-6 h-6 animate-spin" />
            {t("importingDroppedMedia")}
          </>
        ) : (
          <>
            <UploadIcon className="w-6 h-6" />
            {t("dropMediaToImport")}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * The two things a Media is, and the two places each name is spelled: the
 * bridge namespace that imports one, and the address it lives at afterwards.
 */
const MEDIA_KINDS = {
  Audio: { namespace: "audios", route: "/audios" },
  Video: { namespace: "videos", route: "/videos" },
} as const;

const mediaTypeOf = (file: File): keyof typeof MEDIA_KINDS | null => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (AudioFormats.includes(extension)) return "Audio";
  if (VideoFormats.includes(extension)) return "Video";
  return null;
};
