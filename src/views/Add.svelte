<script lang="ts">
  import { X } from '@lucide/svelte'
  import { type Draft, draftToEntry, fillReadings, parseBlock } from '../lib/parse.ts'
  import { store } from '../lib/store.svelte.ts'
  import { hasKanji } from '../lib/text.ts'

  let text = $state('')
  let drafts = $state<Draft[]>([])
  let defaultCategory = $state(store.dataset.categories[0]?.id ?? 'vocabulario')
  let defaultSubcategory = $state('')
  let saved = $state<number | null>(null)

  const subsFor = (categoryId: string) => store.subcategoriesOf.get(categoryId) ?? []

  const selected = $derived(drafts.filter((d) => d.include))
  const problems = $derived(drafts.filter((d) => d.confidence === 'low').length)

  // The teacher usually sends Japanese with no translation, so this is the
  // normal case rather than an error — but a card with a blank back is
  // useless, so saving waits until the meanings are filled in.
  const missingMeaning = $derived(selected.filter((d) => !d.meaning.trim()).length)

  async function parse() {
    drafts = parseBlock(text, {
      category: defaultCategory,
      subcategory: defaultSubcategory,
    })
    saved = null

    // The teacher rarely writes the reading, so the dictionary fills what it
    // can. Shown first and filled after, so a slow dictionary delays the
    // readings rather than the whole table.
    await store.ensureDict()
    drafts = fillReadings(drafts)
  }

  function blankRow() {
    drafts = [
      ...drafts,
      {
        include: true,
        kind: 'word',
        kanji: '',
        kana: '',
        pattern: '',
        reading: '',
        meaning: '',
        note: '',
        exampleTarget: '',
        exampleNative: '',
        category: defaultCategory,
        subcategory: defaultSubcategory,
        confidence: 'high',
        raw: '',
        issues: [],
      },
    ]
  }

  function applyToAll(field: 'category' | 'subcategory', value: string) {
    drafts = drafts.map((d) =>
      field === 'category'
        ? { ...d, category: value, subcategory: '' }
        : { ...d, subcategory: value },
    )
  }

  function save() {
    const entries = selected.map(draftToEntry).filter((e) => e.meaning)
    const added = store.addEntries(entries)
    saved = added
    // Keep any rows that were deliberately excluded so nothing is silently lost.
    drafts = drafts.filter((d) => !d.include)
    if (!drafts.length) text = ''
  }

  const EXAMPLE_PASTE = `にんにく = ajo
酢（す）vinagre  酢を入れます。(Añado vinagre.)
蒸す（むす）cocinar al vapor
〜たびに cada vez que`
</script>

