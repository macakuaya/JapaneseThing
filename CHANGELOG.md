# Changelog

## 0.1.0 — 2026-08-03

First working version. A spaced-repetition app for the Japanese arriving over
WhatsApp during class, replacing Anki and making the weekly batch cheap to add.

### The deck

- Import `japones_organizado.md` into a typed dataset: **202 entries** across
  Gramática (36), Verbos (71), Vocabulario (86) and Expresiones (9).
- Handle the awkward parts of the source: the transitive/intransitive table
  (different columns, split into two linked cards), `—` meaning "no kanji",
  slash variants like `飛ぶ／飛ばす`, and the four words taught under two
  categories, which are linked so both don't surface in one session.
- Card ids are a content hash of category + Japanese, not row order, so
  re-importing preserves review progress.
- Seven readings absent from the source (`変わる → かわる` and friends) come
  from an explicit table; the importer never guesses a reading and prints
  exactly which ones it filled in.
- Added 降る (ふる) to the deck.

### Review

- SM-2 scheduler with Anki-style learning steps, ±5% interval fuzz, and a
  04:00 day boundary.
- Review and Practice are one engine under two configurations: Review lets the
  scheduler pick and writes back; Practice lets you pick and writes nothing.
- Cards follow the original Anki format — `進歩・しんぽ` on the front, meaning
  and example on the back.
- A slash in the source renders as a line break, so alternatives stack instead
  of wrapping. Only separator slashes split: `el/la menor` is left intact.
- `Verbo (ます形) ＋ はじめる` is normalised to `Vます＋はじめる`.
- An edit button on every card, because no heuristic gets everything right.

### Adding words

- Paste the teacher's messages, including the raw WhatsApp export form with
  timestamps and sender name. The parser reads an ideographic space between
  word and reading, parenthesised readings, `=`/`:`/`→` separators, the
  `進歩・しんぽ` shorthand, Markdown rows, bullets and numbering.
- Trailing asides (`です`, `する`, a katakana synonym) become a note rather
  than being mistaken for the reading.
- The teacher's messages usually carry **no translation**, so rows arrive with
  the meaning blank and flagged, and saving waits until they're filled in.

### Furigana and lookup

- Structural furigana alignment: `慣[な]れる`, `落[お]ち着[つ]く`, and
  `進歩[しんぽ]` as one ruby where nothing anchors a split. It never guesses —
  adjacent kanji get one span rather than an invented division.
- Hover or tap any word for its reading, Spanish meaning and per-kanji detail.
  Inflected forms resolve (`涼しいです → 涼しい`) and the tooltip shows the
  chain it followed.
- JMdict + KANJIDIC2 trimmed to ~1 MB gzipped (34,298 Spanish entries, 2,582
  kanji, covering every kanji in the deck). Fetched after first paint and
  excluded from the precache, so startup stays fast and it works offline once
  loaded.
- **Your deck outranks the dictionary** for any word it contains. This is the
  only reliable way to keep a tooltip consistent with the card it's on.

### Offline

- Builds to static files with a generated service worker precaching every
  asset; installs to a phone home screen and opens with no connection.

### Fixed

Grouped by cause, since most of these were the same mistake in different
places: a heuristic confidently picking a wrong answer instead of admitting it
didn't know.

**Conjugations that couldn't be reached.** When a form is unreachable,
longest-match doesn't fail — it settles on a shorter, unrelated word.

- Irregular 行く: `行った` resolved to 行う "ejecutar" instead of 行く "ir".
- Bare masu-stem: `降り` resolved to the noun 下り "bajada" instead of 降る.
- Godan passive: `言われて` resolved to the noun 言 "remark".
- Replaced the hand-written rules with a grid generated from the kana rows,
  and the tests with a grid across nine verb classes.

**Words glossed that shouldn't have been.** With 34,000 entries almost any two
kana resolve to something.

- `ものがいい` segmented as `もの|がい|と`, glossing がい as 害 "daño";
  `健康のために` produced のた as 乗る. Only kanji-bearing or deck words are
  glossed now.
- `この` matched 九's fourth reading and read "nueve (en documentos legales)".
- 出汁 is missing from the Spanish subset, so it split into 出 "flujo" and 汁
  "jugo"; a lone kanji flanked by kanji is no longer glossed.
- Particles, copulas and the card's own grammar point are skipped.

**Furigana that contradicted the characters.**

- The particle は matched the noun 羽 and was annotated はね.
- Over-correcting then removed it from 魚 and 言う; narrowed to a short list of
  genuinely bimodal words.
- Whole readings were being hiragana-ised, rewriting `赤ピーマン`'s あかピーマン
  into あかぴーまん.

**Scheduling.**

- Leaving a review restarted it. The queue is now persisted and resumes on the
  same card, surviving a closed tab.
- `newPerDay` was never daily: it counted cards still unseen, so finishing a
  session immediately offered another ten. Counted from the review log now.
- Home distinguishes "done for now, 3 in learning · next in 8m" from "all
  caught up".

**Data integrity.**

- Editing a bundled entry stored a user entry under the same id and appended
  it, so the id appeared twice: Browse's keyed `{#each}` threw and the list
  died, `entryById` returned the stale copy so **edits silently did nothing**,
  and the deck gained a duplicate card. Edits substitute in place now.
- Five deck entries with slash variants (`入れる／淹れる`, `飛ぶ／飛ばす`,
  `嘔吐する／吐く`, `集める／集まる`, `湿気／湿度`) were indexed under the
  combined string and were invisible to lookup entirely.

**Interaction.**

- The tooltip flickered: its click-away scrim covered the viewport, so opening
  it put the scrim under the cursor, which closed it, which re-hovered the
  word. Replaced with hover intent; the scrim is gone.
- Tooltips could persist forever. `placement` measured the panel, so the second
  render moved it out from under a stationary cursor and no `pointerleave`
  ever fired. Placement no longer measures anything.
- One word rendered as two hover targets, because each ruby segment was its own
  span.
- The dev server port is pinned with `strictPort`. Vite silently moving to the
  next free port meant a different origin, and `localStorage` is per-origin —
  which quietly hands you an empty deck and loses your history.

### Tooling

- `npm run audit` sweeps every example sentence and ranks each token by how
  likely the lookup got it wrong — ties, obscure alternate forms, suspicious
  deinflection chains, over-segmentation. It took high-severity findings from
  17 to 0, and found the `赤ピーマン` bug before a person did.
- `npm test` sweeps the whole deck too, so regressions fail the build rather
  than surfacing on a card weeks later. 292 tests.
- `AUDIT.md` records what's fixed and what's still only suspected.

### Known limits

- Progress is per-device; `localStorage` doesn't sync. Settings › Backup is the
  manual bridge.
- Genuine ambiguity is surfaced rather than resolved: `つけます` could be
  "ponerse" or "encender", and the tooltip lists both.
- 77 kanji fall back to English meanings, which KANJIDIC has no Spanish gloss
  for. They're labelled `(en)`.
