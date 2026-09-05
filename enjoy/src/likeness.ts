/**
 * How closely a Recording follows the delivery of the sentence it shadows.
 *
 * Assessment answers a different question: it scores a Recording against the
 * reference *text*, comparing it to a native-speaker model that knows nothing
 * about the Media. You can score well on it while speaking a sentence with an
 * intonation and a pace the original never had — which is precisely what
 * shadowing sets out to train. Likeness scores the Recording against the
 * Media's own audio instead, so the thing being practised is the thing being
 * measured.
 *
 * It compares the two pitch contours the app already extracts for the waveform
 * display, so it costs no extra audio processing and asks nothing of the
 * network. The comparison is deliberately speaker-independent: each contour is
 * expressed in semitones relative to its own median pitch, so a low voice
 * shadowing a high one is not penalised for the register it was born with —
 * only for the shape it traces.
 */

/** A pitch contour: one frequency per frame, `null` where nothing is voiced. */
export type Contour = (number | null)[];

export type Likeness = {
  /** How closely the shape of the pitch follows the original, once time is aligned. */
  intonation: number;
  /** How closely the timing within the sentence follows it: which parts were rushed. */
  rhythm: number;
  /** How close the overall pace is. */
  tempo: number;
  /** The three weighted into one score, 0-100. */
  overall: number;
  /** Recording duration over Media duration; 1 is exactly the original pace. */
  tempoRatio: number;
};

/** The reference is resampled to this many frames; the Recording, in proportion. */
const REFERENCE_FRAMES = 100;
const MIN_FRAMES = 8;
const MAX_FRAMES = 600;

/** Fewer voiced frames than this on either side and there is nothing to compare. */
const VOICED_FRAMES_REQUIRED = 8;

/** A frame pair costs at most this, so one wild octave cannot sink the whole score. */
const MAX_FRAME_COST = 12;

/** Voiced against unvoiced: a real mismatch, but not the worst one possible. */
const UNVOICED_MISMATCH_COST = 4;

/** Mean semitone distance at which intonation scores zero. */
const SEMITONES_FOR_ZERO = 6;

/** Mean timing drift, as a fraction of the sentence, at which rhythm scores zero. */
const DRIFT_FOR_ZERO = 0.25;

/** A frequency worth trusting: silence and failed detection both read as null. */
const isVoiced = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * A frame that carries pitch, once pitch is measured in semitones.
 *
 * Distinct from `isVoiced`, and the distinction matters: in semitones the
 * value is a distance from the speaker's own median, so half of a perfectly
 * voiced sentence is negative and the median itself is exactly zero. Reading
 * those as silence would leave a monotone Recording looking like no Recording
 * at all.
 */
const isFrame = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const clampScore = (value: number) =>
  Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;

/**
 * Reduce a semitone contour to `frames` frames, each the median of its slice.
 *
 * The median rather than the mean because pitch detection leaves the odd
 * octave error behind, and one of those in a slice should not move the frame.
 */
const resample = (contour: Contour, frames: number): Contour => {
  const length = contour.length;
  // The floor raises a request that is too fine-grained to be useful; it must
  // not invent frames a contour this short never had.
  const target = Math.min(MAX_FRAMES, length, Math.max(MIN_FRAMES, frames));
  const resampled: Contour = [];

  for (let i = 0; i < target; i++) {
    const from = Math.floor((i * length) / target);
    const to = Math.max(from + 1, Math.floor(((i + 1) * length) / target));
    const frames = contour.slice(from, to).filter(isFrame);
    resampled.push(frames.length ? median(frames) : null);
  }

  return resampled;
};

/**
 * Express a contour in semitones away from its own median pitch.
 *
 * This is what makes the comparison about the shape of the delivery rather
 * than about whose voice it is.
 */
const toSemitones = (contour: Contour): Contour => {
  const voiced = contour.filter(isVoiced);
  if (voiced.length === 0) return contour.map((): null => null);

  const reference = median(voiced);

  return contour.map((value) =>
    isVoiced(value) ? 12 * Math.log2(value / reference) : null
  );
};

const frameCost = (a: number | null, b: number | null): number => {
  if (isFrame(a) && isFrame(b)) {
    return Math.min(MAX_FRAME_COST, Math.abs(a - b));
  }
  // Silence lining up with silence is agreement, and worth nothing against.
  if (!isFrame(a) && !isFrame(b)) return 0;

  return UNVOICED_MISMATCH_COST;
};

/**
 * Dynamic time warping of the two contours.
 *
 * Warping is what separates the two questions a shadowed sentence raises. The
 * cost of the best alignment says how differently it was *said*; the path that
 * alignment had to take says how differently it was *timed*. Comparing the
 * contours frame against frame would confuse the two, and would score a
 * faithful imitation started half a beat late as a bad one.
 */
