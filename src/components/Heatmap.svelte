<script lang="ts">
  // Did I turn up? — the one question this panel answers.
  //
  // Deliberately not a stats screen. No ranges to pick, no charts, no averages:
  // a streak, a count, and half a year of squares you can read in a second.
  // The point of a grid like this is the shape of it, and every control added
  // is something between you and that shape.

  import { X } from '@lucide/svelte'
  import Overlay from './Overlay.svelte'
  import { store } from '../lib/store.svelte.ts'
  import { heatmap, streaks } from '../lib/streak.ts'

  interface Props {
    onClose: () => void
  }

  const { onClose }: Props = $props()

  const stats = $derived(streaks(store.log, store.settings.dayStartHour, store.now))
  const grid = $derived(heatmap(store.log, store.settings.dayStartHour, store.now))

  const DAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

  const fmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' })

  /** Month labels, one per column, printed only where the month turns over. */
  const months = $derived(
    grid.map((week, i) => {
      const first = new Date(week[0].day)
      if (i === 0) return ''
      const previous = new Date(grid[i - 1][0].day)
      return first.getMonth() === previous.getMonth()
        ? ''
        : first.toLocaleDateString('en', { month: 'short' })
    }),
  )

  const label = (day: number, count: number) =>
    `${fmt.format(day)} — ${count === 0 ? 'nothing' : `${count} answer${count === 1 ? '' : 's'}`}`

</script>

<Overlay {onClose} anchor="bottom" label="Your streak">
  <div class="sheet popover">
    <header>
      <div class="figures">
        <div class="figure">
          <span class="value">{stats.current}</span>
          <span class="tag">day streak</span>
        </div>
        <div class="figure">
          <span class="value">{stats.longest}</span>
          <span class="tag">best</span>
        </div>
        <div class="figure">
          <span class="value">{stats.activeDays}</span>
          <span class="tag">days studied</span>
        </div>
        <div class="figure">
          <span class="value">{stats.total}</span>
          <span class="tag">answers</span>
        </div>
      </div>
      <button class="ghost icon" onclick={onClose} aria-label="Close"><X size={16} /></button>
    </header>

    <div class="grid-wrap scroll-x">
      <div class="months">
        {#each months as month, i (i)}
          <span>{month}</span>
        {/each}
      </div>

      <div class="body">
        <div class="weekdays">
          {#each DAYS as day, i (i)}
            <span>{day}</span>
          {/each}
        </div>

        <div class="grid">
          {#each grid as week, w (w)}
            <div class="week">
              {#each week as cell (cell.day)}
                <!-- A day that hasn't happened is absent, not skipped: drawing
                     the rest of this week as empty squares would read as five
                     days you missed. -->
                <span
                  class="cell l{cell.level}"
                  class:future={cell.future}
                  title={cell.future ? '' : label(cell.day, cell.count)}
                ></span>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>

    {#if stats.total === 0}
      <p class="empty muted">Nothing here yet. Answer a card and the first square lights up.</p>
    {/if}
  </div>
</Overlay>

<style>
  .sheet {
    width: min(520px, calc(100vw - 2rem));
    padding: 1.1rem 1.2rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .figures {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 1.4rem;
  }

  .figure {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }

  .value {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }

  .tag {
    font-size: 0.7rem;
    color: var(--faint);
    margin-top: 0.15rem;
  }

  /* Centred rather than left-aligned: half a year of squares is narrower than
     the figures above it, and hard against the left edge it read as clipped. */
  .grid-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-self: center;
    max-width: 100%;
  }

  .body {
    display: flex;
    gap: 0.35rem;
  }

  .weekdays {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.6rem;
    color: var(--faint);
  }

  .weekdays span {
    height: 12px;
    line-height: 12px;
  }

  .months {
    display: flex;
    gap: 3px;
    margin-left: calc(1.6rem + 0.35rem);
    font-size: 0.6rem;
    color: var(--faint);
  }

  .months span {
    width: 12px;
    white-space: nowrap;
  }

  .weekdays {
    width: 1.6rem;
  }

  .grid {
    display: flex;
    gap: 3px;
  }

  .week {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cell {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--surface-2);
  }

  /*
   * The one colour in the app that isn't grey, and it is earned: this is the
   * only screen whose subject is you rather than the deck.
   */
  .l1 {
    background: color-mix(in srgb, var(--heat) 30%, var(--surface-2));
  }
  .l2 {
    background: color-mix(in srgb, var(--heat) 55%, var(--surface-2));
  }
  .l3 {
    background: color-mix(in srgb, var(--heat) 78%, var(--surface-2));
  }
  .l4 {
    background: var(--heat);
  }

  .future {
    background: none;
  }

  .empty {
    margin: 0;
    font-size: 0.8rem;
  }

  @media (max-width: 520px) {
    .figures {
      gap: 1rem;
    }

    .value {
      font-size: 1.25rem;
    }
  }
</style>
