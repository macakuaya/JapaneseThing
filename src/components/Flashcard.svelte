<script lang="ts">
  // A card split like a domino: the question occupies the top half, the answer
  // the bottom. The card never moves or turns — tapping it fills the empty
  // half in place, so the question stays exactly where you were reading it.
  //
  // The dividing rule is always there, so the space the answer will occupy is
  // visible before it arrives and nothing shifts when it does.

  import { ArrowLeftRight } from '@lucide/svelte'
  import type { Card } from '../lib/session.ts'
  import type { Grade, WordEntry } from '../lib/types.ts'
  import { cardFront, splitSlashLines } from '../lib/text.ts'
  import { store } from '../lib/store.svelte.ts'
  import JapaneseText from './JapaneseText.svelte'
  import EntryEditor from './EntryEditor.svelte'
  import Grader from './Grader.svelte'

  interface Props {
    card: Card
    revealed: boolean
    /** Grading mode: four scheduling buttons, or a simple pass/fail. */
    writeThrough?: boolean
    now?: number
    /** The grade being committed, lit on its button until the card changes. */
    pressed?: Grade | null
    /**
     * Browsing rather than studying: both halves are shown at once and there
     * is nothing to grade. Looking a card up is not answering it, and offering
     * the buttons anyway would invite you to reschedule a card you only opened
     * to read.
     */
    readOnly?: boolean
    /** Owned by the session, because the control that opens it is the header's. */
    editing?: boolean
    onEditDone?: () => void
    onReveal?: () => void
    onGrade?: (grade: Grade) => void
  }

  const {
    card,
    revealed,
    writeThrough = true,
    now = Date.now(),
    pressed = null,
    readOnly = false,
    editing = false,
    onEditDone = () => {},
    onReveal = () => {},
    onGrade = () => {},
  }: Props = $props()

  const entry = $derived(card.entry)

  const showFurigana = $derived(
    store.settings.furigana === 'always' ||
      (store.settings.furigana === 'revealed' && revealed),
  )
  const interactive = $derived(store.settings.lookup)

  const front = $derived(card.direction === 'recognition' ? cardFront(entry) : entry.meaning)
  const frontIsJapanese = $derived(card.direction === 'recognition')

  /** What this card teaches; those words get no tooltip in the example. */
  const taught = $derived.by(() => {
    if (entry.kind === 'pattern') return entry.pattern
    if (entry.kind === 'kanji') return entry.character
    return `${entry.kanji ?? ''}${entry.kana}`
  })

  /** The other half of a transitive/intransitive pair. */
  const partners = $derived.by(() => {
    const myRole = entry.kind === 'word' ? entry.role : undefined
    const out: WordEntry[] = []
    for (const id of entry.relatedIds) {
      const other = store.entryById(id)
      if (other?.kind === 'word' && other.role && other.role !== myRole) out.push(other)
    }
    return out
  })
</script>

<article
  class="card card-shape"
  class:editing
  class:kanji={entry.kind === 'kanji'}
  class:hushed={store.morphHidden}
