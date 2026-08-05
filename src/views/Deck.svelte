<script lang="ts">
  import { Play } from '@lucide/svelte'
  // The deck: browse it, filter it, drill it, edit it.
  //
  // This was two screens. Browse listed everything with a category dropdown;
  // Practice picked a category from chips and studied it. Those are the same
  // act — choosing a subset — done twice, and the chip version was worse
  // because you picked "Cocina" without seeing that it holds four cards.
  //
  // The rule here is that what you see is what you drill: search and the two
  // dropdowns narrow one list, and Drill studies exactly that list.

  import EntryEditor from '../components/EntryEditor.svelte'
  import { store } from '../lib/store.svelte.ts'
  import { cardFront } from '../lib/text.ts'
  import { MATURITY_LABEL, formatDelay, maturityOf } from '../lib/srs.ts'
  import type { Entry } from '../lib/types.ts'

  // Filter lives in the store so it survives leaving and returning.
  const f = store.deckFilter
  let editing = $state<string | null>(null)

  /** Deck labels carry their own progress, which Home used to show. */
  const deckOptions = $derived(
    store.dataset.categories.map((cat) => {
      const cards = store.cards.filter((c) => c.entry.category === cat.id)
      const known = cards.filter((c) => {
        const m = maturityOf(c.state, store.settings)
        return m === 'young' || m === 'mature'
      }).length
      return { id: cat.id, label: `${cat.label} (${known}/${cards.length})` }
    }),
  )

  const subOptions = $derived(
    f.category
      ? (store.subcategoriesOf.get(f.category) ?? [])
      : [...new Set([...store.subcategoriesOf.values()].flat())],
  )

  const rows = $derived.by(() => {
    const q = f.query.trim().toLowerCase()
    return store.dataset.entries
      .filter((e) => !f.category || e.category === f.category)
      .filter((e) => !f.subcategory || e.subcategory === f.subcategory)
      .filter((e) => {
        if (!q) return true
        return [cardFront(e), e.meaning, e.subcategory ?? '', e.example?.target ?? '', e.example?.native ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .map((entry) => {
        const state = store.srs[`${entry.id}:recognition`]
        return {
          entry,
          maturity: maturityOf(state, store.settings),
          next: state && state.stage !== 'new' ? state.due : null,
        }
      })
  })

  /** Search narrows the list but can't be expressed as a session filter. */
  const searching = $derived(f.query.trim().length > 0)
  const drillCount = $derived(Math.min(f.limit, rows.length))

  function drill() {
    store.startPractice({
      categories: f.category ? [f.category] : [],
      subcategories: f.subcategory ? [f.subcategory] : [],
      limit: f.limit,
      writeThrough: f.countToward,
    })
  }

  function remove(entry: Entry) {
    const label = cardFront(entry)
    if (entry.source === 'seed' && !store.isOverridden(entry.id)) {
      alert(
        `"${label}" comes from the imported deck and can't be deleted here.\n\n` +
          'Remove it from japones_organizado.md and re-run `npm run import`.',
      )
      return
    }
    if (confirm(`Delete "${label}" and its review history?`)) store.deleteEntry(entry.id)
  }

  const relativeDue = (due: number) =>
    due <= store.now ? 'now' : `in ${formatDelay(due - store.now)}`
</script>

<section class="stack">
  <input
    type="search"
    placeholder="Search Japanese, Spanish or examples…"
    bind:value={f.query}
    aria-label="Search the deck"
  />

  <div class="row wrap filters">
    <select
      bind:value={f.category}
      onchange={() => (f.subcategory = '')}
      aria-label="Filter by deck"
    >
      <option value="">All decks</option>
      {#each deckOptions as d (d.id)}
        <option value={d.id}>{d.label}</option>
      {/each}
    </select>

    <select bind:value={f.subcategory} aria-label="Filter by subcategory">
      <option value="">All subcategories</option>
      {#each subOptions as sub (sub)}
        <option value={sub}>{sub}</option>
      {/each}
    </select>

    <select bind:value={f.limit} class="limit" aria-label="Cards to drill">
      <option value={10}>10</option>
      <option value={20}>20</option>
      <option value={50}>50</option>
      <option value={9999}>All</option>
    </select>

    <button class="primary drill" onclick={drill} disabled={rows.length === 0 || searching}>
      <Play size={15} fill="currentColor" /> Drill {drillCount}
    </button>
  </div>

  <div class="row wrap statusline">
    <span class="muted count">{rows.length} of {store.dataset.entries.length} cards</span>
    <span class="spacer"></span>
    {#if searching}
      <!-- A session is built from deck/subcategory, which a free-text search
           can't express. Saying so beats a button that quietly ignores it. -->
      <span class="faint hint">Clear the search to drill this selection</span>
    {:else}
      <label class="check faint">
        <input type="checkbox" bind:checked={f.countToward} />
        count toward scheduling
      </label>
    {/if}
  </div>

  <div class="list card-surface divide">
    {#each rows as row (row.entry.id)}
      <div class="entry" class:open={editing === row.entry.id}>
        {#if editing === row.entry.id}
          <EntryEditor entry={row.entry} onDone={() => (editing = null)} />
          <div class="row after-edit">
            <span class="spacer"></span>
            <button class="ghost danger tiny" onclick={() => remove(row.entry)}>Delete</button>
          </div>
        {:else}
          <button class="row-button" onclick={() => (editing = row.entry.id)}>
            <div class="head row">
              <div class="text">
                <div class="jp front">{cardFront(row.entry)}</div>
                <div class="meaning muted">{row.entry.meaning}</div>
                {#if row.entry.subcategory}
                  <div class="sub faint">{row.entry.subcategory}</div>
                {/if}
              </div>
              <span class="spacer"></span>
              <div class="meta">
                <span class="pill {row.maturity}">{MATURITY_LABEL[row.maturity]}</span>
                {#if row.next}
                  <span class="next faint">{relativeDue(row.next)}</span>
                {/if}
              </div>
            </div>

            {#if row.entry.example}
              <div class="detail">
                <div class="jp example">{row.entry.example.target}</div>
                {#if row.entry.example.native}
                  <div class="faint example-native">{row.entry.example.native}</div>
                {/if}
              </div>
            {/if}
          </button>
        {/if}
      </div>
    {:else}
      <p class="empty muted">Nothing matches that.</p>
    {/each}
  </div>
</section>

<style>
  .filters {
    gap: 0.5rem;
  }

  /* The two filters share whatever is left after the fixed-width controls,
     and truncate rather than pushing Drill onto its own line. */
  .filters select {
    width: auto;
    flex: 1 1 7rem;
    min-width: 0;
  }

  /* Needs to out-specify `.filters select` above, which would otherwise let
     the count grow to share the row equally with the two filters. */
  .filters select.limit {
    flex: 0 0 4.6rem;
  }

  .drill {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .statusline {
    margin-top: -0.5rem;
  }

  .count,
  .hint {
    font-size: 0.82rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .check input {
    width: auto;
  }

  .list {
    overflow: hidden;
  }

  .entry.open {
    padding: 0.8rem 1rem;
  }

  .row-button {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border-radius: 0;
    padding: 0.8rem 1rem;
    font: inherit;
    color: inherit;
  }

  .row-button:hover {
    background: var(--surface-2);
  }

  .head {
    align-items: flex-start;
    gap: 0.75rem;
  }

  .front {
    font-size: 1.15rem;
  }

  .meaning {
    font-size: 0.9rem;
  }

  .sub {
    font-size: 0.74rem;
  }

  .meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
  }

  .next {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  .detail {
    margin-top: 0.45rem;
    font-size: 0.84rem;
  }

  .example-native {
    margin-top: 0.1rem;
  }

  .tiny {
    padding: 0.2rem 0.5rem;
    font-size: 0.78rem;
  }

  .danger {
    color: var(--again);
  }

  .after-edit {
    margin-top: 0.6rem;
  }

  .empty {
    padding: 2rem;
    text-align: center;
  }
</style>
