import { expect, test } from "@playwright/test";
import {
  BREAK_CONFIDENCE_THRESHOLD,
  mergeAssessedUtterances,
  pronunciationScore,
  supportsProsodyAssessment,
  wordErrorType,
  type AssessedUtterance,
} from "../src/pronunciation-score";
import { compareContours, type Contour } from "../src/likeness";

/**
 * What a Recording scores, held to the two things a score has to be: the
 * number Azure documents, and a number that means the same thing whether the
 * Recording ran for ten seconds or ninety.
 *
 * Both used to depend on which side of thirty seconds a Recording fell. Under
 * that length one utterance comes back and the SDK answers everything; over
 * it, several do, and the app averaged them flat — so the same delivery scored
 * differently for being said at greater length, and a two-second utterance
 * carried as much of the verdict as a twenty-second one.
 */

const utterance = (params: {
  accuracy?: number;
  fluency?: number;
  prosody?: number;
  completeness?: number;
  /** How many words of the reference text this utterance carries. */
  words?: number;
  /** How many of those were never spoken. */
  omissions?: number;
  /** Ticks per word, which is how long it took to say. */
  ticks?: number;
  content?: { GrammarScore?: number };
}): AssessedUtterance => {
  const {
    accuracy = 80,
    fluency = 80,
    prosody,
    completeness,
    words = 1,
    omissions = 0,
    ticks = 1000,
    content,
  } = params;

  return {
    Display: "hello",
    Words: Array.from({ length: words }, (_, i) => ({
      Word: `word-${i}`,
      Duration: ticks,
      PronunciationAssessment: {
        AccuracyScore: accuracy,
        ErrorType: i < omissions ? "Omission" : "None",
      },
    })),
    PronunciationAssessment: {
      AccuracyScore: accuracy,
      FluencyScore: fluency,
      ProsodyScore: prosody,
      CompletenessScore: completeness,
      PronScore: accuracy,
    },
    ContentAssessmentResult: content,
  };
};

test("weights the overall score the way Azure documents it", () => {
  // Sorted low to high, the weakest component carries the most weight.
  expect(
    pronunciationScore({
      accuracyScore: 100,
      fluencyScore: 100,
      completenessScore: 100,
      prosodyScore: 40,
    })
  ).toBe(76); // 0.4*40 + 0.2*100 + 0.2*100 + 0.2*100

  expect(
    pronunciationScore({
      accuracyScore: 60,
      fluencyScore: 90,
      completenessScore: 90,
    })
  ).toBe(72); // 0.6*60 + 0.2*90 + 0.2*90

  expect(pronunciationScore({ accuracyScore: 50, fluencyScore: 100 })).toBe(70);
});

test("leaves out a component that was never assessed", () => {
  // Counting an absent prosody score as zero would sink every Recording
  // assessed without it.
  expect(
    pronunciationScore({ accuracyScore: 100, fluencyScore: 100 })
  ).toBeGreaterThan(99);

  expect(pronunciationScore({ accuracyScore: 100 })).toBeUndefined();
});

test("gives a long utterance more say than a short one", () => {
  const merged = mergeAssessedUtterances([
    utterance({ accuracy: 90, words: 9 }),
    utterance({ accuracy: 40, words: 1 }),
  ]);

  // Flat averaging answered 65 here, letting one word undo nine.
  expect(merged.PronunciationAssessment.AccuracyScore).toBe(85);
});

test("weights fluency by how long each utterance took, not by how many there were", () => {
  const merged = mergeAssessedUtterances([
    utterance({ fluency: 90, words: 10, ticks: 1000 }),
    utterance({ fluency: 50, words: 1, ticks: 1000 }),
  ]);

  expect(merged.PronunciationAssessment.FluencyScore).toBeCloseTo(86.36, 1);
});

test("counts completeness over the whole Recording rather than averaging ratios", () => {
  const merged = mergeAssessedUtterances([
    utterance({ words: 5, omissions: 1, completeness: 50 }),
    utterance({ words: 5, omissions: 1, completeness: 50 }),
  ]);

  // Two words of ten went unsaid, whatever each utterance made of its own share.
  expect(merged.PronunciationAssessment.CompletenessScore).toBe(80);
});

test("offers no completeness when there was no reference text to be complete against", () => {
  const merged = mergeAssessedUtterances([
    utterance({ accuracy: 80, fluency: 80, prosody: 80 }),
  ]);

  expect(merged.PronunciationAssessment.CompletenessScore).toBeUndefined();
  expect(merged.PronunciationAssessment.PronScore).toBe(80);
});

test("answers numbers, so a score can be compared with one", () => {
  const merged = mergeAssessedUtterances([utterance({}), utterance({})]);

  for (const score of Object.values(merged.PronunciationAssessment)) {
    if (score === undefined) continue;
    expect(typeof score).toBe("number");
  }
});

test("keeps the content assessment of the utterance that carried one", () => {
  const merged = mergeAssessedUtterances([
    utterance({}),
    utterance({ content: { GrammarScore: 70 } }),
  ]);

  expect(merged.ContentAssessmentResult?.GrammarScore).toBe(70);
});

test("refuses to score a Recording nothing was recognised in", () => {
  expect(() => mergeAssessedUtterances([])).toThrow();
});

/**
 * Likeness, held to the one claim that separates it from Assessment: it is
 * about the Media's own delivery, not about a native-speaker model.
 */

