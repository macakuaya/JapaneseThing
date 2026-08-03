<script lang="ts">
  import { store, type View } from '../lib/store.svelte.ts'
  import { dayEnd, dayStart, formatDelay, maturityOf } from '../lib/srs.ts'
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

  /** Which deck rows are expanded to show their subcategories. */
  let expanded = $state<string[]>([])

  const toggle = (id: string) =>
    (expanded = expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id])

  const decks = $derived.by(() => {
    const cutoff = dayEnd(store.now, store.settings.dayStartHour)
    return store.dataset.categories.map((cat) => {
      const cards = store.cards.filter((c) => c.entry.category === cat.id)
      const known = cards.filter((c) => {
        const m = maturityOf(c.state, store.settings)
        return m === 'young' || m === 'mature'
      }).length
      return {
        ...cat,
        total: cards.length,
        known,
        due: cards.filter((c) => c.state.stage !== 'new' && c.state.due < cutoff).length,
        subs: (store.subcategoriesOf.get(cat.id) ?? []).map((sub) => {
          const inSub = cards.filter((c) => c.entry.subcategory === sub)
          return {
            name: sub,
            total: inSub.length,
            known: inSub.filter((c) => {
              const m = maturityOf(c.state, store.settings)
              return m === 'young' || m === 'mature'
            }).length,
          }
        }),
      }
    })
  })
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
        Today's {store.settings.newPerDay} new cards are done. More tomorrow — or drill a deck below.
      {:else if ready === 0}
        Nothing scheduled. Tap a deck below to drill it without affecting your schedule.
      {:else}
        <span class="faint">
          {counts.due} scheduled for today, {counts.fresh} you haven't seen before.
        </span>
      {/if}
    </p>
  </div>

  <div class="decks card-surface divide">
    {#each decks as deck (deck.id)}
      <div class="deck">
        <div class="deck-row">
          <!-- Tapping the deck drills it. This was the only thing the row
               could usefully do, and previously it did nothing at all. -->
          <button class="deck-main" onclick={() => store.startPractice([deck.id])}>
            <span class="name">{deck.label}</span>
            <span class="spacer"></span>
            {#if deck.due > 0}<span class="tag due">{deck.due} due</span>{/if}
            <span class="tag known">{deck.known} / {deck.total}</span>
          </button>

          {#if deck.subs.length}
            <button
              class="chevron ghost"
              onclick={() => toggle(deck.id)}
              aria-expanded={expanded.includes(deck.id)}
              aria-label="{expanded.includes(deck.id) ? 'Hide' : 'Show'} {deck.label} subcategories"
            >
              {expanded.includes(deck.id) ? '▾' : '▸'}
            </button>
          {/if}
        </div>

        <div class="bar" aria-hidden="true">
          <div class="fill" style:width="{deck.total ? (deck.known / deck.total) * 100 : 0}%"></div>
        </div>

        {#if expanded.includes(deck.id)}
          <div class="subs">
            {#each deck.subs as sub (sub.name)}
              <button class="sub" onclick={() => store.startPractice([deck.id], [sub.name])}>
                <span class="sub-name">{sub.name}</span>
                <span class="spacer"></span>
                <span class="tag known">{sub.known} / {sub.total}</span>
              </button>
            {/each}
          </div>
        {/if}
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

  .decks {
    padding: 0.2rem 0;
  }

  .deck {
    padding: 0.5rem 0.5rem 0.6rem;
  }

  .deck-row {
    display: flex;
    align-items: center;
  }

  .deck-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    padding: 0.45rem 0.5rem;
    font: inherit;
    color: inherit;
    text-align: left;
  }

  .deck-main:hover {
    background: var(--surface-2);
  }

  .name {
    font-weight: 500;
  }

  .chevron {
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
    color: var(--faint);
  }

  .tag {
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }

  .tag.due {
    color: var(--good);
  }

  .tag.known {
    color: var(--muted);
  }

  /* How much of the deck has reached a real interval — the one number that
     shows progress rather than workload. */
  .bar {
    height: 2px;
    margin: 0 0.5rem;
    background: var(--surface-2);
    border-radius: 999px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  .subs {
    display: flex;
    flex-direction: column;
    margin-top: 0.35rem;
  }

  .sub {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    padding: 0.35rem 0.5rem 0.35rem 1.25rem;
    font: inherit;
    color: var(--muted);
    text-align: left;
    font-size: 0.88rem;
  }

  .sub:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .sub-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
