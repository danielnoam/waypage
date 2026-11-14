# Waypage language packs

Data for Waypage's Anki extension (Settings › Extensions › Anki › Languages).
This branch holds only files the app downloads; it has no code and no history
with the app. Each file is fetched at a fixed commit and checked against the
SHA-256 pinned in `src/extensions.js` before it is kept, so a file here never
changes: a new version is a new commit and a new pin.

| File | What it is | SHA-256 |
| --- | --- | --- |
| `de-en.tar.gz` | German → English: 81,898 words and their inflected forms, as a StarDict dictionary | `09f7325a69a742aec48e6cd360fa81222abf452201e451ae42fa9ba8482b1a6b` |

## Where the words come from

Wiktionary's German entries, with English meanings, as extracted by
[Wiktextract](https://github.com/tatuylonen/wiktextract) and published by
[kaikki.org](https://kaikki.org/dictionary/German/). The text is by Wiktionary
contributors, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/);
these packs are adaptations of it and are shared under the same licence.

Built with `tools/packs/build-lang.js` in the Waypage repository:

    node tools/packs/build-lang.js kaikki.org-dictionary-German.jsonl out --id de-en --name "German → English"
