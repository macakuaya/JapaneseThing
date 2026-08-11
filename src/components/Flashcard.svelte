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

<article class="card card-shape" class:editing class:kanji={entry.kind === 'kanji'}>
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
              Everything a kanji card owes you, in the order you want it: what
              it means, how it is read, where you have met it, and one sentence.
              The reference layout gave each of those a heading of its own,
              which on a card this size is mostly headings.
            -->
            <p class="meaning">{entry.meaning}</p>

            <div class="yomi">
              {#if entry.on.length}
                <div class="yomi-row">
                  <span class="tag jp">音</span>
                  <span class="jp reading">{entry.on.join('・')}</span>
                </div>
              {/if}
              {#if entry.kun.length}
                <div class="yomi-row">
                  <span class="tag jp">訓</span>
                  <span class="jp reading">{entry.kun.join('・')}</span>
                </div>
              {/if}
            </div>

            {#if entry.vocabulary.length}
              <ul class="vocab">
                {#each entry.vocabulary as v (v.word)}
                  <li>
                    <span class="jp">{v.word}・{v.reading}</span>
                    <span class="muted">{v.meaning}</span>
                  </li>
                {/each}
              </ul>
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

        {#if !readOnly}
          <!-- Grading sits on the card: seeing the answer and judging it are one
               action, in one place. -->
          <div class="grading">
            <Grader state={card.state} {writeThrough} {now} {pressed} {onGrade} />
          </div>
        {/if}
      {/if}
    </div>
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

  /* Keeps the card's proportions rather than growing to fit the form, so
     opening the editor changes what the card shows and nothing else. */
  .card.editing {
    text-align: left;
    padding: 1rem;
    overflow: hidden;
  }

  .editing-pane {
    height: 100%;
    overflow-y: auto;
    /* Room for the focus ring on the last field, which a flush edge clips. */
    padding: 2px;
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

  /* One character, so it can be as large as its share allows — the shape is
     the whole question, and small type hides the strokes you need to read. */
  .question.glyph {
    font-size: clamp(3.5rem, 17vw, 5.5rem);
    line-height: 1;
  }

  /* The one card that fills its two thirds exactly. Tightened until the
     translation's last line clears the grading buttons without scrolling —
     you should be able to read a kanji card without moving it. */
  .card.kanji .told {
    gap: 0.4rem;
  }

  .card.kanji .vocab {
    font-size: 0.82rem;
  }

  /* Meanings are prose, not display text — don't blow them up like kanji. */
  .question:not(.jp) {
    font-size: clamp(1.05rem, 4vw, 1.35rem);
  }

  .answer {
    padding-top: 0.7rem;
    justify-content: space-between;
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

  .yomi {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    align-items: center;
  }

  .yomi-row {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
  }

  /* 音 and 訓 rather than "Onyomi" and "Kunyomi": two characters say it, and
     the words were longer than the readings they labelled. */
  .tag {
    font-size: 0.68rem;
    color: var(--on-accent);
    background: var(--faint);
    border-radius: 4px;
    padding: 0.05rem 0.25rem;
    line-height: 1.3;
  }

  .reading {
    font-size: 0.95rem;
  }

  .vocab {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.85rem;
  }

  .vocab li {
    display: flex;
    justify-content: center;
    gap: 0.4rem;
  }

  .grading {
    flex-shrink: 0;
    width: 100%;
    padding-top: 0.8rem;
  }

</style>
