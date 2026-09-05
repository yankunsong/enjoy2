import { useEffect, useRef, useState } from "react";
import { LoaderIcon, PlayIcon, SquareIcon } from "lucide-react";
import { t } from "i18next";
import { toast } from "@renderer/components/ui";

/**
 * Previews one voice, from the sample its provider already hosts.
 *
 * The list of voices reads "Roger — Laid-Back, Casual, Resonant", which is
 * somebody's description of a sound rather than the sound. Choosing between
 * eleven of those meant synthesising a diary with each in turn.
 *
 * There is nothing to synthesise: ElevenLabs publishes a `preview_url` with
 * every voice — the clip its own voice library plays — so this is an
 * `<audio>` element pointed at a CDN file. No key, no credits, no round trip
 * through the app's speech pipeline.
 *
 * It lives inside a `SelectItem`, where every pointer event means "choose this
 * one". So each of them is stopped here: pressing play previews the voice and
 * leaves the list open and the choice untouched. That also makes it a mouse
 * affordance and only that — a `SelectItem` is an `option`, which can hold no
 * focusable child — so it is hidden from assistive technology rather than
 * announced as something a keyboard could reach.
 */
export const VoicePreviewButton = (props: { url: string }) => {
  const { url } = props;
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const stopRef = useRef<(() => void) | null>(null);

  // A preview outlives neither the row it belongs to nor the next preview.
  // Each button owns its own audio, so nothing local can stop the one playing
  // two rows up — and comparing two voices is the whole point, so hearing them
  // over each other is the one thing this must not do. The playing preview is
  // therefore held once, for the whole list.
  const play = () => {
    stopPreview();

    const audio = new Audio(url);
    setState("loading");

    audio.onplaying = () => setState("playing");
    audio.onended = () => stopPreview();
    audio.onerror = () => {
      stopPreview();
      // Silence would be indistinguishable from a button that does nothing —
      // and a dead sample or a machine that is offline is exactly the case
      // where the user is left guessing.
      toast.error(t("failedToPreviewVoice"));
    };

    playing = { stop: () => setState("idle"), audio };
    stopRef.current = playing.stop;

    audio.play().catch((err) => {
      stopPreview();
      toast.error(err.message);
    });
  };

  useEffect(() => {
    return () => {
      if (playing?.stop === stopRef.current) stopPreview();
    };
  }, [url]);

  const swallow = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      title={t("previewVoice")}
      className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
      // Radix decides on pointer-up and moves the highlight on pointer-move, so
      // both have to stop here for the button to be a button.
      onPointerDown={swallow}
      onPointerUp={swallow}
      onPointerMove={(event) => event.stopPropagation()}
      onClick={(event) => {
        swallow(event);
        if (state === "idle") {
          play();
        } else {
          stopPreview();
        }
      }}
    >
      {state === "loading" ? (
        <LoaderIcon className="h-3 w-3 animate-spin" />
      ) : state === "playing" ? (
        <SquareIcon className="h-3 w-3 fill-current" />
      ) : (
        <PlayIcon className="h-3 w-3 fill-current" />
      )}
    </button>
  );
};

/**
 * The one preview that is playing, anywhere in the list, or nothing.
 *
 * Module-level because that is the scope the rule needs: only one voice at a
 * time, across rows that know nothing of each other and across every dropdown
 * on the page.
 */
let playing: { stop: () => void; audio: HTMLAudioElement } | null = null;

const stopPreview = () => {
  if (!playing) return;

  playing.audio.pause();
  playing.stop();
  playing = null;
};
