# Where else this class of bug is likely hiding

> **Run `npm run audit` instead of finding these by drilling.**
>
> It sweeps every example sentence in the deck and ranks each token by how
> likely the lookup got it wrong — ties, obscure alternate forms, suspicious
> deinflection chains, over-segmentation. Every one of those signals was
> computable *before* a wrong tooltip was ever shown. `--all` includes
> low-severity notes; `--json` is machine-readable.
>
> `dict.test.ts` also sweeps the whole deck on every `npm test`, so a
> regression fails the build rather than surfacing on a card three weeks later.


Every wrong translation so far came from the same shape of mistake: **a
heuristic silently picking a plausible-but-wrong answer instead of admitting it
doesn't know.** Nothing crashed, nothing logged — the card just said the wrong
thing confidently.

Grouped by mechanism, with a concrete way to check each. Status is honest:
FIXED means there's a passing test; SUSPECTED means it hasn't been verified.

---

## A. Conjugations the deinflector can't reach

When a form is unreachable, longest-match doesn't fail — it settles on a
shorter, unrelated word. That's how 降り became "bajada" and 言われて became
"remark".

| # | Case | Status |
|---|---|---|
| A1 | Irregular 行く (行った/行って) | **FIXED** |
| A2 | Bare masu-stem before an auxiliary (降り+はじめる) | **FIXED** |
| A3 | Godan passive/causative (言わ+れる) | **FIXED** — grid generated from the kana rows |
| A4 | する-compounds: 勉強させられた, 発表される | SUSPECTED |
| A5 | 来る's three stems: 来た/来ます/来ない (き/こ) | **FIXED — was real, and live**: 来ました/来て/来ます rendered くました/くて/くます on three deck sentences. The splice assumed a kanji's reading survives inflection; true of every verb but this one |
| A6 | Adjective chains: 高くなかった, 高くなさそう | SUSPECTED |
| A7 | Contractions in speech: 食べてる, 読んじゃった, なきゃ | SUSPECTED |
| A8 | Honorifics: いらっしゃいます, おっしゃる | SUSPECTED |
| A9 | 〜ておく → 〜とく, 〜ては → 〜ちゃ | SUSPECTED |

**How to check:** add the form to the conjugation grid in `dict.test.ts` and
assert the dictionary form is reachable. The grid is already there for the nine
main verb classes; extend it rather than adding one-off cases.

---

## B. Ranking picks the wrong sense

Both candidates are real words; the scorer has to choose. This produced
"nueve (en documentos legales)" for この.

| # | Case | Status |
|---|---|---|
| B1 | Common word losing to an obscure homograph (この → 九) | **FIXED** — primary-form rank |
| B2 | 行った: 行く vs 行う, a true tie | **FIXED** — deck wins |
| B3 | Ties with no deck entry to break them (降り) | **FIXED** — 降る added to the deck |
| B4 | 彼: あれ "aquello" beating かれ "él" | **FIXED** — rare-form penalty from JMdict's rK/oK tags |
| B5 | Deck entries with slash variants never matched | **FIXED** — was a real bug: 入れる／淹れる, 飛ぶ／飛ばす, 嘔吐する／吐く, 集める／集まる, 湿気／湿度 were indexed whole, so five deck words were invisible to lookup |
| B6 | Genuine polysemy the deck can't settle (つけます: ponerse vs encender) | **SURFACED** — the tooltip lists competing senses rather than picking silently |
| B7 | Counters read wrongly: 一人, 二日, 三本 | PARTLY — a few are on the ambiguous list |
| B9 | An entry with several writings and several readings printed reading #1 regardless of which writing matched — いい天気 got よい | **FIXED** — the writing's own kana pick the reading (`pickReading`) |
| B8 | Names matching common nouns | SUSPECTED |

**How to check:** for a word, print `lookupWord(w)` with scores and see whether
the intended sense is first. `/tmp/verify.ts`-style script; scores are on each
hit now.

---

## C. Segmentation draws the wrong boundary

Longest-match has no grammar. It can swallow a particle or split a compound.

| # | Case | Status |
|---|---|---|
| C1 | Particle absorbed into a word (と+言います → と言う) | BENIGN — と言う is a real expression |
| C2 | **Particles glued to fragments** — ものがいい → もの\|がい\|と, glossing がい as 害 "daño"; 健康のために → のた as 乗る | **FIXED** — the big one. Only kanji-bearing or deck words are glossed at all |
| C3 | Compound missing from the dictionary, split into single kanji (出汁 → 出 "flujo" + 汁 "jugo") | **FIXED** — a lone kanji flanked by kanji is not glossed |
| C4 | Long verb chains: 食べてしまいました as one token | BENIGN — resolves correctly |
| C6 | A particle swallowed by a longer entry: 今日は matches the greeting こんにちは, so 今日 read こんにち in any sentence starting 今日は… | **FIXED** — 今日は added to the ambiguous list, so it refuses rather than guesses. The general shape (X+は being its own entry) is still open |
| C5 | Numbers + counters: ３年, 一週間 | SUSPECTED |

