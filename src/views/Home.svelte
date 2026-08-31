<script lang="ts">
  // Home as a hand of cards: 日本語 plus every category, on a grid.
  //
  // Every card is the same size and the same shape, 日本語 included — it is one
  // of the hand, not a banner above them. Tapping a card studies it: 日本語
  // starts today's scheduled review, the others drill that deck. So there is
  // no button anywhere on this screen; the cards *are* the buttons.

  import { tick } from 'svelte'
  import { store, type View } from '../lib/store.svelte.ts'
  import { dayStart, formatDelay } from '../lib/srs.ts'
  import { MORPH, morph } from '../lib/transition.ts'
  import Heatmap from '../components/Heatmap.svelte'
  import * as storage from '../lib/storage.ts'

  interface Props {
    onNavigate: (view: View) => void
  }

  const { onNavigate }: Props = $props()

  const counts = $derived(store.counts)
  const ready = $derived(counts.due + counts.fresh)

  /** A review left half-finished, so the card says Resume rather than Start. */
  const inProgress = $derived.by(() => {
    void store.now
    void store.srs
    const saved = storage.loadSession()
    if (!saved || saved.mode !== 'review') return null
    if (saved.day !== dayStart(store.now, store.settings.dayStartHour)) return null
    return saved.queue.length ? saved : null
  })

  const decks = $derived(
    store.dataset.categories.map((cat) => ({
      ...cat,
      total: store.cards.filter((c) => c.entry.category === cat.id).length,
    })),
  )

  /** Every card in the dataset — the size of the deck 日本語 stands for. */
  const allCards = $derived(store.cards.length)

  /**
   * Picking up a deck means studying it — opening a list to then press another
   * button assumes you came here to look, and you came here to practise. The
   * Deck view is still where you browse, search and edit.
   *
   * Claim the shared transition name for the tapped card, let that land in the
   * DOM, then swap views inside a transition — the browser matches the card
   * against the flashcard and grows one into the other.
   *
   * The name has to be applied *before* the transition starts, because the
   * "before" snapshot is taken the moment startViewTransition is called.
   */
  async function open(id: string, go: () => void) {
    store.morphing = id
    // Remembered for the way back: leaving the session shrinks the card into
    // this same deck.
    store.studySource = id
    await tick()
    await morph(go)
    store.morphing = null
  }

  const studyDeck = (id: string) =>
    open(id, () =>
      store.startPractice(
        {
          categories: [id],
          subcategories: [],
          limit: store.deckFilter.limit,
          writeThrough: false,
        },
        'home',
      ),
    )

  const startDaily = () => open('daily', () => onNavigate('review'))

  /**
   * `日本語・にほんご`, the same shape as a card front. The dataset names the
   * whole subject; without one the Daily card falls back to the UI's own word,
   * which is the only name the app can honestly give it.
   */
  const subject = $derived(store.dataset.subject)

  /** The footer doubles as the way in to "did I turn up?". */
  let showStreak = $state(false)

  /**
   * The run you just finished, if you have just finished one.
   *
   * It reports itself here because the card that used to carry this went home
   * — the tally came with it. Cleared when Home goes away, so it is what you
   * see on landing and not a stale figure you meet again tomorrow.
   */
  const run = $derived(store.lastRun)
  $effect(() => () => (store.lastRun = null))

</script>

