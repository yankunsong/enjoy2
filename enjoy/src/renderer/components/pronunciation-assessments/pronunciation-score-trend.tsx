import { t } from "i18next";
import { useMemo } from "react";
import { cn } from "@renderer/lib/utils";
import { scoreColor } from "./pronunciation-assessment-score-result";

const HEIGHT = 40;
const WIDTH = 100;
const PADDING = 4;

/**
 * The scores of one sentence's Recordings, oldest to newest.
 *
 * A single Assessment answers how one attempt went, which is not the question
 * shadowing asks — the point of shadowing a sentence is that the tenth attempt
 * beats the first, and until now nothing in the app said whether it did. The
 * scores were all there, one per Recording, with no way to see them as a line.
 *
 * Drawn as a plain SVG rather than a chart: there are rarely more than a dozen
 * points, they carry no axes worth reading, and the shape is the whole message.
 */
export const PronunciationScoreTrend = (props: {
  /** Newest first, the order Recordings arrive in. */
  scores: number[];
  className?: string;
}) => {
  const { className } = props;

  const scores = useMemo(
    () => [...(props.scores || [])].reverse(),
    [props.scores]
  );

  if (scores.length < 2) return null;

  const first = scores[0];
  const last = scores[scores.length - 1];
  const change = Math.round((last - first) * 10) / 10;

  // The band the line is drawn in, widened so a flat run of scores sits in the
  // middle of the box instead of being flattened onto its edge.
  const low = Math.max(0, Math.min(...scores) - 5);
  const high = Math.min(100, Math.max(...scores) + 5);
  const span = Math.max(1, high - low);

  const points = scores.map((score, index) => ({
    score,
    x: PADDING + (index / (scores.length - 1)) * (WIDTH - 2 * PADDING),
    y: HEIGHT - PADDING - ((score - low) / span) * (HEIGHT - 2 * PADDING),
  }));

  return (
    <div className={cn("px-4 py-2", className)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">
          {t("scoreTrendOverAttempts", { times: scores.length })}
        </span>
        <span
          className={cn(
            "text-xs font-mono",
            change > 0
              ? "text-green-600"
              : change < 0
                ? "text-red-600"
                : "text-muted-foreground"
          )}
        >
          {change > 0 ? "+" : ""}
          {change}
        </span>
      </div>

      {/*
       * The first and last score, written out on either side of the line.
       * Without them the line is a shape with no scale: two attempts that
       * scored the same draw a flat run that reads as a rule across the panel
       * rather than as a chart of anything.
       */}
      <div className="flex items-center gap-2">
        <span className={cn("text-xs font-mono", scoreColor(first))}>
          {first}
        </span>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="flex-1 h-8 text-muted-foreground/60"
          data-testid="pronunciation-score-trend"
        >
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {/*
           * Attempts are marked with upright ticks rather than dots: the box is
           * stretched to whatever width the panel has, and a circle stretches
           * with it into a blob while a tick drawn with a non-scaling stroke
           * stays the width it was asked for.
           */}
          {points.map((point, index) => (
            <line
              key={index}
              x1={point.x}
              x2={point.x}
              y1={point.y - 2}
              y2={point.y + 2}
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              className={scoreColor(point.score)}
            />
          ))}
        </svg>
        <span className={cn("text-xs font-mono", scoreColor(last))}>
          {last}
        </span>
      </div>
    </div>
  );
};
