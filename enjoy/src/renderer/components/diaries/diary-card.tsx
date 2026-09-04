import { cn } from "@renderer/lib/utils";
import { Link } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from "@renderer/components/ui";
import { MoreVerticalIcon, TrashIcon } from "lucide-react";
import { t } from "i18next";
import { useContext, useState } from "react";
import { AppSettingsProviderContext } from "@renderer/context";

export const DiaryCard = (props: {
  diary: DiaryType;
  className?: string;
  onDelete?: () => void;
}) => {
  const { diary, className, onDelete } = props;
  const [deleting, setDeleting] = useState(false);
  const { EnjoyApp } = useContext(AppSettingsProviderContext);

  // Skip the first line only when it is what the title was taken from —
  // repeating it underneath itself would say nothing. A title typed by hand
  // says something different, so the line it replaced stays in the preview.
  const lines = (diary.content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const preview = (lines[0] === diary.title ? lines.slice(1) : lines).join(" ");

  return (
    <div className={cn("w-full", className)}>
      <Link to={`/diaries/${diary.id}`}>
        <div className="border rounded-lg p-4 h-36 flex flex-col hover:border-primary transition-colors relative">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold line-clamp-1 flex-1">
              {diary.title || t("untitledDiary")}
            </h3>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:bg-transparent w-6 h-6 shrink-0"
                  onClick={(event) => event.preventDefault()}
                >
                  <MoreVerticalIcon className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.preventDefault();
                    setDeleting(true);
                  }}
                >
                  <TrashIcon className="w-4 h-4 text-destructive" />
                  <span className="ml-2 text-destructive text-sm">
                    {t("delete")}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-3 mt-2 flex-1">
            {preview}
          </p>

          <div className="text-xs text-muted-foreground mt-2">
            {new Date(diary.updatedAt).toLocaleDateString()}
          </div>
        </div>
      </Link>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDiaryConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => {
                  EnjoyApp.diaries
                    .destroy(diary.id)
                    .then(() => {
                      toast.success(t("diaryDeletedSuccessfully"));
                      onDelete?.();
                    })
                    .catch((error) => {
                      toast.error(error.message);
                    })
                    .finally(() => {
                      setDeleting(false);
                    });
                }}
              >
                {t("delete")}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