/** A pitch contour that moves, so there is a shape to follow. */
const contour = (frames: number, hz = 200): Contour =>
  Array.from({ length: frames }, (_, i) => hz + 50 * Math.sin(i / 10));

const compare = (params: {
  reference: Contour;
  actual: Contour;
  referenceDuration?: number;
  actualDuration?: number;
}) =>
  compareContours({
    referenceDuration: 3000,
    actualDuration: 3000,
    ...params,
  });

test("scores a Recording that traces the same contour at the same pace as perfect", () => {
  const reference = contour(300);

  expect(compare({ reference, actual: [...reference] })?.overall).toBe(100);
});

test("does not penalise a deeper voice for the register it was born with", () => {
  const reference = contour(300, 200);
  // The same shape an octave down: the pitch is nothing alike, the delivery is.
  const actual = reference.map((value) => (value as number) / 2);

  expect(compare({ reference, actual })?.intonation).toBeGreaterThan(95);
});

test("marks down a sentence read flat", () => {
  const reference = contour(300);
  const actual = new Array(300).fill(200);

  expect(compare({ reference, actual })?.intonation).toBeLessThan(70);
});

test("separates saying it faster from saying it unevenly", () => {
  const reference = contour(300);

  // Half the time, evenly: the pace is wrong and nothing else is.
  const faster = compare({
    reference,
    actual: reference.filter((_, i) => i % 2 === 0),
    actualDuration: 1500,
  });
  expect(faster?.tempo).toBe(0);
  expect(faster?.rhythm).toBeGreaterThan(80);
  expect(faster?.intonation).toBeGreaterThan(80);

  // The same length overall, with the first half rushed and the second dragged.
  const uneven = compare({
    reference,
    actual: [
      ...reference.slice(0, 200).filter((_, i) => i % 2 === 0),
      ...reference.slice(200).flatMap((value) => [value, value]),
    ],
  });
  expect(uneven?.tempo).toBeGreaterThan(90);
  expect(uneven?.rhythm).toBeLessThan(
    compare({ reference, actual: [...reference] })!.rhythm
  );
});

test("ignores silence at the edges, on both sides of the comparison", () => {
  const reference = contour(300);
  const silence = (frames: number): Contour => new Array(frames).fill(null);

  // Five seconds of waiting before speaking, which is what a learner who
  // pressed record and then hesitated actually hands over.
  const hesitant = compare({
    reference,
    actual: [...silence(500), ...reference],
    actualDuration: 8000,
  });
  expect(hesitant?.tempoRatio).toBe(1);
  expect(hesitant?.overall).toBe(100);

  // The same in the Media's own sentence: padding in the Timeline range must
  // not read as the learner having rushed.
  const padded = compare({
    reference: [...silence(150), ...reference, ...silence(150)],
    referenceDuration: 6000,
    actual: [...reference],
  });
  expect(padded?.tempoRatio).toBe(1);
  expect(padded?.overall).toBe(100);
});

test("says nothing at all when there is too little voiced audio to compare", () => {
  const reference = contour(300);

  expect(compare({ reference, actual: new Array(300).fill(null) })).toBeNull();
  expect(compare({ reference, actual: contour(4) })).toBeNull();
  expect(compare({ reference, actual: [], actualDuration: 0 })).toBeNull();
});

/**
 * Prosody, which Azure charges extra for, offers in one locale, and reports
 * two of its three findings without ever calling them errors.
 */

test("asks for prosody only where Azure offers it", () => {
  expect(supportsProsodyAssessment("en-US")).toBe(true);
  expect(supportsProsodyAssessment("en-us")).toBe(true);
  // Paying for an answer that does not come back is worse than not asking.
  expect(supportsProsodyAssessment("en-GB")).toBe(false);
  expect(supportsProsodyAssessment("zh-CN")).toBe(false);
  expect(supportsProsodyAssessment(undefined)).toBe(false);
});

test("reads a break off its confidence, since Azure will not name one", () => {
  const withBreak = (confidences: {
    unexpected?: number;
    missing?: number;
  }) => ({
    errorType: "None",
    feedback: {
      prosody: {
        break: {
          unexpectedBreak: { confidence: confidences.unexpected ?? 0 },
          missingBreak: { confidence: confidences.missing ?? 0 },
        },
      },
    },
  });

  expect(wordErrorType(withBreak({ unexpected: 0.9 }))).toBe("UnexpectedBreak");
  expect(wordErrorType(withBreak({ missing: 0.9 }))).toBe("MissingBreak");
  expect(wordErrorType(withBreak({ unexpected: 0.5, missing: 0.5 }))).toBe(
    "None"
  );
  // The recommended threshold is a floor to clear, not one to stand on.
  expect(
    wordErrorType(withBreak({ unexpected: BREAK_CONFIDENCE_THRESHOLD }))
  ).toBe("None");
});

test("says the mistake Azure named before one it only implied", () => {
  const mispronounced = {
    errorType: "Mispronunciation",
    feedback: {
      prosody: {
        break: { unexpectedBreak: { confidence: 0.99 } },
      },
    },
  };

  expect(wordErrorType(mispronounced)).toBe("Mispronunciation");
});

test("falls back to what was reported when prosody was never asked for", () => {
  expect(wordErrorType({ errorType: "Omission" })).toBe("Omission");
  expect(wordErrorType({ errorType: "None" })).toBe("None");
  expect(wordErrorType({})).toBe("None");
  expect(wordErrorType(undefined)).toBe("None");
});
