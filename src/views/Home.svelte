<script lang="ts">
  // Home as a board of decks.
  //
  // Five things you can pick up: Daily — today's scheduled work — plus the
  // four decks of the deck itself. Each is drawn as a stack of cards with its
  // counter and progress along the bottom, so "how far through am I" is the
  // same shape of answer everywhere on the screen.

  import { store, type View } from '../lib/store.svelte.ts'
  import { dayStart, formatDelay, maturityOf } from '../lib/srs.ts'
  import { newIntroducedToday } from '../lib/session.ts'
  import * as storage from '../lib/storage.ts'

  interface Props {
    onNavigate: (view: View) => void
  }

  const { onNavigate }: Props = $props()

  const counts = $derived(store.counts)
  const ready = $derived(counts.due + counts.fresh)

  const newDone = $derived(newIntroducedToday(store.log, store.settings, store.now))
  const newLimitReached = $derived(newDone >= store.settings.newPerDay)

  /** A review left half-finished, so the button says Resume rather than Start. */
  const inProgress = $derived.by(() => {
    void store.now
    void store.srs
    const saved = storage.loadSession()
    if (!saved || saved.mode !== 'review') return null
    if (saved.day !== dayStart(store.now, store.settings.dayStartHour)) return null
    return saved.queue.length ? saved : null
  })

  /** Daily's own progress: how much of today's workload is behind you. */
  const dailyDone = $derived(newDone + store.log.filter((l) => l.at >= dayStart(store.now, store.settings.dayStartHour)).length)
  const dailyTotal = $derived(dailyDone + ready)

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

  function openDeck(id: string) {
    store.deckFilter.category = id
    store.deckFilter.subcategory = ''
    store.deckFilter.query = ''
    onNavigate('deck')
  }

  const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
</script>

<section class="board">
  <article class="deck daily">
    <span class="label">Daily</span>

    <div class="numbers">
      <div class="stat">
        <span class="value">{counts.due}</span>
        <span class="key">to review</span>
      </div>
      <div class="stat">
        <span class="value">{counts.fresh}</span>
        <span class="key">new today</span>
      </div>
    </div>

    <button
      class="primary start"
      onclick={() => onNavigate('review')}
      disabled={ready === 0 && !inProgress}
    >
      {#if inProgress}
        Resume · {inProgress.queue.length}
      {:else if ready === 0}
        All caught up
      {:else}
        Start review · {ready}
      {/if}
    </button>

    <p class="note">
      {#if inProgress}
        {inProgress.answered} card{inProgress.answered === 1 ? '' : 's'} in so far.
      {:else if ready === 0 && counts.later > 0}
        {counts.later} card{counts.later === 1 ? '' : 's'} coming back
        {#if counts.nextAt}in {formatDelay(counts.nextAt - store.now)}{/if}
      {:else if ready === 0 && newLimitReached}
        Today's {store.settings.newPerDay} new cards are done.
      {:else if ready === 0}
        Nothing scheduled right now.
      {:else}
        {counts.due} scheduled, {counts.fresh} you haven't seen.
      {/if}
    </p>

    <footer>
      <span class="count">{dailyDone} / {dailyTotal || dailyDone}</span>
      <div class="bar"><div class="fill" style:width="{pct(dailyDone, dailyTotal)}%"></div></div>
    </footer>
  </article>

  {#each decks as deck (deck.id)}
    <button class="deck" onclick={() => openDeck(deck.id)}>
      <span class="label">{deck.label}</span>
      <span class="grow"></span>
      <footer>
        <span class="count">{deck.known} / {deck.total}</span>
        <div class="bar"><div class="fill" style:width="{pct(deck.known, deck.total)}%"></div></div>
      </footer>
    </button>
  {/each}
</section>

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    /* Room to the right and below for the stacked edges to show. */
    gap: 1.4rem 1.5rem;
    padding-bottom: 0.75rem;
  }

  /*
   * The stack: two cards peeking out below and to the right.
   *
   * Each layer is drawn as a fill plus a hairline one pixel larger, because on
   * a dark background a fill alone is nearly the same tone as everything else
   * and the edges disappear. The outline is what makes it read as paper.
   *
   * Done with box-shadow rather than real elements: no extra nodes, and it
   * never participates in layout.
   */
  .deck {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow:
      6px 6px 0 0 var(--divider),
      6px 6px 0 -1px var(--stack-1),
      12px 12px 0 0 var(--divider),
      12px 12px 0 -1px var(--stack-2);
    padding: 1rem 1.1rem 0.9rem;
    min-height: 140px;
    text-align: left;
    font: inherit;
    color: inherit;
    transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
  }

  /* Slides toward the stack, as if the top card is being drawn off it. */
  .deck:not(.daily):hover {
    transform: translate(3px, 3px);
    background: var(--surface-2);
    box-shadow:
      3px 3px 0 0 var(--divider),
      3px 3px 0 -1px var(--stack-1),
      7px 7px 0 0 var(--divider),
      7px 7px 0 -1px var(--stack-2);
  }

  .deck:not(.daily):active {
    transform: translate(6px, 6px);
    box-shadow:
      2px 2px 0 0 var(--divider),
      2px 2px 0 -1px var(--stack-2);
  }

  .daily {
    grid-column: 1 / -1;
    min-height: auto;
    gap: 0.9rem;
  }

  .label {
    font-size: 0.95rem;
    font-weight: 500;
  }

  .daily .label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
  }

  .grow {
    flex: 1;
  }

  .numbers {
    display: flex;
    gap: 2.5rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
  }

  .value {
    font-size: 2.6rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .key {
    font-size: 0.75rem;
    color: var(--muted);
    margin-top: 0.2rem;
  }

  .start {
    padding: 0.8rem;
    font-size: 0.95rem;
  }

  .note {
    margin: -0.35rem 0 0;
    font-size: 0.82rem;
    color: var(--muted);
    min-height: 1.2em;
  }

  /* Counter and bar sit on the bottom edge of every card, Daily included, so
     the same question is answered in the same place five times. */
  footer {
    margin-top: auto;
    padding-top: 0.7rem;
  }

  .count {
    font-size: 0.78rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 3px;
    margin-top: 0.35rem;
    background: var(--surface-3);
    border-radius: 999px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  @media (max-width: 480px) {
    .board {
      grid-template-columns: minmax(0, 1fr);
    }

    .numbers {
      gap: 2rem;
    }
  }
</style>
