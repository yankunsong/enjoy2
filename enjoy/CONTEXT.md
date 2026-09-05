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
the audio is derived from the text by Speech synthesis. Where a Document is
brought in and fixed, a Diary is expected to change.
_Avoid_: journal, entry. Note and Document are terms of their own, not looser
words for this one.

**Document**:
A piece of written material you imported to read: an epub, Markdown, HTML or
plain-text file. Identified by the hash of the file it came from and never
edited — only its title, reading position and settings change. Where a Media is
imported to be practised against sentence by sentence, a Document is imported to
be read, a paragraph at a time; each paragraph can be given a Speech, which is
how a Document becomes something to shadow.
_Avoid_: book, ebook, article, text, file

**Speech**:
Audio synthesised from a piece of text, addressed by its source and the text it
speaks. The bridge from a Diary to something shadowable. Two sources saying the
same thing in the same voice are two Speeches sharing one file, since a file is
named by the hash of its own content. A Document's paragraph is spoken the same
way.
_Avoid_: TTS output, generated audio, voiceover

**Preview**:
A sample of a TTS voice that its provider already hosts — for ElevenLabs, the
`preview_url` on every voice, the same clip its voice library plays. Not a
Speech: nothing is synthesised, nothing is stored, and it is addressed by the
voice rather than by a source and a text. It exists so a voice can be chosen by
ear instead of by its description.
_Avoid_: demo, sample, audition, try-out

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
Phoneme-level scoring of a Recording against the *text* of the sentence it
shadows, producing accuracy, fluency, completeness and prosody scores. Judged
against a native-speaker model, which knows nothing about the Media: a
Recording can score well on it while sounding nothing like the original.
_Avoid_: evaluation, scoring, grading

**Likeness**:
How closely a Recording follows the *delivery* of the sentence it shadows —
its intonation, its rhythm and its pace — measured against the Media's own
audio rather than a native-speaker model. The half of shadowing an Assessment
cannot see. Computed locally from the two pitch contours, and expressed in
semitones from each speaker's own median pitch, so it is about the shape of a
delivery and not about whose voice traced it.
_Avoid_: similarity, match, alignment. Alignment is a term of its own here and
means something else entirely.

**Note**:
Something you wrote about one sentence of a Media, kept attached to it. Where a
Diary is a standalone piece of writing you practise against, a Note is an
annotation on somebody else's sentence, and is never shadowed.
_Avoid_: annotation, comment, memo

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
