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
    // Re-read whenever the clock ticks or an answer lands.
    void store.now
    void store.srs
    const saved = storage.loadSession()
    if (!saved || saved.mode !== 'review') return null
    if (saved.day !== dayStart(store.now, store.settings.dayStartHour)) return null
    return saved.queue.length ? saved : null
  })

  const perCategory = $derived.by(() => {
    const cutoff = dayEnd(store.now, store.settings.dayStartHour)
    return store.dataset.categories.map((cat) => {
      const cards = store.cards.filter((c) => c.entry.category === cat.id)
      return {
        ...cat,
        total: cards.length,
        due: cards.filter((c) => c.state.stage !== 'new' && c.state.due < cutoff).length,
        fresh: cards.filter((c) => c.state.stage === 'new').length,
      }
    })
  })

  const learned = $derived(
    store.cards.filter((c) => {
      const m = maturityOf(c.state, store.settings)
      return m === 'young' || m === 'mature'
    }).length,
  )

  const leeches = $derived(
    store.cards.filter((c) => maturityOf(c.state, store.settings) === 'leech').length,
  )
</script>

<section class="stack">
  <div class="hero card-surface">
    <div class="numbers">
      <div class="stat">
        <span class="value due">{counts.due}</span>
        <span class="key">due</span>
      </div>
      <div class="stat">
        <span class="value fresh">{counts.fresh}</span>
        <span class="key">new</span>
      </div>
      <div class="stat">
        <span class="value">{learned}</span>
        <span class="key">learned</span>
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

    {#if inProgress}
      <p class="muted note">
        You're {inProgress.answered} card{inProgress.answered === 1 ? '' : 's'} into this session.
      </p>
    {:else if ready === 0 && counts.later > 0}
      <!-- Finished, but cards are still walking their learning steps. Saying
           "all caught up" here would be a lie, and offering another batch of
           new cards was the old bug. -->
      <p class="muted note">
        Done for now. {counts.later} card{counts.later === 1 ? '' : 's'} in learning
        {#if counts.nextAt}· next in {formatDelay(counts.nextAt - store.now)}{/if}
      </p>
    {:else if ready === 0}
      <p class="muted note">
        {newLimitReached
          ? `Today's ${store.settings.newPerDay} new cards are done. More tomorrow — or use free practice now.`
          : 'Nothing is scheduled right now. Free practice lets you drill any category without touching the schedule.'}
      </p>
    {/if}
  </div>

  <div class="quick row wrap">
    <button onclick={() => onNavigate('practice')}>Free practice</button>
    <button onclick={() => onNavigate('add')}>Add words</button>
    <button onclick={() => onNavigate('browse')}>Browse {store.dataset.entries.length}</button>
    {#if leeches > 0}
      <button class="leech" onclick={() => onNavigate('practice')}>
        {leeches} leech{leeches === 1 ? '' : 'es'}
      </button>
    {/if}
  </div>

  <div class="categories card-surface divide">
    {#each perCategory as cat (cat.id)}
      <div class="cat">
        <span class="name">{cat.label}</span>
        <span class="spacer"></span>
        {#if cat.due > 0}<span class="tag due">{cat.due} due</span>{/if}
        {#if cat.fresh > 0}<span class="tag fresh">{cat.fresh} new</span>{/if}
        <span class="tag total faint">{cat.total}</span>
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
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .start {
    padding: 0.85rem;
    font-size: 1rem;
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    text-align: center;
  }

  .quick button.leech {
    color: var(--again);
    background: color-mix(in srgb, var(--again) 14%, transparent);
  }

  .categories {
    padding: 0.35rem 0;
  }

  .cat {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.7rem 1rem;
  }

  .name {
    font-weight: 500;
  }

  .tag {
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }

  .tag.due {
    color: var(--good);
  }

  .tag.fresh {
    color: var(--easy);
  }

  .tag.total {
    min-width: 2.5rem;
    text-align: right;
  }
</style>
