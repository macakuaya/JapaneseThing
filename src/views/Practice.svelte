<script lang="ts">
  import Session from './Session.svelte'
  import {
    type Filter,
    type SessionConfig,
    buildQueue,
    practiceConfig,
  } from '../lib/session.ts'
  import { store } from '../lib/store.svelte.ts'
  import { MATURITY_LABEL } from '../lib/srs.ts'
  import type { Maturity } from '../lib/types.ts'

  interface Props {
    onExit: () => void
  }

  const { onExit }: Props = $props()

  const MATURITIES: Maturity[] = ['new', 'learning', 'young', 'mature', 'leech']

  let categories = $state<string[]>([])
  let subcategories = $state<string[]>([])
  let maturity = $state<Maturity[]>([])
  let limit = $state(20)
  let countToward = $state(false)
  let started = $state(false)

  const filter = $derived<Filter>({ categories, subcategories, maturity })

  /** Only offer subcategories that belong to the selected categories. */
  const availableSubs = $derived.by(() => {
    const chosen = categories.length
      ? categories
      : store.dataset.categories.map((c) => c.id)
    const out: string[] = []
    for (const id of chosen) {
      for (const sub of store.subcategoriesOf.get(id) ?? []) {
        if (!out.includes(sub)) out.push(sub)
      }
    }
    return out
  })

  const matching = $derived(
    buildQueue(
      store.dataset,
      store.srs,
      store.settings,
      practiceConfig(filter, Number.MAX_SAFE_INTEGER),
      store.now,
      () => 0.5,
    ).length,
  )

  const config = $derived<SessionConfig>({
    ...practiceConfig(filter, limit),
    writeThrough: countToward,
  })

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  // Dropping a category must also drop any of its subcategories, or the filter
  // silently matches nothing.
  function toggleCategory(id: string) {
    categories = toggle(categories, id)
    const allowed = availableSubs
    subcategories = subcategories.filter((s) => allowed.includes(s))
  }

  function reset() {
    categories = []
    subcategories = []
    maturity = []
  }
</script>

{#if started}
  <Session {config} title="Practice" mode="practice" onExit={() => (started = false)} />
{:else}
  <section class="stack">
    <header class="row">
      <button class="ghost" onclick={onExit}>← Home</button>
    </header>

    <div class="card-surface panel">
      <h2>Free practice</h2>
      <p class="muted intro">
        Pick what you want to drill. Nothing here changes your review schedule
        {countToward ? '' : ' — this is separate from your daily reps'}.
      </p>

      <fieldset>
        <legend>Category</legend>
        <div class="chips">
          {#each store.dataset.categories as cat (cat.id)}
            <button
              class="chip"
              class:on={categories.includes(cat.id)}
              onclick={() => toggleCategory(cat.id)}
            >
              {cat.label}
            </button>
          {/each}
        </div>
      </fieldset>

      {#if availableSubs.length}
        <fieldset>
          <legend>Subcategory</legend>
          <div class="chips">
            {#each availableSubs as sub (sub)}
              <button
                class="chip small"
                class:on={subcategories.includes(sub)}
                onclick={() => (subcategories = toggle(subcategories, sub))}
              >
                {sub}
              </button>
            {/each}
          </div>
        </fieldset>
      {/if}

      <fieldset>
        <legend>How well you know it</legend>
        <div class="chips">
          {#each MATURITIES as m (m)}
            <button
              class="chip small"
              class:on={maturity.includes(m)}
              onclick={() => (maturity = toggle(maturity, m))}
            >
              {MATURITY_LABEL[m]}
            </button>
          {/each}
        </div>
      </fieldset>

      <div class="row wrap options">
        <div class="limit">
          <label for="limit">Cards</label>
          <input id="limit" type="number" min="1" max="500" bind:value={limit} />
        </div>
        <label class="check">
          <input type="checkbox" bind:checked={countToward} />
          Count toward scheduling
        </label>
      </div>

      <div class="row actions">
        <button class="ghost" onclick={reset} disabled={!categories.length && !subcategories.length && !maturity.length}>
          Clear filters
        </button>
        <span class="spacer"></span>
        <span class="muted count">{matching} match{matching === 1 ? '' : 'es'}</span>
        <button class="primary" onclick={() => (started = true)} disabled={matching === 0}>
          Start
        </button>
      </div>
    </div>
  </section>
{/if}

<style>
  .panel {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .intro {
    margin: 0;
    font-size: 0.88rem;
  }

  fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }

  legend {
    font-size: 0.78rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0 0 0.45rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip {
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    font-size: 0.87rem;
  }

  .chip.small {
    font-size: 0.8rem;
    padding: 0.28rem 0.6rem;
  }

  .chip.on {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }

  .options {
    gap: 1.25rem;
  }

  .limit {
    width: 90px;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 1.1rem 0 0;
    color: var(--text);
    font-size: 0.88rem;
  }

  .check input {
    width: auto;
  }

  /* Separated by space rather than a rule — the gap reads as "these are the
     actions" without adding another line to the panel. */
  .actions {
    padding-top: 0.5rem;
  }

  .count {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
</style>
