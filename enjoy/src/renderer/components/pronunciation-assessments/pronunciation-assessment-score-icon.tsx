import { cn } from "@renderer/lib/utils";
import { scoreColor } from "./pronunciation-assessment-score-result";

export const PronunciationAssessmentScoreIcon = (props: {
  score: number;
  size?: number;
  className?: string;
  onClick?: () => void;
}) => {
  const { score, className, onClick } = props;

  return (
    <div
      onClick={onClick}
      className={cn(
        `${scoreColor(score, "bg")} text-white rounded-full`,
        className
      )}
    >
      {score}
    </div>
  );
};
