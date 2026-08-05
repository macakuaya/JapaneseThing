<script lang="ts">
  // A card the same shape as the deck it came from, which flips.
  //
  // The question is the whole front face; tapping it turns the card over to
  // the answer, with the grading buttons on that face. No "show answer"
  // button — the card is the affordance, the same way a deck on Home is.

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
    writeThrough: boolean
    now: number
    onReveal: () => void
    onGrade: (grade: Grade) => void
  }

  const { card, revealed, writeThrough, now, onReveal, onGrade }: Props = $props()

  const entry = $derived(card.entry)

  let editing = $state(false)

  const showFurigana = $derived(
    store.settings.furigana === 'always' ||
      (store.settings.furigana === 'revealed' && revealed),
  )
  const interactive = $derived(store.settings.lookup)

  const front = $derived(card.direction === 'recognition' ? cardFront(entry) : entry.meaning)
  const frontIsJapanese = $derived(card.direction === 'recognition')

  /** What this card teaches; those words get no tooltip in the example. */
  const taught = $derived(
    entry.kind === 'pattern' ? entry.pattern : `${entry.kanji ?? ''}${entry.kana}`,
  )

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

<div class="scene">
  {#if editing}
    <div class="editing card-surface">
      <EntryEditor {entry} onDone={() => (editing = false)} />
    </div>
  {:else}
    <div class="flipper" class:flipped={revealed}>
      <!-- Front: the question, and nothing else to look at. -->
      <button class="face front" onclick={onReveal} disabled={revealed} aria-label="Show answer">
        <div class="ask" class:jp={frontIsJapanese}>
          {#each splitSlashLines(front) as line (line)}
            <div class="line">{line}</div>
          {/each}
        </div>
        <span class="prompt faint">tap to flip</span>
      </button>

      <!-- Back: the question again, its answer, and the grading. -->
      <div class="face back">
        <button
          class="pen ghost"
          onclick={() => (editing = true)}
          title="Edit this card"
          aria-label="Edit this card">✎</button
        >

        <div class="recap" class:jp={frontIsJapanese}>
          {#each splitSlashLines(front) as line (line)}
            <div class="line">{line}</div>
          {/each}
        </div>

        <div class="answer">
          {#if card.direction === 'recognition'}
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
              ⇄ {partner.note ?? 'par'}:
              <span class="jp">{cardFront(partner)}</span> — {partner.meaning}
            </p>
          {/each}
        </div>

        <!-- Grading lives on the card, not under it: seeing the answer and
             judging it are one action, in one place. -->
        <div class="grading">
          <Grader state={card.state} {writeThrough} {now} {onGrade} />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /*
   * Same proportion as the decks on Home, so the card that grows out of a deck
   * is recognisably the same object. Capped in width because a 3:4 card at the
   * full column width would be taller than the screen.
   */
  .scene {
    width: min(390px, 100%);
    aspect-ratio: 3 / 4;
    margin: 0 auto;
    perspective: 1400px;
    view-transition-name: card-morph;
  }

  .flipper {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.45s cubic-bezier(0.2, 0, 0.15, 1);
  }

  .flipper.flipped {
    transform: rotateY(180deg);
  }

  .face {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: var(--radius);
    padding: 1.4rem 1.15rem 1rem;
    text-align: center;
    font: inherit;
    color: inherit;
    /* Hides the mirrored reverse of each face during the turn. */
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .back {
    transform: rotateY(180deg);
  }

  /* --- front --------------------------------------------------------- */

  .front {
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .front:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .ask {
    font-size: clamp(1.5rem, 6vw, 2.1rem);
    overflow-wrap: anywhere;
  }

  /* Meanings are prose, not display text — don't blow them up like kanji. */
  .ask:not(.jp) {
    font-size: clamp(1.1rem, 4vw, 1.45rem);
  }

  .prompt {
    position: absolute;
    bottom: 1rem;
    left: 0;
    right: 0;
    font-size: 0.7rem;
  }

  /* --- back ---------------------------------------------------------- */

  .recap {
    font-size: 1.05rem;
    color: var(--muted);
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--divider);
    flex-shrink: 0;
  }

  /* Takes the space between the recap and the buttons, and scrolls inside the
     card rather than making it taller — the card's shape is fixed, so a long
     example must not change it. */
  .answer {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.9rem;
    padding: 0.9rem 0;
  }

  .line {
    display: block;
  }

  .meaning {
    margin: 0;
    font-size: 1.2rem;
  }

  .meaning.big {
    font-size: clamp(1.4rem, 5vw, 1.9rem);
  }

  .note {
    margin: 0.3rem 0 0;
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
    margin-top: 0.2rem;
  }

  .partner {
    margin: 0;
    font-size: 0.78rem;
  }

  .grading {
    flex-shrink: 0;
  }

  .pen {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    padding: 0.25rem 0.45rem;
    font-size: 0.9rem;
    line-height: 1;
    color: var(--faint);
    opacity: 0.5;
  }

  .pen:hover {
    opacity: 1;
    color: var(--text);
  }

  /* Editing needs room a card face doesn't have, so it replaces the card
     rather than living on one of its sides. */
  .editing {
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .flipper {
      transition: none;
    }
  }
</style>
