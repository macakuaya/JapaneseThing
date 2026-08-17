# 語 · Japanese SRS

Spaced repetition for the vocabulary and grammar that arrive over WhatsApp
during class. Replaces Anki, and makes adding next week's batch cheap: paste
the teacher's messages, check what the parser guessed, save.

Vite + Svelte 5 + TypeScript. No backend, no accounts, nothing at runtime.

**Live at [macakuaya.github.io/JapaneseThing](https://macakuaya.github.io/JapaneseThing/)**

```bash
npm install
npm run dev          # localhost:5173
```

| Script | |
|---|---|
| `dev` `build` `preview` | the usual |
| `test` `check` | unit tests · type-check |
| `import` | `japones_organizado.md` → `src/data/seed.json` |
| `dict` | rebuild the trimmed dictionaries in `public/dict/` |
| `audit` | sweep every example sentence for suspect lookups |
| `deploy` | build with the Pages base path and publish |

## The parts worth knowing

**Cards** show `進歩・しんぽ` on the front — reading included, so a card tests
meaning rather than reading. Kanji cards are their own kind, with readings,
vocabulary and a sentence.

**Review** is the scheduler's call: what's due plus a capped trickle of new
cards, and grading rewrites the schedule. It is deliberately finite — when the
queue empties, the day is done. **Drill** is yours: filter the deck list and
study exactly what you filtered, with nothing written to the schedule. One
engine under two configs (`src/lib/session.ts`).

Miss a card and it comes back before the session ends rather than being
scheduled minutes out. Three buttons — Hard, Good, Easy. States are New, Young,
Mature, Leech; Settings explains them.

**Leaving mid-review resumes**, on the same card. Only the queue order is
stored, so a resumed session reflects any answers given since.

## Adding words

Paste into **Add**, raw WhatsApp export included:

```
[10/10/2026, 13:54:24] せんせい: 奇抜　きばつ　です
```

Readings the teacher didn't write are filled from the dictionary and flagged so
you can check them. Rows arrive with the meaning blank — that's the normal
case, since the messages rarely carry a translation — and saving waits until
you fill them in. **Copy Claude prompt** gives you the prompt that turns a chat
log into the table this parser reads best.

## The seed deck

`japones_organizado.md` is the source of record: 203 entries across Gramática,
Verbos, Vocabulario, Expresiones and Kanji. Edit it and run `npm run import`.

Card ids are a content hash of the category plus the Japanese, not a row
number, so **re-importing never resets progress** on an entry whose Japanese
hasn't changed. The importer refuses to write on duplicate ids or empty
meanings, and never guesses a reading — it takes them from the dictionary or
from an explicit table, and prints which.

## Progress is per-device

localStorage doesn't sync between laptop and phone, so the two keep separate
progress. Settings › Backup exports everything as one JSON file; import it on
the other device. Real sync would need a backend.

## Where things live

Pure and tested: `srs.ts` (scheduling), `session.ts` (queue), `furigana.ts`
(alignment), `streak.ts` (heatmap), `text.ts`, `parse.ts`. Everything else is
`store.svelte.ts` plus `components/` and `views/`.

Anything language-specific lives in the dataset, not the code — a deck declares
its own language pair and categories, so a different one drops in unchanged.

`AUDIT.md` tracks where the dictionary has been wrong before, and what stopped
it. Worth reading before trusting a lookup.

## Credits

[JMdict](https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html) and
[KANJIDIC2](https://www.edrdg.org/wiki/KANJIDIC_Project.html), © the Electronic
Dictionary Research and Development Group, used under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and packaged via
[jmdict-simplified](https://github.com/scriptin/jmdict-simplified).