<section class="hand">
  <!-- Daily leads: it is the one you are meant to pick up first. -->
  <button
    class="card daily"
    class:spent={ready === 0 && !inProgress}
    class:hushed={store.morphHidden && store.morphing === 'daily'}
    style:view-transition-name={store.morphing === 'daily' ? MORPH : 'none'}
    onclick={startDaily}
    disabled={ready === 0 && !inProgress}
  >
    <div class="body"></div>

    <footer>
      <div class="title">
        {#if subject}
          <span class="jp target">
            {subject.target}{subject.reading ? `・${subject.reading}` : ''}
          </span>
          <span class="name">{subject.native} <span class="count">{allCards}</span></span>
        {:else}
          <span class="name solo">Daily <span class="count">{allCards}</span></span>
        {/if}
      </div>
    </footer>
  </button>

  {#each decks as deck (deck.id)}
    <!-- A deck declared but not yet filled shows its name and nothing to do:
         tapping it would open a session with an empty queue, which reads as a
         fault rather than as "there is nothing in here yet". -->
    <button
      class="card"
      class:spent={deck.total === 0}
      class:hushed={store.morphHidden && store.morphing === deck.id}
      style:view-transition-name={store.morphing === deck.id ? MORPH : 'none'}
      onclick={() => studyDeck(deck.id)}
      disabled={deck.total === 0}
    >
      <div class="body"></div>
      <!--
        Two lines in the bottom-left corner, the way a spine carries a title.
        The Japanese leads and the Spanish glosses it underneath — the same
        order as the flashcards, so the deck reads as the thing it contains.
      -->
      <footer>
        <div class="title">
          {#if deck.targetLabel}
            <span class="jp target">
              {deck.targetLabel}{deck.targetReading ? `・${deck.targetReading}` : ''}
            </span>
          {/if}
          <span class="name" class:solo={!deck.targetLabel}>
            {deck.label} <span class="count">{deck.total}</span>
          </span>
        </div>
      </footer>
    </button>
  {/each}
</section>

<!--
  Today's state, on the bottom edge where a session keeps its own count — so
  the line you read before opening a card and the line you read inside one sit
  in the same place and say the same kind of thing. It is not on the 日本語
  card because those numbers describe the day, not that deck: the four
  category decks all feed the same queue.
-->
<button class="page-status" onclick={() => (showStreak = true)} title="Your streak">
  {#if run}
    <span class="n">{run.correct}</span> / <span class="n">{run.answered}</span>
    · {run.counted ? 'answers counted' : 'practice only'}
  {:else if inProgress}
    <span class="n">{inProgress.queue.length}</span> left in today's review
  {:else if ready > 0}
    <span class="n">{counts.due}</span> review · <span class="n">{counts.fresh}</span> new
  {:else if counts.later > 0 && counts.nextAt}
    nothing due · back in {formatDelay(counts.nextAt - store.now)}
  {:else}
    all caught up
  {/if}
</button>

{#if showStreak}
  <Heatmap onClose={() => (showStreak = false)} />
{/if}

<style>
  /*
   * Three across, wrapping to two on a phone. Everything stays on screen —
   * a sideways scroll hides cards behind an edge, and a deck you can't see is
   * a deck you don't study.
   */
  .hand {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    /* Centred in what's left below the header, matching the card in a session.
       `auto` margins rather than fixed centring, because six cards two-up on a
       phone are taller than the screen and must be allowed to run past it
       rather than being clipped around a midpoint. */
    margin: auto 0;
    /* Clears the fixed status line below. */
    padding-bottom: 2.5rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    aspect-ratio: 3 / 4;
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--card-border);
    padding: 1.1rem 1rem 0.9rem;
    text-align: left;
    font: inherit;
    color: inherit;
    transition: transform 0.12s ease, background 0.12s ease;
  }

  /* The lift is the affordance. The tint is a whisper under it, and the border
     stays exactly as it was — a card acquiring an outline because the mouse
     passed over it is the shape changing, not the state. */
  /*
   * The lift is the affordance. The tint is a whisper under it, and the border
   * stays exactly as it was — a card acquiring an outline because the mouse
   * passed over it is the shape changing, not the state.
   *
   * The tint is *layered* over the surface, not mixed with it. --fill-hover is
   * translucent by design so it works on any background, and color-mix() with
   * a translucent colour averages the alphas too: mixed, the card went half
   * transparent and the page showed through it.
   */
  .card:hover:not(:disabled) {
    background: linear-gradient(var(--fill-hover), var(--fill-hover)), var(--surface);
    border-color: var(--card-border);
    transform: translateY(-3px);
  }

  .card:active:not(:disabled) {
    transform: translateY(-1px);
  }

  .card:disabled {
    opacity: 1;
    cursor: default;
  }

  /* Clips rather than overflows: the names are held on one line, and a very
     narrow phone should lose the tail of a reading, not push the card wide. */
  .title {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  /* Reading and word on one line, as on a card front. Sized to fit the
     longest of them — 表現・ひょうげん — inside the narrowest column. */
  .target {
    font-size: clamp(0.82rem, 3.6vw, 1rem);
    line-height: 1.25;
    color: var(--text);
    white-space: nowrap;
  }

  /* The gloss under the Japanese, so it steps back the way it does on a card. */
  .name {
    font-size: 0.78rem;
    line-height: 1.3;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  /* A deck with only one name gives it the leading line rather than the gloss
     line, so it isn't quietly demoted for lacking a translation. */
  .name.solo {
    font-size: 1.05rem;
    line-height: 1.25;
    color: var(--text);
  }

  /* Holds the middle open so every footer sits on the same line across the
     row, whether the card has content in the middle or not. */
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 0;
    text-align: center;
  }

  /* A deck with nothing to study can't be tapped, so it shouldn't look as
     ready as the ones that can. */
  .spent .title {
    opacity: 0.45;
  }

  /* The title is the deck's contents; it clears off so the shape can travel
     without it, and comes back once the shape has arrived. */
  .card > :global(*) {
    transition: opacity var(--morph-fade) ease;
  }

  .card.hushed > :global(*) {
    opacity: 0;
  }

  footer {
    margin-top: auto;
  }

  /*
   * How big the deck is, not how much of it is done — the deck grows every
   * week, so there is no completion to chart. It rides on the gloss line as an
   * annotation rather than taking a line of its own, which is all it is worth.
   */
  .count {
    color: var(--faint);
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
  }

  @media (max-width: 620px) {
    .hand {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .card {
      padding: 0.8rem 0.7rem 0.65rem;
    }

    .name.solo {
      font-size: 0.95rem;
    }
  }
</style>
