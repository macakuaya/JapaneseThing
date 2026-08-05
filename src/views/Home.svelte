<script lang="ts">
  // Home as a hand of cards: five portrait decks on a grid.
  //
  // Every card is the same size and the same shape, Daily included — it is one
  // of the five, not a banner above them. Tapping a card studies it: Daily
  // starts today's scheduled review, the others drill that deck. So there is
  // no button anywhere on this screen; the cards *are* the buttons.

  import { tick } from 'svelte'
  import { store, type View } from '../lib/store.svelte.ts'
  import { dayStart, formatDelay, maturityOf } from '../lib/srs.ts'
  import { MORPH, withViewTransition } from '../lib/transition.ts'
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

  /** Daily's own progress: how much of today's workload is behind you. */
  const answeredToday = $derived(
    store.log.filter((l) => l.at >= dayStart(store.now, store.settings.dayStartHour)).length,
  )
  const dailyTotal = $derived(answeredToday + ready)

  const decks = $derived(
    store.dataset.categories.map((cat) => {
      const cards = store.cards.filter((c) => c.entry.category === cat.id)
      const known = cards.filter((c) => {
        const m = maturityOf(c.state, store.settings)
        return m === 'young' || m === 'mature'
      }).length
      return { ...cat, total: cards.length, known }
    }),
  )

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
    await withViewTransition(go)
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

  const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)

  /**
   * `日本語・にほんご`, the same shape as a card front. The dataset names the
   * whole subject; without one the Daily card falls back to the UI's own word,
   * which is the only name the app can honestly give it.
   */
  const subject = $derived(store.dataset.subject)

  const dailyCaption = $derived(
    inProgress
      ? `${inProgress.queue.length} left`
      : ready > 0
        ? 'tap to start'
        : counts.later > 0 && counts.nextAt
          ? `back in ${formatDelay(counts.nextAt - store.now)}`
          : 'all caught up',
  )
</script>

<section class="hand">
  <!-- Daily leads: it is the one you are meant to pick up first. -->
  <button
    class="card daily"
    class:spent={ready === 0 && !inProgress}
    style:view-transition-name={store.morphing === 'daily' ? MORPH : 'none'}
    onclick={startDaily}
    disabled={ready === 0 && !inProgress}
  >
    <div class="body">
      <div class="pair">
        <div class="stat">
          <span class="value">{counts.due}</span>
          <span class="tag">review</span>
        </div>
        <div class="stat">
          <span class="value">{counts.fresh}</span>
          <span class="tag">new</span>
        </div>
      </div>
      <span class="caption">{dailyCaption}</span>
    </div>

    <footer>
      <div class="title">
        {#if subject}
          <span class="jp target">
            {subject.target}{subject.reading ? `・${subject.reading}` : ''}
          </span>
          <span class="name">{subject.native}</span>
        {:else}
          <span class="name solo">Daily</span>
        {/if}
      </div>
      <div class="rule"><div class="fill" style:width="{pct(answeredToday, dailyTotal)}%"></div></div>
      <span class="count">{answeredToday} / {dailyTotal || answeredToday}</span>
    </footer>
  </button>

  {#each decks as deck (deck.id)}
    <button
      class="card"
      style:view-transition-name={store.morphing === deck.id ? MORPH : 'none'}
      onclick={() => studyDeck(deck.id)}
    >
      <div class="body"></div>
      <!--
        Name, rule and count are one block in the bottom-left corner, the way
        a spine carries a title. The Japanese leads and the Spanish glosses it
        underneath — the same order as the flashcards, so the deck reads as
        the thing it contains.
      -->
      <footer>
        <div class="title">
          {#if deck.targetLabel}
            <span class="jp target">
              {deck.targetLabel}{deck.targetReading ? `・${deck.targetReading}` : ''}
            </span>
          {/if}
          <span class="name" class:solo={!deck.targetLabel}>{deck.label}</span>
        </div>
        <div class="rule"><div class="fill" style:width="{pct(deck.known, deck.total)}%"></div></div>
        <span class="count">{deck.known} / {deck.total}</span>
      </footer>
    </button>
  {/each}
</section>

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
    padding-bottom: 0.5rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    aspect-ratio: 3 / 4;
    background: var(--surface);
    border-radius: var(--radius);
    padding: 1.1rem 1rem 0.9rem;
    text-align: left;
    font: inherit;
    color: inherit;
    transition: transform 0.12s ease, background 0.12s ease;
  }

  .card:hover:not(:disabled) {
    background: var(--surface-2);
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
    margin-bottom: 0.5rem;
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

  .pair {
    display: flex;
    gap: 1.4rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
    line-height: 1;
  }

  .value {
    font-size: 2.2rem;
    font-variant-numeric: tabular-nums;
  }

  .tag {
    font-size: 0.68rem;
    color: var(--faint);
    margin-top: 0.2rem;
  }

  .caption {
    font-size: 0.72rem;
    color: var(--muted);
  }

  .spent .value {
    color: var(--faint);
  }

  /* The rule under which the count sits doubles as the progress track, so the
     line in the sketch earns its place instead of being decoration. */
  footer {
    margin-top: auto;
  }

  .rule {
    height: 2px;
    background: var(--surface-3);
    border-radius: 999px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  /* Tucked tight under the bar and aligned to it, so the two read as one
     object — the bar and the number it belongs to — rather than as a rule
     with a caption floating beneath it. */
  .count {
    display: block;
    margin-top: 0.3rem;
    font-size: 0.78rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  @media (max-width: 620px) {
    .hand {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .card {
      padding: 0.8rem 0.7rem 0.65rem;
    }

    .value {
      font-size: 1.8rem;
    }

    .name.solo {
      font-size: 0.95rem;
    }
  }
</style>