<section class="stack">
  <div class="card-surface panel">
    <h2>Add words</h2>
    <p class="muted intro">
      Paste whatever the teacher sent. The parser guesses the fields and flags what it is
      unsure about — nothing is saved until you press Save.
    </p>

    <textarea
      bind:value={text}
      rows="7"
      placeholder={EXAMPLE_PASTE}
      spellcheck="false"
      aria-label="Pasted text"
    ></textarea>

    <div class="row wrap defaults">
      <div class="field">
        <label for="cat">Default category</label>
        <select
          id="cat"
          bind:value={defaultCategory}
          onchange={() => (defaultSubcategory = '')}
        >
          {#each store.dataset.categories as cat (cat.id)}
            <option value={cat.id}>{cat.label}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="sub">Default subcategory</label>
        <select id="sub" bind:value={defaultSubcategory}>
          <option value="">— none —</option>
          {#each subsFor(defaultCategory) as sub (sub)}
            <option value={sub}>{sub}</option>
          {/each}
        </select>
      </div>
      <span class="spacer"></span>
      <button class="primary" onclick={parse} disabled={!text.trim()}>Parse</button>
    </div>
  </div>

  {#if saved !== null}
    <p class="saved card-surface" role="status">
      {saved > 0
        ? `Added ${saved} ${saved === 1 ? 'entry' : 'entries'}. They start as new cards in your next review.`
        : 'Nothing new to add — those entries already exist.'}
    </p>
  {/if}

  {#if drafts.length}
    <div class="card-surface panel">
      <div class="row wrap head">
        <h3>{drafts.length} parsed</h3>
        {#if problems > 0}
          <span class="pill leech">{problems} need{problems === 1 ? 's' : ''} attention</span>
        {/if}
        <span class="spacer"></span>
        <button class="ghost tiny" onclick={() => applyToAll('category', defaultCategory)}>
          Set all to {store.dataset.categories.find((c) => c.id === defaultCategory)?.label}
        </button>
        {#if defaultSubcategory}
          <button class="ghost tiny" onclick={() => applyToAll('subcategory', defaultSubcategory)}>
            Set all to {defaultSubcategory}
          </button>
        {/if}
      </div>

      <div class="drafts">
        {#each drafts as draft, i (i)}
          <div class="draft" class:low={draft.confidence === 'low'} class:off={!draft.include}>
            <div class="row top">
              <input
                type="checkbox"
                bind:checked={draft.include}
                aria-label="Include this entry"
                class="tick"
              />
              <span class="conf {draft.confidence}" title="parser confidence"></span>
              {#if draft.raw}
                <code class="raw faint" title={draft.raw}>{draft.raw}</code>
              {:else}
                <code class="raw faint">manual entry</code>
              {/if}
              <span class="spacer"></span>
              {#each draft.issues as issue (issue)}
                <span class="issue">{issue}</span>
              {/each}
              <button
                class="ghost tiny"
                onclick={() => (drafts = drafts.toSpliced(i, 1))}
                aria-label="Remove row"><X size={14} /></button
              >
            </div>

            <div class="grid">
              {#if draft.kind === 'pattern'}
                <div class="cell">
                  <label for="p-{i}">Pattern</label>
                  <input id="p-{i}" class="jp" bind:value={draft.pattern} />
                </div>
                <div class="cell">
                  <label for="pr-{i}">Reading</label>
                  <input
                    id="pr-{i}"
                    class="jp"
                    bind:value={draft.reading}
                    placeholder={hasKanji(draft.pattern) ? 'required' : 'optional'}
                  />
                </div>
              {:else}
                <div class="cell">
                  <label for="k-{i}">Kanji</label>
                  <input id="k-{i}" class="jp" bind:value={draft.kanji} />
                </div>
                <div class="cell">
                  <label for="r-{i}">Kana</label>
                  <input id="r-{i}" class="jp" bind:value={draft.kana} />
                </div>
              {/if}

              <div class="cell">
                <label for="m-{i}">Meaning</label>
                <input
                  id="m-{i}"
                  bind:value={draft.meaning}
                  class:missing={draft.include && !draft.meaning.trim()}
                  placeholder="required"
                />
              </div>
              <div class="cell">
                <label for="n-{i}">Note</label>
                <input id="n-{i}" class="jp" bind:value={draft.note} placeholder="optional" />
              </div>

              <div class="cell wide">
                <label for="ex-{i}">Example</label>
                <input id="ex-{i}" class="jp" bind:value={draft.exampleTarget} />
              </div>
              <div class="cell wide">
                <label for="ent-{i}">Example translation</label>
                <input id="ent-{i}" bind:value={draft.exampleNative} />
              </div>

              <div class="cell">
                <label for="c-{i}">Category</label>
                <select id="c-{i}" bind:value={draft.category}>
                  {#each store.dataset.categories as cat (cat.id)}
                    <option value={cat.id}>{cat.label}</option>
                  {/each}
                </select>
              </div>
              <div class="cell">
                <label for="s-{i}">Subcategory</label>
                <select id="s-{i}" bind:value={draft.subcategory}>
                  <option value="">— none —</option>
                  {#each subsFor(draft.category) as sub (sub)}
                    <option value={sub}>{sub}</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
        {/each}
      </div>

      {#if missingMeaning > 0}
        <p class="needs">
          {missingMeaning} of the {selected.length} selected
          {missingMeaning === 1 ? 'row has' : 'rows have'} no meaning yet. The teacher's messages
          usually arrive without translations — type them in above, or untick the rows you don't
          want.
        </p>
      {/if}

      <div class="row actions">
        <button class="ghost" onclick={blankRow}>+ Blank row</button>
        <span class="spacer"></span>
        <span class="muted">{selected.length} selected</span>
        <button
          class="primary"
          onclick={save}
          disabled={selected.length === 0 || missingMeaning > 0}
        >
          Save {selected.length}
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .panel {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .intro {
    margin: 0;
    font-size: 0.88rem;
  }

  textarea {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    resize: vertical;
  }

  .defaults {
    gap: 0.75rem;
    align-items: flex-end;
  }

  .field {
    flex: 1 1 180px;
  }

  .field select {
    width: 100%;
  }

  .saved {
    margin: 0;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    color: var(--good);
    background: color-mix(in srgb, var(--good) 12%, var(--surface));
  }

  .head {
    gap: 0.5rem;
  }

  .drafts {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* An inset well on the panel: the darker fill separates each draft from its
     neighbours without ringing every one of them in an outline. */
  .draft {
    border-radius: 10px;
    padding: 0.7rem 0.8rem;
    background: var(--bg);
  }

  /* A tint says "look at this one" more quietly than a coloured outline. */
  .draft.low {
    background: color-mix(in srgb, var(--again) 8%, var(--bg));
  }

  .draft.off {
    opacity: 0.45;
  }

  .top {
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .tick {
    width: auto;
    flex: 0 0 auto;
  }

  .conf {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: 0 0 auto;
  }

  .conf.high {
    background: var(--good);
  }
  .conf.medium {
    background: var(--hard);
  }
  .conf.low {
    background: var(--again);
  }

  .raw {
    font-size: 0.74rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 45%;
  }

  .issue {
    font-size: 0.7rem;
    color: var(--again);
    white-space: nowrap;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .cell.wide {
    grid-column: 1 / -1;
  }

  .tiny {
    padding: 0.2rem 0.5rem;
    font-size: 0.76rem;
  }

  .card-surface input.missing {
    background: color-mix(in srgb, var(--hard) 13%, var(--bg));
  }

  .needs {
    margin: 0;
    font-size: 0.84rem;
    color: var(--muted);
    background: color-mix(in srgb, var(--hard) 10%, transparent);
    border-radius: var(--radius-sm);
    padding: 0.6rem 0.75rem;
  }

  .actions {
    padding-top: 0.5rem;
    gap: 0.75rem;
  }
</style>
