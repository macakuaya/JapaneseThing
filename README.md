# 語 · Japanese SRS

A spaced-repetition web app for the vocabulary, grammar and expressions that
arrive over WhatsApp during class. Replaces Anki, and makes adding next week's
batch cheap: paste the teacher's messages, check what the parser guessed, save.

Built with Vite + Svelte 5 + TypeScript. No backend, no accounts, no
dependencies at runtime.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Static build into `dist/`, then generates the service worker |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (scheduler, parser, queue) |
| `npm run check` | Type-check `.ts` and `.svelte` |
| `npm run import` | Re-import `japones_organizado.md` into `src/data/seed.json` |
| `npm run dict` | Rebuild the trimmed dictionaries in `public/dict/` |
| `npm run deploy` | Build with the Pages base path and publish to `gh-pages` |

## Card format

Cards follow the format from the original Anki deck — the reading is on the
**front**, so a card tests meaning, not reading:

```
Front:  進歩・しんぽ
        ──────────────
Back:   Progreso
        進歩があります
        Hay Progreso
```

Words written only in kana render without the interpunct (`にんにく`), and
grammar patterns render as themselves (`〜たびに`).

By default every entry produces one **recognition** card (Japanese → Spanish).
Turning on a category under Settings › Production cards adds the reverse
direction for that category, which doubles its card count.

A slash in the source means "or, alternatively" and is rendered as a line
break, so `〜と〜とどちらが〜ですか／〜のほうが〜です` stacks instead of wrapping.
Only a fullwidth `／` or a *spaced* ASCII slash breaks — tight slashes are left
alone, because the Spanish glosses use them for gender (`el/la menor`,
`veterinario/a`). Patterns written out as `Verbo (ます形) ＋ はじめる` are
normalised to `Vます＋はじめる`, at import and in the paste parser.

## Furigana and lookup

**Furigana** is a three-way setting: off, always, or only on the answer side
(the default, so the question still lets you test yourself). Alignment is
structural — kana in the writing anchor against the same kana in the reading,
and the kanji between them take what's left:

```
慣れる / なれる      →  慣[な]れる
落ち着く / おちつく  →  落[お]ち着[つ]く
進歩 / しんぽ        →  進歩[しんぽ]     (nothing says where しん ends)
```

It never guesses. Adjacent kanji get one ruby spanning both rather than an
invented split, and a word with genuinely different readings (一日 is ついたち
or いちにち) gets none at all.

**Lookup**: hover or tap any word in an example sentence for its reading,
Spanish meaning and the readings of each kanji in it, plus a button to add it
to your deck. Inflected forms are handled — `涼しいです` resolves to `涼しい`,
`食べてしまいました` to `食べる` — and the tooltip shows the chain it followed.

Headword furigana needs no dictionary; it comes from your deck's own `kana`.
Sentence furigana and lookup use JMdict + KANJIDIC2, trimmed by
`npm run dict` to about **1 MB gzipped** (34,298 Spanish word entries, 2,582
kanji, covering every kanji in the bundled deck). Those files are fetched after
first paint rather than bundled, and deliberately excluded from the service
worker's precache — so the app starts fast, and once the dictionary has loaded
once it stays available offline.

## Review vs. Drill

**Review** is the scheduler's call. The queue is whatever is due today plus a
capped trickle of new cards; the contents aren't yours to choose, and grading
rewrites each card's schedule. It is deliberately **finite** — when the queue
empties, the day is done. That boundedness is what makes daily reps
sustainable, and it is the actual Anki replacement.

**Drill** is your call, and lives in the Deck view: filter the list by deck,
subcategory or a search, then study exactly what you filtered. Nothing is
written to the schedule, so cramming before class doesn't drag your due dates
out of alignment. A "count toward scheduling" toggle opts back in.

The two are one engine under two configs (`src/lib/session.ts`) — Review
sources the due queue and writes back; Drill sources a filter and doesn't.

**Leaving mid-review resumes where you left off.** The queue order and counters
are stored, so navigating away — or closing the tab entirely — picks up on the
same card; Home shows "Resume review" instead of "Start". Only the order is
stored, never the cards, so a resumed queue reflects any answers given since. A
session is dropped once the study day rolls over.

## The two screens

**Home** answers one question: what do I do now? Three numbers, the review
button, and a read-only strip showing how much of each deck you know.

**Deck** is everything about the cards — browse, search, filter, drill, edit.
The organising rule is that *what you see is what you drill*: the search box
and the two dropdowns narrow one list, and the Drill button studies exactly
that list. Tapping a row opens its editor.

