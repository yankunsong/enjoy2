# Enjoy

A language-learning application for intensive listening practice: you import
spoken-language material, get it split into sentences, shadow each sentence,
and have your pronunciation scored.

## Language

**Media**:
A piece of imported spoken-language material you practise against. Concretely an
Audio or a Video row; `Media` is the word for either when the distinction does
not matter.
_Avoid_: source, content, asset

**Library**:
The on-disk directory holding every imported Media file plus the SQLite database
describing them.
_Avoid_: collection, workspace

**Transcript**:
The plain text of what is spoken in a Media.
_Avoid_: subtitles, captions, script

**Timeline**:
The sentence-by-sentence mapping from Transcript to time ranges in the Media.
A Transcript without a Timeline cannot be shadowed.
_Avoid_: segments, timestamps, cues

**Alignment**:
Deriving a Timeline by matching known Transcript text against the audio signal.
Distinct from Transcription, which produces the text in the first place.
_Avoid_: sync, matching

**Transcription**:
Deriving a Transcript from audio that has none. Distinct from Alignment.
_Avoid_: STT, speech recognition, ASR

**Shadowing**:
Practising one sentence by looping its Timeline range, speaking along, and
comparing your Recording against it.
_Avoid_: repeating, imitation, 跟读练习

**Recording**:
One captured attempt at shadowing a single sentence.
_Avoid_: take, attempt, clip

**Assessment**:
Phoneme-level scoring of a Recording against the sentence it shadows, producing
accuracy, fluency and completeness scores.
_Avoid_: evaluation, scoring, grading

## Distributions

**Desktop Enjoy**:
The Electron application in this workspace.
_Avoid_: the app, native version

**Hosted Enjoy**:
The upstream project's software-as-a-service at enjoy.bot, reached from Desktop
Enjoy through `webApi`. Requires an account.
_Avoid_: the web version, 网页版, cloud, online version

**Local Web Enjoy**:
A browser-served build of the same application that runs entirely against a
local server, with no account. Distinct from Hosted Enjoy: same UI, no
enjoy.bot.
_Avoid_: the web version, 网页版, self-hosted
