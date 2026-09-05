/**
 * How a set of Azure pronunciation scores becomes one number, and how the
 * results of a continuously recognised Recording become one result.
 *
 * Azure scores a Recording one utterance at a time. A Recording short enough
 * to go through `recognizeOnceAsync` comes back as a single utterance and
 * needs none of this; anything longer comes back as several, and the whole
 * question of what the Recording scored is answered here rather than by the
 * SDK.
 *
 * The answer used to be an unweighted mean of the per-utterance scores, which
 * gave a two-second utterance the same say as a twenty-second one and averaged
 * quantities that are not averageable — completeness is a ratio against the
 * reference text, so a mean of ratios over utterances is not the ratio over
 * the Recording. Each score is therefore rebuilt here from what it is actually
 * made of: accuracy from the words, fluency and prosody from the time spoken,
 * completeness from the omissions across the whole Recording.
 */

/** One word as Azure reports it inside a recognised utterance. */
export type AssessedWord = {
  Word?: string;
  /** 100-nanosecond ticks. Absent on words that were never spoken. */
  Duration?: number;
  Offset?: number;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    ErrorType?: string;
  };
};

/** One recognised utterance, as `PronunciationAssessmentResult#detailResult`. */
export type AssessedUtterance = {
  Confidence?: number;
  Display?: string;
  ITN?: string;
  Lexical?: string;
  MaskedITN?: string;
  Words?: AssessedWord[];
  PronunciationAssessment?: {
    AccuracyScore?: number;
    CompletenessScore?: number;
    FluencyScore?: number;
    ProsodyScore?: number;
    PronScore?: number;
  };
  ContentAssessmentResult?: {
    GrammarScore?: number;
    VocabularyScore?: number;
    TopicScore?: number;
  };
};

/**
 * The weights Azure documents for the overall score, by how many of the four
 * component scores are available.
 *
 * The scores are sorted from low to high first, so the weakest component
 * always carries the most weight — being fluent does not buy back being
 * unintelligible. Reading with prosody has all four; reading without it, and
 * speaking with it, have three; speaking without it has two. Which is why the
 * table is keyed by count and not by scenario: the two cases that meet in the
 * middle are weighted identically.
 *
 * https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment
 */
const WEIGHTS: Record<number, number[]> = {
  2: [0.6, 0.4],
  3: [0.6, 0.2, 0.2],
  4: [0.4, 0.2, 0.2, 0.2],
};

const isScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const round2 = (value: number) => Math.round(value * 100) / 100;

const clampScore = (value: number) => Math.min(100, Math.max(0, value));

/**
 * The overall score for one set of components.
 *
 * A component that was not assessed is left out rather than counted as zero:
 * prosody is absent whenever prosody assessment was not asked for, and
 * completeness is absent whenever there was no reference text to be complete
 * against.
 */
export const pronunciationScore = (scores: {
  accuracyScore?: number;
  fluencyScore?: number;
  completenessScore?: number;
  prosodyScore?: number;
}): number | undefined => {
  const available = [
    scores.accuracyScore,
    scores.fluencyScore,
    scores.completenessScore,
    scores.prosodyScore,
  ].filter(isScore);

  const weights = WEIGHTS[available.length];
  if (!weights) return undefined;

  const sorted = [...available].sort((a, b) => a - b);

  return round2(
    clampScore(sorted.reduce((sum, score, i) => sum + score * weights[i], 0))
  );
};

const weightedMean = (
  entries: { value: number | undefined; weight: number }[]
): number | undefined => {
  const scored = entries.filter((entry) => isScore(entry.value));
  if (scored.length === 0) return undefined;

  // Every utterance weighing nothing — a result with no word timings at all —
  // still has to answer something, and an unweighted mean is the honest
  // fallback rather than a division by zero.
  const total = scored.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    return round2(
      scored.reduce((sum, entry) => sum + entry.value, 0) / scored.length
    );
  }

  return round2(
    scored.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / total
  );
};

/** Words the reference text asked for: everything the speaker added is not one. */
const referenceWords = (words: AssessedWord[]) =>
  words.filter(
    (word) => word.PronunciationAssessment?.ErrorType !== "Insertion"
  );

/** Ticks actually spoken, which is what fluency and prosody are judged over. */
const spokenTicks = (words: AssessedWord[]) =>
  words.reduce((sum, word) => sum + (word.Duration || 0), 0);

/**
 * Merge the utterances of one continuously recognised Recording into the
 * single result the rest of the app reads.
 *
 * `completenessScore` is recomputed from the merged words rather than averaged:
 * Azure reports omissions word by word, so counting them over the whole
 * Recording answers the question completeness actually asks. It is only
 * offered when Azure offered it — a Recording assessed without a reference
 * text has no completeness to report, and inventing one from an empty word
 * list would read as a perfect score.
 */
