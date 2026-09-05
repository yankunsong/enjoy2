# Enjoy

A language-learning application for intensive listening practice: you import
spoken-language material, get it split into sentences, shadow each sentence,
and have your pronunciation scored.

## Language

**Media**:
A piece of imported spoken-language material you practise against. Concretely an
Audio or a Video row; `Media` is the word for either when the distinction does
not matter. A Diary's Speech becomes a Media the first time you shadow it.
_Avoid_: source, content, asset

**Library**:
The on-disk directory holding every imported Media file plus the SQLite database
describing them.
_Avoid_: collection, workspace

**Diary**:
A piece of text you wrote yourself, kept for practising against. Where a Media is
imported, a Diary is authored: its Transcript exists before any audio does, and
the audio is derived from the text by Speech synthesis.
_Avoid_: note, document, journal, entry

**Speech**:
Audio synthesised from a piece of text, addressed by its source and the text it
speaks. The bridge from a Diary to something shadowable. Two sources saying the
same thing in the same voice are two Speeches sharing one file, since a file is
named by the hash of its own content.
_Avoid_: TTS output, generated audio, voiceover

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