>
  {#if editing}
    <!-- Same box, same size, same place: the card doesn't become a different
         object to be corrected, it just shows its own fields. -->
    <div class="editing-pane">
      <EntryEditor {entry} onDone={onEditDone} />
    </div>
  {:else}
    {#if !revealed && !readOnly}
      <!-- The whole face is the target. No label and no hover: an empty half
           under a question is already an invitation, and a button drawn inside
           the card would compete with the card for being the thing you click. -->
      <button class="tap" onclick={onReveal} aria-label="Show answer"></button>
    {/if}

    <div class="half question" class:jp={frontIsJapanese} class:glyph={entry.kind === 'kanji'}>
      {#each splitSlashLines(front) as line (line)}
        <div class="line">{line}</div>
      {/each}
    </div>

    <div class="half answer">
      {#if revealed}
        <div class="told">
          {#if entry.kind === 'kanji'}
            <!--
              A kanji card is a reference entry, not a sentence, so it is set
              as one: left-aligned, in columns that line up down the card.
              Centred, the readings, the words and their meanings all started
              at a different place on every row and none of them could be
              scanned.

              The readings sit side by side, split by a rule and unlabelled.
              Katakana is on'yomi and hiragana is kun'yomi — the scripts say
              which is which, and a label saying the same thing in smaller type
              is a label you stop reading.
            -->
            <!--
              Meaning first: it sits directly under the character, which is
              where the eye lands and the one thing you were actually asked.
              The readings follow, side by side and centred in their halves.
            -->
            <p class="meaning">{entry.meaning}</p>

            <div class="yomi">
              <span class="jp on">{entry.on.join('・') || '—'}</span>
              <span class="jp kun">{entry.kun.join('・') || '—'}</span>
            </div>

            {#if entry.vocabulary.length}
              <!-- Word, reading and meaning in three columns, so the eye can
                   run down any one of them. -->
              <dl class="vocab">
                {#each entry.vocabulary as v (v.word)}
                  <dt class="jp">{v.word}</dt>
                  <dd class="jp reading">{v.reading}</dd>
                  <dd class="gloss muted">{v.meaning}</dd>
                {/each}
              </dl>
            {/if}

            {#if entry.example}
              <div class="example">
                <p class="jp">
                  <JapaneseText
                    text={entry.example.target}
                    furigana={showFurigana}
                    {interactive}
                    categoryHint={entry.category}
                    {taught}
                  />
                </p>
                {#if entry.example.native}
                  <p class="muted">{entry.example.native}</p>
                {/if}
              </div>
            {/if}

          {:else if card.direction === 'recognition'}
            <p class="meaning">
              {#each splitSlashLines(entry.meaning) as line (line)}
                <span class="line">{line}</span>
              {/each}
            </p>
          {:else}
            <p class="meaning jp big">
              {#each splitSlashLines(cardFront(entry)) as line (line)}
                <span class="line">{line}</span>
              {/each}
            </p>
          {/if}

          {#if entry.kind !== 'kanji'}
            {#if entry.note}
              <p class="note">{entry.note}</p>
            {/if}

            {#if entry.example}
            <div class="example">
              <p class="jp">
                {#each splitSlashLines(entry.example.target) as line (line)}
                  <span class="line">
                    <JapaneseText
                      text={line}
                      furigana={showFurigana}
                      {interactive}
                      categoryHint={entry.category}
                      {taught}
                    />
                  </span>
                {/each}
              </p>
              {#if entry.example.native}
                <p class="muted">
                  {#each splitSlashLines(entry.example.native) as line (line)}
                    <span class="line">{line}</span>
                  {/each}
                </p>
              {/if}
            </div>
          {/if}

            {#each partners as partner (partner.id)}
              <p class="partner faint">
                <ArrowLeftRight size={13} />
                {partner.note ?? 'par'}:
                <span class="jp">{cardFront(partner)}</span> — {partner.meaning}
              </p>
            {/each}
          {/if}
        </div>

      {/if}
    </div>

    <!--
      The grader is the card's own footer, a sibling of the two halves rather
      than the tail of the answer. That is what lets a card divide its *content*
      in a ratio without the buttons counting toward it — the kanji card wants a
      third for the character and two thirds for the entry, and the buttons are
      neither.
    -->
    {#if !readOnly}
      <!--
        Always present, invisible until there is an answer to judge.
        
        Rendered only after the reveal, it appeared as an 80px row and the two
        halves above it shrank to make room — so the character rose up the card
        the instant you tapped it. Holding the space costs nothing and the card
        stops moving. `inert` keeps it off the tab order and out of reach of a
        click while it is hidden.
      -->
      <div class="grading" class:waiting={!revealed} inert={!revealed} aria-hidden={!revealed}>
        <Grader state={card.state} {writeThrough} {now} {pressed} {onGrade} />
      </div>
    {/if}
  {/if}
</article>

<style>
  /*
   * Same proportion as the decks on Home, so the card that grows out of a deck
   * is recognisably the same object. Capped in width because a 3:4 card at the
   * full column width would be taller than the screen.
   */
  /* Geometry comes from .card-shape in app.css, shared with the session
     summary so the two can never drift apart again. */
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    padding: 1.3rem 1.15rem;
    text-align: center;
    view-transition-name: card-morph;
  }

  /*
   * The face, not the card. While the shape is travelling between here and a
   * deck on Home there must be nothing written on it — a snapshot carries
   * whatever the element contained, so contents left in place would be
   * stretched along with the box.
   *
   * `:global` because some of these children belong to Grader and EntryEditor;
   * what has to empty is everything the card is holding, whoever rendered it.
   */
  .card > :global(*) {
    transition: opacity var(--morph-fade) ease;
  }

  .card.hushed > :global(*) {
    opacity: 0;
  }

  /* Keeps the card's proportions rather than growing to fit the form, so
     opening the editor changes what the card shows and nothing else. */
  .card.editing {
    text-align: left;
    padding: 1rem;
    overflow: hidden;
  }

  /*
   * The 2px is room for a focus ring: this scrolls, and a scroll container
   * clips at its own padding box, so a ring on the first or last field would
   * be shaved off.
   *
   * It is borrowed from the card's padding rather than added to it — pulled
   * out 2px on every side and grown by the 4px that costs — so the gap under
   * the buttons is the same as the gap beside the fields. Shifting without
   * growing left it 4px short.
   */
  .editing-pane {
    height: calc(100% + 4px);
    margin: -2px;
    padding: 2px;
    overflow-y: auto;
  }

  /*
   * A third for the question, two thirds for the answer.
   *
   * They used to be equal halves, which flattered the question: it is one
   * word or one pattern, while the answer carries a meaning, a sentence and
   * its translation. Splitting down the middle left the top half half-empty
   * and the bottom half scrolling.
   *
   * Both are always present, so revealing the answer still changes nothing
   * about where anything sits.
   */
  .half {
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .question {
    flex: 0 0 34%;
    /* A long pattern scrolls inside its third rather than pushing the rule
       down and taking room from the answer. */
    overflow-y: auto;
  }

  .answer {
    flex: 1 1 auto;
  }

  /* No rule between the halves. The empty space below the question already
     says an answer belongs there, and a border earns its place only where
     fill and spacing can't do the job. */
  .question {
    font-size: clamp(1.35rem, 5.5vw, 1.9rem);
    overflow-wrap: anywhere;
    padding-bottom: 0.7rem;
  }

  /*
   * Big enough to read every stroke, and no bigger. It was sized to fill its
   * share of the card, which made it the loudest thing on a card whose answer
   * is the part you came for.
   */
  .question.glyph {
    font-size: clamp(2.6rem, 12vw, 4rem);
    line-height: 1;
  }

  /*
   * A third for the character, two thirds for the entry — of the content, not
   * of the card. The buttons are a sibling now, so they take their height off
   * the top before this ratio is applied, which is what "a third, but not of
   * the whole card" means.
   */
  .card.kanji .question {
    flex: 1 1 0;
  }

  .card.kanji .answer {
    flex: 2 1 0;
  }

  /* The one card that fills its two thirds exactly. Tightened until the
     translation's last line clears the grading buttons without scrolling —
     you should be able to read a kanji card without moving it. */
  /* Air between the parts. They are four separate things — what it means, how
     it is read, where it turns up, and one sentence — and run together at a
     tight gap they read as one block of small text. */
  .card.kanji .told {
    gap: 1.05rem;
    justify-content: flex-start;
  }

  /*
   * The gaps between the four parts are worth more than the gap above them:
   * the character already has a whole third to itself, and the answer's own
   * top padding was buying nothing that the ratio hadn't already given it.
   */
  .card.kanji .answer {
    padding-top: 0.1rem;
  }

  /* The character sits low in its share, close to the meaning it belongs to,
     rather than floating in the middle of an empty third. */
  .card.kanji .question {
    justify-content: flex-end;
    padding-bottom: 0.9rem;
  }

  /*
   * Centred and a size up, like the meaning on every other card. The one line
   * that answers the question is the one exception to the single-size rule —
   * the rest of the entry is reference, this is the answer.
   */
  .card.kanji .meaning {
    text-align: center;
    font-size: 1.15rem;
  }

  .card.kanji .vocab {
    font-size: 0.82rem;
  }

  /* Meanings are prose, not display text — don't blow them up like kanji. */
  .question:not(.jp) {
    font-size: clamp(1.05rem, 4vw, 1.35rem);
  }

  .answer {
    flex: 1 1 auto;
    padding-top: 0.7rem;
    justify-content: space-between;
  }

  .grading {
    flex: 0 0 auto;
  }

  .grading.waiting {
    visibility: hidden;
  }

  .line {
    display: block;
  }

  /* --- the tap target, before revealing -------------------------------- */

  /* Sits over the entire card, under the pen. Deliberately invisible: it adds
     a hit area, not a control. */
  /* Borderless on purpose. It is the size of the card, so the button border
     every other control now carries would draw a ring around the card itself
     — which is exactly what it did. */
  .tap {
    position: absolute;
    inset: 0;
    background: transparent;
    border: none;
    border-radius: inherit;
    padding: 0;
  }

  .tap:hover {
    background: transparent;
    border: none;
  }

  /* --- the answer ------------------------------------------------------ */

  /*
   * `safe center` rather than `center`: a centred flex column that overflows
   * spills equally off both ends, so the first line becomes unreachable — the
   * kanji card opened with its meaning already scrolled off the top. `safe`
   * falls back to flex-start the moment the content doesn't fit.
   */
  .told {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    gap: 0.8rem;
    width: 100%;
  }

  .meaning {
    margin: 0;
    font-size: 1.15rem;
  }

  .meaning.big {
    font-size: clamp(1.35rem, 5vw, 1.8rem);
  }

  .note {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    color: var(--faint);
    letter-spacing: 0.04em;
  }

  .example p {
    margin: 0;
  }

  .example .jp {
    font-size: 1.05rem;
  }

  .example .muted {
    font-size: 0.85rem;
    margin-top: 0.15rem;
  }

  .partner {
    margin: 0;
    font-size: 0.78rem;
  }

  /* --- kanji ------------------------------------------------------------ */

  /* A reference entry reads left to right down a column, not centred. */
  .card.kanji .told {
    text-align: left;
    align-items: stretch;
  }

  /* On the left, kun on the right, each centred in its own half. */
  .yomi {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: baseline;
    text-align: center;
  }

  .yomi .kun {
    border-left: 1px solid var(--divider);
  }

  /*
   * One size for the whole entry. Ranking the parts by type size was a guess
   * about which line matters, and on a reference card they matter in the order
   * you read them, which the layout already says.
   *
   * Two exceptions, both named here rather than fought over on specificity.
   * `rt` has to be relative — furigana sized in `em` stays a fraction of
   * whatever it sits above, and pinned to the body size it becomes a second
   * line of text. `.meaning` is the answer to the question the card asked, and
   * gets the same size it has on every other card.
   */
  .card.kanji .told {
    font-size: 0.9rem;
  }

  .card.kanji .told :global(*:not(rt):not(.meaning)) {
    font-size: inherit;
  }

  /*
   * Three columns that hold their width down the list: the writing, its
   * reading, then the gloss. `auto auto 1fr` lets the two Japanese columns be
   * as wide as their widest row and gives the rest to the meaning.
   */
  .vocab {
    display: grid;
    grid-template-columns: auto auto 1fr;
    column-gap: 0.6rem;
    row-gap: 0.1rem;
    margin: 0;
    font-size: 0.85rem;
  }

  .vocab dt,
  .vocab dd {
    margin: 0;
    min-width: 0;
  }

  .vocab .reading {
    color: var(--muted);
  }

  .vocab .gloss {
    overflow-wrap: anywhere;
  }

  .grading {
    flex-shrink: 0;
    width: 100%;
    padding-top: 0.8rem;
  }

</style>