**How to check:** `segment(sentence).map(t => t.text)` over every example
sentence in the deck and eyeball the boundaries. 201 sentences is reviewable in
one sitting.

---

## D. Furigana over the wrong characters

Worse than no furigana, because it teaches a wrong reading.

| # | Case | Status |
|---|---|---|
| D1 | Particle annotated (は → はね) | **FIXED** — kana never gets furigana |
| D2 | Wrong word's reading (行った → おこな) | **FIXED** — tie ⇒ no furigana |
| D3 | Over-suppression: 魚, 言う got none | **FIXED** — narrowed to a short trap list |
| D3b | Whole reading hiragana-ised, rewriting 赤ピーマン's あかピーマン to あかぴーまん | **FIXED** — found by the deck-wide sweep, not by a person |
| D4 | Rendaku in compounds: 一本 (いっぽん not いちほん) | SUSPECTED |
| D5 | Adjacent kanji get one span (出会[であ]う) | **BY DESIGN** — coarse but never wrong |
| D6 | Names, which follow no reading rules | SUSPECTED |

**How to check:** render every deck example with furigana and diff the
concatenated readings against expectation. Automatable for the 139 headwords
(the deck has the answer); sentences need a human.

---

## E. Importer / parser assumptions

Same shape, different input. These ran once over the source file, so an error
is baked into the data rather than computed live.

| # | Case | Status |
|---|---|---|
| E1 | Slash split destroying gender glosses (`el/la menor`) | **FIXED** — only separator slashes |
| E2 | Trans/intrans pair meanings mis-split | PARTLY — `cambiar (algo cambia/algo se cambia)` is shared by both halves |
| E3 | Seven readings supplied by hand in `import-md.ts` | **RESOLVED** — the dictionary supplies all seven; the table is empty and the import reports any override it agrees with, so dead rows can't accumulate |
| E4 | Examples where both halves share one sentence (こわれる/こわす) | KNOWN — the transitive half shows the intransitive example |
| E5 | Cross-category links found by exact string match only | KNOWN — near-matches need the manual list |
| E6 | Paste parser guessing a wrong subcategory | LOW RISK — defaults to last used, user reviews |
| E9 | A pasted card with kanji and no reading (the teacher rarely writes one) | **FIXED** — the Add view fills from the dictionary and flags the row `reading from dictionary`, because it is a guess made on the user's behalf |
| E8 | Patterns had no reading field at all, so 10 kanji-bearing ones (落ち着く, 〜と言います, 〜同士（で）…) shipped as bare kanji | **FIXED** — `PatternEntry.reading`, supplied by table; the import now *fails* rather than warns if a kanji pattern has none |
| E7 | A kana-only verb repeated in the kanji column (びっくりする, わかる, もらう…) rendered `びっくりする・びっくりする` on 12 cards | **FIXED** — the kanji field is now kept only if it actually contains kanji, checked in `dataset.test.ts` against the shipped deck |

**How to check:** re-run `npm run import` and read the warning block; then spot-
check the 15 pair entries in Browse, which is where the shape is unusual.
`npm test` sweeps every shipped front for a repeated half, and every card
carrying kanji for a kana reading to go with it.

**The lesson from E7:** the rule was "the first column is the kanji", and the
teacher's tables don't always honour it. Trusting the column rather than the
content is the same mistake as trusting a dictionary guess — and the fix that
sticks is asserting over the *output* (no front says the same thing twice)
rather than over the rule, because that catches whatever shape the next one
takes.

---

## F. Scheduling

Not translation, but the same "silently wrong" shape.

| # | Case | Status |
|---|---|---|
| F1 | `newPerDay` measured against unseen cards, so it reset every session | **FIXED** — counted from the review log |
| F2 | `reviewsPerDay` has the same shape — not yet capped per day | SUSPECTED |
| F3 | Leaving a review restarted it | **FIXED** — session persisted |
| F4 | Learning cards counted as "due" right after finishing | **FIXED** — `due` vs `later` |
| F5 | Timezone/DST across a day boundary | SUSPECTED |
| F6 | Undo after the app was closed (history isn't persisted) | BY DESIGN |

---

## G. The merged dataset

| # | Case | Status |
|---|---|---|
| G1 | Editing a bundled entry duplicated its id — Browse's keyed `{#each}` threw, `entryById` returned the stale copy so **edits silently did nothing**, and the deck gained a second card for the word | **FIXED** — user edits substitute in place instead of being appended |

---

## The general defence

Two rules that would have prevented most of the above, worth applying to
anything added later:

1. **Prefer the deck.** The teacher's own gloss beats any dictionary guess, and
   it's the only source that's right by definition. This is what fixed 行った.
2. **Refuse rather than guess.** Where the app can't tell (a true tie, an
   ambiguous reading), show nothing. A blank is a small cost; a confident wrong
   answer gets memorised.

   This applies to *parts* as well as wholes: `readingFor` refuses an entire
   phrase when one token refuses, because ぐっとくます looks finished and
   ぐっと\_\_ます does not. A partial answer is a wrong answer wearing the
   costume of a right one.

And the escape hatch, since neither is sufficient: **the pen icon on every
card.** No heuristic gets everything, so fixing one has to be one click away.