const warp = (reference: Contour, actual: Contour) => {
  const n = reference.length;
  const m = actual.length;
  const cost = new Float64Array((n + 1) * (m + 1)).fill(Infinity);
  const at = (i: number, j: number) => i * (m + 1) + j;

  cost[at(0, 0)] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[at(i, j)] =
        frameCost(reference[i - 1], actual[j - 1]) +
        Math.min(
          cost[at(i - 1, j)],
          cost[at(i, j - 1)],
          cost[at(i - 1, j - 1)]
        );
    }
  }

  // Walk the path back out to read the timing off it.
  let i = n;
  let j = m;
  let steps = 0;
  let drift = 0;

  while (i > 0 && j > 0) {
    drift += Math.abs(j / m - i / n);
    steps++;

    const diagonal = cost[at(i - 1, j - 1)];
    const up = cost[at(i - 1, j)];
    const left = cost[at(i, j - 1)];

    if (diagonal <= up && diagonal <= left) {
      i--;
      j--;
    } else if (up <= left) {
      i--;
    } else {
      j--;
    }
  }

  return {
    meanCost: cost[at(n, m)] / Math.max(1, steps),
    meanDrift: drift / Math.max(1, steps),
  };
};

/**
 * Cut a contour down to the span that actually carries voice, and say how long
 * that span lasts.
 *
 * Silence at the edges is not part of a delivery, and the two sides of the
 * comparison rarely carry the same amount of it: a Recording starts whenever
 * the learner got around to speaking, and a sentence's range in the Media
 * carries whatever padding the Timeline gave it. Left in, that padding lands
 * entirely in the pace: a faithful imitation of a sentence with half a second
 * of silence around it reads as having been rushed.
 */
const trimToVoiced = (
  contour: Contour,
  duration: number
): { contour: Contour; duration: number } | null => {
  const first = contour.findIndex(isVoiced);
  if (first < 0) return null;

  let last = contour.length - 1;
  while (last > first && !isVoiced(contour[last])) last--;

  const frames = last + 1 - first;

  return {
    contour: contour.slice(first, last + 1),
    duration: duration * (frames / contour.length),
  };
};

/**
 * Score a Recording's contour against the contour of the sentence it shadows.
 *
 * Answers `null` rather than a low score when there is too little voiced audio
 * on either side to compare: a Recording of a cough deserves no number at all,
 * and a zero would read as a judgement that was never made.
 */
export const compareContours = (params: {
  reference: Contour;
  actual: Contour;
  /** Milliseconds of the Media's sentence, and of the Recording. */
  referenceDuration: number;
  actualDuration: number;
}): Likeness | null => {
  const { reference, actual, referenceDuration, actualDuration } = params;

  if (!reference?.length || !actual?.length) return null;
  if (!(referenceDuration > 0) || !(actualDuration > 0)) return null;

  const spoken = trimToVoiced(reference, referenceDuration);
  const heard = trimToVoiced(actual, actualDuration);
  if (!spoken || !heard) return null;
  if (!(spoken.duration > 0) || !(heard.duration > 0)) return null;

  const tempoRatio = heard.duration / spoken.duration;

  // Both contours are cut into frames of the same duration, so a frame means
  // the same amount of time on either side and the number of them carries the
  // difference in pace.
  const referenceFrames = resample(
    toSemitones(spoken.contour),
    REFERENCE_FRAMES
  );
  const actualFrames = resample(
    toSemitones(heard.contour),
    Math.round(REFERENCE_FRAMES * tempoRatio)
  );

  if (
    referenceFrames.filter(isFrame).length < VOICED_FRAMES_REQUIRED ||
    actualFrames.filter(isFrame).length < VOICED_FRAMES_REQUIRED
  ) {
    return null;
  }

  const { meanCost, meanDrift } = warp(referenceFrames, actualFrames);

  const intonation = clampScore(100 * (1 - meanCost / SEMITONES_FOR_ZERO));
  const rhythm = clampScore(100 * (1 - meanDrift / DRIFT_FOR_ZERO));
  // Twice or half the original pace scores zero; the log keeps the two
  // directions symmetrical, so dragging is punished like rushing.
  const tempo = clampScore(100 * (1 - Math.abs(Math.log2(tempoRatio))));

  return {
    intonation,
    rhythm,
    tempo,
    overall: clampScore(0.5 * intonation + 0.3 * rhythm + 0.2 * tempo),
    tempoRatio: Math.round(tempoRatio * 100) / 100,
  };
};
