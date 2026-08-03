<script lang="ts">
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

  const newLimitReached = $derived(
    newIntroducedToday(store.log, store.settings, store.now) >= store.settings.newPerDay,
  )

  /**
   * A review left half-finished. Shown as "Resume" so it's obvious the queue
   * is being picked up rather than rebuilt.
   */
  const inProgress = $derived.by(() => {
    void store.now
    void store.srs
    const saved = storage.loadSession()
    if (!saved || saved.mode !== 'review') return null
    if (saved.day !== dayStart(store.now, store.settings.dayStartHour)) return null
    return saved.queue.length ? saved : null
  })

  const learned = $derived(
    store.cards.filter((c) => {
      const m = maturityOf(c.state, store.settings)
      return m === 'young' || m === 'mature'
    }).length,
  )

  /**
   * Read-only. Home answers "what do I do now?"; choosing what to study is
   * the Deck view's job, and having both navigate there was the duplication
   * this screen used to carry. What survives is the glance — the only place
   * in the app that shows how much of each deck you actually know.
   */
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
</script>

<section class="stack">
  <div class="hero card-surface">
    <!-- Labels say what the number is for, rather than naming an SRS concept.
         "DUE / NEW / LEARNED" meant nothing without knowing the algorithm. -->
    <div class="numbers">
      <div class="stat">
        <span class="value due">{counts.due}</span>
        <span class="key">to review</span>
      </div>
      <div class="stat">
        <span class="value fresh">{counts.fresh}</span>
        <span class="key">new today</span>
      </div>
      <div class="stat">
        <span class="value">{learned}</span>
        <span class="key">learned <span class="faint">of {store.dataset.entries.length}</span></span>
      </div>
    </div>

    <button
      class="primary start"
      onclick={() => onNavigate('review')}
      disabled={ready === 0 && !inProgress}
    >
      {#if inProgress}
        Resume review · {inProgress.queue.length}
      {:else if ready === 0}
        All caught up
      {:else}
        Start review · {ready}
      {/if}
    </button>

    <p class="muted note">
      {#if inProgress}
        You're {inProgress.answered} card{inProgress.answered === 1 ? '' : 's'} into this session.
      {:else if ready === 0 && counts.later > 0}
        Done for now. {counts.later} card{counts.later === 1 ? '' : 's'} coming back
        {#if counts.nextAt}in {formatDelay(counts.nextAt - store.now)}{/if}
      {:else if ready === 0 && newLimitReached}
        Today's {store.settings.newPerDay} new cards are done. More tomorrow — or open
        <button class="link" onclick={() => onNavigate('deck')}>Deck</button> to drill anything.
      {:else if ready === 0}
        Nothing scheduled. Open
        <button class="link" onclick={() => onNavigate('deck')}>Deck</button> to drill any part of
        it without affecting your schedule.
      {:else}
        <span class="faint">
          {counts.due} scheduled for today, {counts.fresh} you haven't seen before.
        </span>
      {/if}
    </p>
  </div>

  <div class="decks card-surface">
    {#each decks as deck (deck.id)}
      <div class="deck">
        <span class="name">{deck.label}</span>
        <span class="spacer"></span>
        <span class="known">{deck.known} / {deck.total}</span>
        <div class="bar" aria-hidden="true">
          <div class="fill" style:width="{deck.total ? (deck.known / deck.total) * 100 : 0}%"></div>
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  .hero {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .numbers {
    display: flex;
    justify-content: space-around;
    text-align: center;
  }

  .stat {
    display: flex;
    flex-direction: column;
  }

  .value {
    font-size: 2.5rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .value.due {
    color: var(--good);
  }

  .value.fresh {
    color: var(--easy);
  }

  .key {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .start {
    padding: 0.85rem;
    font-size: 1rem;
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    text-align: center;
    min-height: 1.2em;
  }

  /* An inline word in a sentence, not a control sitting on its own. */
  .link {
    background: none;
    padding: 0;
    font: inherit;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .link:hover {
    background: none;
    filter: brightness(1.15);
  }

  .decks {
    padding: 0.9rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  /* Name and count on one line, the bar tucked underneath it. Nothing here
     is interactive, so no hover, no cursor, no affordance to mislead. */
  .deck {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 0 0.5rem;
  }

  .name {
    font-size: 0.9rem;
  }

  .known {
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  /* How much of the deck has reached a real interval — progress, not workload. */
  .bar {
    grid-column: 1 / -1;
    height: 3px;
    margin-top: 0.3rem;
    background: var(--surface-2);
    border-radius: 999px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }
</style>
