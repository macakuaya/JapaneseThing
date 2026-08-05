<script lang="ts">
  import type { Card } from '../lib/session.ts'
  import type { WordEntry } from '../lib/types.ts'
  import { cardFront, splitSlashLines } from '../lib/text.ts'
  import { store } from '../lib/store.svelte.ts'
  import JapaneseText from './JapaneseText.svelte'
  import EntryEditor from './EntryEditor.svelte'

  interface Props {
    card: Card
    revealed: boolean
  }

  const { card, revealed }: Props = $props()

  const entry = $derived(card.entry)

  let editing = $state(false)

  // 'revealed' keeps the question side clean so you can still test yourself on
  // the reading; the answer side confirms it.
  const showFurigana = $derived(
    store.settings.furigana === 'always' ||
      (store.settings.furigana === 'revealed' && revealed),
  )
  const interactive = $derived(store.settings.lookup)

  /**
   * What this card is already teaching. Words from it get no tooltip in the
   * example — on 〜より〜のほうが〜です, glossing より explains the card back
   * to you, and buries 涼しい, which is the word you might actually not know.
   */
  const taught = $derived(
    entry.kind === 'pattern'
      ? entry.pattern
      : `${entry.kanji ?? ''}${entry.kana}`,
  )

  // Recognition shows the Japanese and asks for the meaning; production is the
  // mirror image. The front/back split is the only thing direction changes.
  const front = $derived(
    card.direction === 'recognition' ? cardFront(entry) : entry.meaning,
  )
  const frontIsJapanese = $derived(card.direction === 'recognition')

  // The other half of a transitive/intransitive pair, shown on the back so the
  // contrast stays visible without merging them into one card.
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

<article class="flashcard card-surface" class:editing>
  {#if editing}
    <EntryEditor {entry} onDone={() => (editing = false)} />
  {:else}
    <!-- Always available, on both sides: no importer or dictionary heuristic
         gets every card right, so correcting one has to be one click away. -->
    <button
      class="ghost pen"
      onclick={() => (editing = true)}
      title="Edit this card"
      aria-label="Edit this card">✎</button
    >

  <!-- The question owns a fixed-height band of its own. Centring it in the
       card meant revealing the answer made the card taller and shunted the
       question upward — you look away to read, and it has moved. -->
  <div class="question">
    <!-- No lookup on the front: it already prints kanji・kana, and the back
         gives the meaning, so a tooltip here would only repeat the card. -->
    <div class="face front" class:jp={frontIsJapanese}>
      {#each splitSlashLines(front) as line (line)}
        <div class="line">{line}</div>
      {/each}
    </div>
  </div>

  {#if revealed}
    <hr />
    <div class="face back">
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
    {/if}
  {/if}
</article>

<style>
  /* The other half of the morph: the Home card that was tapped carries this
     same name, so the browser treats the two as one element growing. */
  .flashcard {
    view-transition-name: card-morph;
    position: relative;
    padding: 2rem 1.25rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    /* Content stacks from the top so that revealing the answer only ever adds
       height below the question, never repositions it. */
    justify-content: flex-start;
  }

  /* Constant height whether or not the answer is showing. The question is
     centred within this band, so it sits in the same place on every card and
     on both sides of the flip. */
  .question {
    min-height: 190px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: stretch;
  }

  .flashcard.editing {
    justify-content: flex-start;
    text-align: left;
  }

  /* Quiet until wanted: visible enough to find, faint enough not to compete
     with the card itself. */
  .pen {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    padding: 0.25rem 0.45rem;
    font-size: 0.95rem;
    line-height: 1;
    color: var(--faint);
    opacity: 0.55;
  }

  .pen:hover {
    opacity: 1;
    color: var(--text);
  }

  .face {
    overflow-wrap: anywhere;
  }

  /* A slash in the source means "or, alternatively"; each alternative gets its
     own line rather than wrapping into an unreadable run-on. */
  .line {
    display: block;
  }

  .front {
    font-size: clamp(1.75rem, 7vw, 2.75rem);
  }

  /* Meanings are prose, not display text — don't blow them up like the kanji. */
  .front:not(.jp) {
    font-size: clamp(1.25rem, 4.5vw, 1.75rem);
    color: var(--text);
  }

  /* The question/answer split — a genuine division, so it keeps its rule. */
  hr {
    width: 100%;
    border: none;
    border-top: 1px solid var(--divider);
    margin: 1.5rem 0;
  }

  .meaning {
    margin: 0;
    font-size: 1.35rem;
  }

  .meaning.big {
    font-size: clamp(1.75rem, 7vw, 2.5rem);
  }

  .note {
    margin: 0.35rem 0 0;
    font-size: 0.78rem;
    color: var(--faint);
    text-transform: lowercase;
    letter-spacing: 0.04em;
  }

  .example {
    margin-top: 1.5rem;
  }

  .example p {
    margin: 0;
  }

  .example .jp {
    font-size: 1.2rem;
  }

  .example .muted {
    font-size: 0.95rem;
    margin-top: 0.2rem;
  }

  .partner {
    margin: 1.25rem 0 0;
    font-size: 0.85rem;
  }
</style>