## Adding words each week

Paste the teacher's messages into **Add** — including the raw WhatsApp export
form, timestamps and sender name included:

```
[10/10/2026, 13:54:24] せんせい: 奇抜　きばつ　です
[10/10/2026, 14:09:34] せんせい: 品質　ひんしつ　クオリティ
[10/10/2026, 14:07:51] せんせい: 服を試す　ためす
```

The parser handles the formats that actually turn up: an ideographic space
between word and reading, a parenthesised reading (`慣れる（なれる）`), a
parenthesised gloss (`食べる (comer)`), `=`/`:`/`→` separators, the
`進歩・しんぽ` shorthand, Markdown table rows, bullets and numbering. Trailing
asides (`です`, `する`, a katakana synonym) become a note rather than being
mistaken for the reading.

Each row is scored for confidence and shown in an editable table. Nothing saves
until you press Save. Because the teacher's messages usually carry **no
translation**, rows arrive with the meaning blank and flagged — type them in, or
untick the rows you don't want. Saving is blocked while a selected row has no
meaning, since a card with a blank back is useless.

## The seed deck

`japones_organizado.md` is the source of record for the bundled deck — 201
entries across Gramática, Verbos, Vocabulario and Expresiones. To bulk-update
it, edit the Markdown and run:

```bash
npm run import
```

The importer handles the quirks in that file: the transitive/intransitive table
(different columns, split into two linked cards), `—` meaning "no kanji", slash
variants like `飛ぶ／飛ばす`, and words taught under two categories (落ち着く,
気になる, 気に入る, もったいない) which are linked so both don't surface in the
same session. It refuses to write on duplicate ids or empty meanings.

Seven readings absent from the source table are supplied from an explicit list
in `scripts/import-md.ts` (`変わる → かわる` and friends); the importer never
guesses a reading, and prints exactly which ones it filled in.

**Review progress survives a re-import.** Card ids are a content hash of the
category plus the Japanese, not a row number, so re-importing only resets an
entry whose Japanese actually changed.

## Deploying

```bash
npm run deploy
```

Builds with `BASE_PATH=/JapaneseThing/` and pushes `dist/` to the `gh-pages`
branch. Change the path in `package.json` if the repo is named differently.

The build emits a service worker (`scripts/build-sw.ts`) that precaches every
built asset, so the app opens on your phone with no connection. Add it to your
home screen from the browser's share menu.

> The precache lookup uses `ignoreVary: true`. Without it a module-script
> request fails to match the entry `addAll()` stored, the worker silently falls
> through to the network, and the app renders blank offline.

## Progress is per-device

localStorage does not sync between your laptop and your phone. Settings ›
Backup exports everything (scheduling, added entries, settings, review log) as
one JSON file; import it on the other device to move it across. Real sync would
need a backend and is out of scope.

## Layout

```
japones_organizado.md      source of record for the seed deck
scripts/
  import-md.ts             Markdown → src/data/seed.json
  build-dict.ts            JMdict + KANJIDIC2 → public/dict/
  build-sw.ts              generates dist/sw.js after a build
public/dict/               trimmed dictionaries (committed, lazily fetched)
src/
  lib/
    types.ts               Dataset, Entry union, CardState, Settings
    text.ts                script detection, cell parsing, stable ids
    srs.ts                 SM-2 + learning steps (pure)
    session.ts             SessionConfig → ordered queue, resume (pure)
    furigana.ts            writing↔reading alignment (pure)
    dict.ts                dictionary load, deinflection, segmentation
    parse.ts               the paste parser
    storage.ts             localStorage, export/import, session in progress
    store.svelte.ts        app state
    tooltip.svelte.ts      the shared lookup popover's state
  components/              Flashcard, Grader, JapaneseText, Tooltip
  views/                   Home, Deck, Session, Review, Practice, Add, Settings
```

Anything language-specific lives in the dataset, not the code: a deck declares
its own language pair and categories, so a different one drops in unchanged.

## Styling

Surfaces are distinguished by **fill**, not outline. A border is treated as a
negative and spent only where a genuine division exists that fill and spacing
cannot express — currently four places: the sticky header boundary, separators
between repeated rows on one surface, the front/back split on a card, and the
rule between a word and its kanji breakdown in the lookup tooltip.

## Credits

Dictionary data from [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) and
[KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), © the
Electronic Dictionary Research and Development Group, used under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and packaged
via [jmdict-simplified](https://github.com/scriptin/jmdict-simplified).
