<script lang="ts">
  import EntryEditor from '../components/EntryEditor.svelte'
  import { store } from '../lib/store.svelte.ts'
  import { cardFront } from '../lib/text.ts'
  import { MATURITY_LABEL, formatDelay, maturityOf } from '../lib/srs.ts'
  import type { Entry } from '../lib/types.ts'

  interface Props {
    onExit: () => void
  }

  const { onExit }: Props = $props()

  let query = $state('')
  let category = $state('')
  let editing = $state<string | null>(null)

  const rows = $derived.by(() => {
    const q = query.trim().toLowerCase()
    return store.dataset.entries
      .filter((e) => !category || e.category === category)
      .filter((e) => {
        if (!q) return true
        const haystack = [
          cardFront(e),
          e.meaning,
          e.subcategory ?? '',
          e.example?.target ?? '',
          e.example?.native ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
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
  <header class="row">
    <button class="ghost" onclick={onExit}>← Home</button>
  </header>

  <div class="row wrap controls">
    <input
      type="search"
      placeholder="Search Japanese, Spanish or examples…"
      bind:value={query}
      aria-label="Search entries"
    />
    <select bind:value={category} aria-label="Filter by category">
      <option value="">All categories</option>
      {#each store.dataset.categories as cat (cat.id)}
        <option value={cat.id}>{cat.label}</option>
      {/each}
    </select>
  </div>

  <p class="muted count">{rows.length} of {store.dataset.entries.length}</p>

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
          <!-- The whole row opens the editor. Reaching for a small "Edit"
               link at the far right is the wrong target on a phone, and the
               row already looks like the card it represents. -->
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
              <!-- Translation sits under its sentence, not beside it: side by
                   side, the eye has to jump the width of the row to pair them,
                   and the Japanese wraps into the gap on a narrow screen. -->
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
      <p class="empty muted">Nothing matches that search.</p>
    {/each}
  </div>
</section>

<style>
  .controls {
    gap: 0.5rem;
  }

  .controls input[type='search'] {
    flex: 1 1 240px;
  }

  .controls select {
    width: auto;
    flex: 0 0 auto;
  }

  .count {
    margin: 0;
    font-size: 0.82rem;
  }

  .list {
    overflow: hidden;
  }

  .entry.open {
    padding: 0.8rem 1rem;
  }

  /* The row is the target, so it fills the cell and keeps list typography
     rather than inheriting the button defaults. */
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