export const mergeAssessedUtterances = (
  utterances: AssessedUtterance[]
): AssessedUtterance => {
  if (!utterances?.length) {
    throw new Error("No speech could be recognized.");
  }

  const weighted = utterances.map((utterance) => {
    const words = utterance.Words || [];
    return {
      utterance,
      words,
      // Accuracy is a judgement about words, so utterances get a say in it in
      // proportion to how many words of the reference text they carry.
      wordWeight: referenceWords(words).length || 1,
      // Fluency and prosody are judgements about time — the pauses between
      // words, the shape of the delivery — so they are weighted by it.
      tickWeight: spokenTicks(words),
    };
  });

  const words = weighted.flatMap((entry) => entry.words);

  const accuracyScore = weightedMean(
    weighted.map((entry) => ({
      value: entry.utterance.PronunciationAssessment?.AccuracyScore,
      weight: entry.wordWeight,
    }))
  );
  const fluencyScore = weightedMean(
    weighted.map((entry) => ({
      value: entry.utterance.PronunciationAssessment?.FluencyScore,
      weight: entry.tickWeight,
    }))
  );
  const prosodyScore = weightedMean(
    weighted.map((entry) => ({
      value: entry.utterance.PronunciationAssessment?.ProsodyScore,
      weight: entry.tickWeight,
    }))
  );

  const assessedCompleteness = utterances.some((utterance) =>
    isScore(utterance.PronunciationAssessment?.CompletenessScore)
  );
  const expected = referenceWords(words).length;
  const omitted = words.filter(
    (word) => word.PronunciationAssessment?.ErrorType === "Omission"
  ).length;
  const completenessScore =
    assessedCompleteness && expected > 0
      ? round2(clampScore((1 - omitted / expected) * 100))
      : assessedCompleteness
        ? weightedMean(
            weighted.map((entry) => ({
              value: entry.utterance.PronunciationAssessment?.CompletenessScore,
              weight: entry.wordWeight,
            }))
          )
        : undefined;

  const joined = (key: "Display" | "ITN" | "Lexical" | "MaskedITN") =>
    utterances
      .map((utterance) => utterance[key] || "")
      .join(" ")
      .trim();

  return {
    Confidence: weightedMean(
      weighted.map((entry) => ({
        value: entry.utterance.Confidence,
        weight: entry.wordWeight,
      }))
    ),
    Display: joined("Display"),
    ITN: joined("ITN"),
    Lexical: joined("Lexical"),
    MaskedITN: joined("MaskedITN"),
    Words: words,
    PronunciationAssessment: {
      AccuracyScore: accuracyScore,
      CompletenessScore: completenessScore,
      FluencyScore: fluencyScore,
      ProsodyScore: prosodyScore,
      PronScore: pronunciationScore({
        accuracyScore,
        fluencyScore,
        completenessScore,
        prosodyScore,
      }),
    },
    // Content assessment judges the whole of what was said, so Azure reports
    // it once, on the utterance that completes the speech. The last one to
    // carry it is that judgement; averaging it across utterances that were
    // never asked would only dilute it.
    ContentAssessmentResult: utterances
      .map((utterance) => utterance.ContentAssessmentResult)
      .filter(Boolean)
      .pop(),
  };
};

/**
 * The locale prosody assessment is offered for.
 *
 * Azure documents prosody as en-US only. Asking for it anywhere else is not a
 * feature that quietly does nothing — it is a paid request whose answer may
 * not come back at all, so the question is settled before the request is made
 * rather than after.
 *
 * https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment
 */
export const supportsProsodyAssessment = (language?: string): boolean =>
  language?.toLowerCase() === "en-us";

/**
 * The confidence above which Azure's prosody feedback is taken to be a break.
 *
 * Their recommendation, and it has to be somebody's decision: the service
 * reports how confident it is that a word was preceded by a break that should
 * not have been there, or missing one that should, and stops short of calling
 * it an error.
 */
export const BREAK_CONFIDENCE_THRESHOLD = 0.75;

/**
 * One word's assessment, as it is stored and read back.
 *
 * Camel-cased, unlike `AssessedUtterance` above: what Azure sends is
 * Pascal-cased and what `createAssessment` keeps has been through
 * `camelcaseKeys`. The two shapes are the same data at two different moments,
 * and this is the later one.
 */
export type StoredWordAssessment = {
  errorType?: string;
  feedback?: {
    prosody?: {
      break?: {
        unexpectedBreak?: { confidence?: number };
        missingBreak?: { confidence?: number };
      };
    };
  };
};

/**
 * What went wrong with a word, as something to show.
 *
 * Azure fills `ErrorType` for everything it is willing to call an error —
 * except the two break types, which the current version leaves out and asks
 * callers to decide for themselves from a confidence. Which is why a word that
 * was broken badly reads as `None` here, and why the display asked about a
 * kind of mistake the data never carried.
 *
 * A mistake Azure did name wins over one derived from a threshold: a
 * mispronounced word is worth saying so about before a pause near it is.
 */
export const wordErrorType = (word?: StoredWordAssessment): string => {
  const reported = word?.errorType;
  if (reported && reported !== "None") return reported;

  const breaks = word?.feedback?.prosody?.break;
  if (!breaks) return reported || "None";

  if ((breaks.unexpectedBreak?.confidence ?? 0) > BREAK_CONFIDENCE_THRESHOLD) {
    return "UnexpectedBreak";
  }
  if ((breaks.missingBreak?.confidence ?? 0) > BREAK_CONFIDENCE_THRESHOLD) {
    return "MissingBreak";
  }

  return reported || "None";
};
