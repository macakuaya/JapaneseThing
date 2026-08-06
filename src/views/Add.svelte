<script lang="ts">
  import { Check, Copy, X } from '@lucide/svelte'
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

  /*
   * The prompt for the step that happens outside this app.
   *
   * The teacher doesn't send finished cards — you talk, she writes fragments,
   * and turning that into rows by hand is the chore that killed Anki. Claude
   * does that part well already; what it needs is to be told the exact shape
   * this parser reads best, which is the shape the class file is already in.
   *
   * So the loop is two copies: chat → here → back. Nothing in the app calls a
   * model, and nothing needs a key.
   */
  const CLAUDE_PROMPT = `Here is a chat log from my Japanese class. Pull out everything the teacher taught — vocabulary, verbs, expressions and grammar patterns — and give it back as Markdown tables and nothing else.

Vocabulary, verbs and expressions:

| 漢字 | かな | Traducción | Frase de ejemplo |
|---|---|---|---|

Grammar patterns:

| Patrón | Significado | Frase de ejemplo |
|---|---|---|

Rules:
- 漢字 is the written form. Write — when the word has no kanji.
- かな is the full reading, in hiragana.
- Traducción is in Spanish.
- Frase de ejemplo is one Japanese sentence followed by its Spanish translation in parentheses: 日本語の文。(La traducción.)
- If the teacher gave no example, write a short natural one at the same level.
- One row per word. No commentary and no headings other than the tables.

Chat log:
`

  let copied = $state(false)

  async function copyPrompt() {
    await navigator.clipboard.writeText(CLAUDE_PROMPT)
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  const EXAMPLE_PASTE = `にんにく = ajo
酢（す）vinagre  酢を入れます。(Añado vinagre.)
蒸す（むす）cocinar al vapor
〜たびに cada vez que`
</script>

<!--
  Subcategories are whatever the entries say they are — `subcategoriesOf` reads
  them off the deck, so one saved card is enough to make a new one exist. The
  only thing stopping you inventing one was the control: a <select> can offer
  the topics the class file happened to contain and nothing else, which is why
  there was nowhere to put an adjective.

  A datalist per category turns each field into "pick one, or type a new one".
-->
{#each store.dataset.categories as cat (cat.id)}
  <datalist id="subs-{cat.id}">
    {#each subsFor(cat.id) as sub (sub)}
      <option value={sub}></option>
    {/each}
  </datalist>
{/each}

<section class="stack">
  <div class="card-surface panel">
    <div class="row wrap head">
      <h2>Add words</h2>
      <span class="spacer"></span>
      <button class="ghost tiny with-icon" onclick={copyPrompt}>
        {#if copied}<Check size={14} />Copied{:else}<Copy size={14} />Copy Claude prompt{/if}
      </button>
    </div>
    <p class="muted intro">
      Paste whatever the teacher sent — raw messages, or a table. The parser guesses the
      fields, fills readings from the dictionary and flags what it is unsure about. Nothing
      is saved until you press Save.
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
        <input
          id="sub"
          list="subs-{defaultCategory}"
          bind:value={defaultSubcategory}
          placeholder="none — or type a new one"
        />
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
    <!--
      Wider than the reading column the rest of the app is held to. A line of
      prose wants 760px; a six-column table does not, and the alternative was
      a sideways scrollbar inside the panel. Only this panel breaks out — the
      header and the paste box stay put, so nothing jumps when you press Parse.
    -->
    <div class="card-surface panel results">
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

      <!--
        A table, because that is the shape the data already has: the teacher's
        file, Claude's output and this list are all 漢字 / かな / traducción /
        ejemplo. Two columns of labelled boxes per card made you read each row
        as a form instead of scanning a column.

        Below 900px it stacks into one column per field — a five-column table
        on a phone is a table you scroll sideways and stop reading.
      -->
      <div class="table" role="group" aria-label="Parsed entries">
        <div class="head-row">
          <span></span>
          <span class="jp">漢字 / Patrón</span>
          <span class="jp">かな</span>
          <span>Traducción</span>
          <span>Frase de ejemplo</span>
          <span>Categoría</span>
          <span></span>
        </div>

        {#each drafts as draft, i (i)}
          <div class="draft" class:low={draft.confidence === 'low'} class:off={!draft.include}>
            <div class="cell pick">
              <input
                type="checkbox"
                bind:checked={draft.include}
                aria-label="Include this entry"
                class="tick"
              />
              <span class="conf {draft.confidence}" title="parser confidence"></span>
            </div>

            <div class="cell">
              <label for="w-{i}">{draft.kind === 'pattern' ? 'Patrón' : '漢字'}</label>
              {#if draft.kind === 'pattern'}
                <input id="w-{i}" class="jp" bind:value={draft.pattern} />
              {:else}
                <input id="w-{i}" class="jp" bind:value={draft.kanji} placeholder="—" />
              {/if}
            </div>

            <div class="cell">
              <label for="r-{i}">かな</label>
              {#if draft.kind === 'pattern'}
                <input
                  id="r-{i}"
                  class="jp"
                  bind:value={draft.reading}
                  placeholder={hasKanji(draft.pattern) ? 'required' : '—'}
                />
              {:else}
                <input id="r-{i}" class="jp" bind:value={draft.kana} />
              {/if}
            </div>

            <div class="cell">
              <label for="m-{i}">Traducción</label>
              <input
                id="m-{i}"
                bind:value={draft.meaning}
                class:missing={draft.include && !draft.meaning.trim()}
                placeholder="required"
              />
              <input id="n-{i}" class="jp sub" bind:value={draft.note} placeholder="note" />
            </div>

            <!-- Sentence over translation, the way the card shows them. -->
            <div class="cell">
              <label for="ex-{i}">Frase de ejemplo</label>
              <input id="ex-{i}" class="jp" bind:value={draft.exampleTarget} placeholder="—" />
              <input id="ent-{i}" class="sub" bind:value={draft.exampleNative} placeholder="—" />
            </div>

            <div class="cell">
              <label for="c-{i}">Categoría</label>
              <select id="c-{i}" bind:value={draft.category}>
                {#each store.dataset.categories as cat (cat.id)}
                  <option value={cat.id}>{cat.label}</option>
                {/each}
              </select>
              <input
                id="s-{i}"
                class="sub"
                list="subs-{draft.category}"
                bind:value={draft.subcategory}
                placeholder="subcategoría"
              />
            </div>

            <div class="cell drop">
              <button
                class="ghost tiny"
                onclick={() => (drafts = drafts.toSpliced(i, 1))}
                aria-label="Remove row"><X size={14} /></button
              >
            </div>

            {#if draft.issues.length || draft.raw}
              <div class="cell notes">
                {#each draft.issues as issue (issue)}
                  <span class="issue">{issue}</span>
                {/each}
                {#if draft.raw}
                  <code class="raw faint" title={draft.raw}>{draft.raw}</code>
                {/if}
              </div>
            {/if}
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

  /*
   * One grid for the whole table, with each row's cells joining it through
   * `display: contents`. Declaring the columns once is what keeps them lined
   * up down the page — per-row grids drift as soon as one row's content is
   * wider than another's.
   */
  .results {
    width: min(1080px, calc(100vw - 2rem));
    margin-inline: calc((100% - min(1080px, 100vw - 2rem)) / 2);
  }

  .table {
    display: grid;
    grid-template-columns:
      2.2rem minmax(7rem, 1fr) minmax(6rem, 0.85fr) minmax(8.5rem, 1.1fr)
      minmax(11rem, 1.6fr) minmax(7.5rem, 0.85fr) 2rem;
    gap: 0.35rem 0.5rem;
    align-items: start;
  }

  .head-row {
    display: contents;
  }

  .head-row > span {
    font-size: 0.72rem;
    color: var(--faint);
    letter-spacing: 0.03em;
    padding-bottom: 0.15rem;
  }

  .draft {
    display: contents;
  }

  /* With the row itself painting nothing, "look at this one" has to be said by
     the cells. Quieter than ringing the row in an outline, and it survives the
     stacked layout below unchanged. */
  .draft.low > .cell {
    background: color-mix(in srgb, var(--again) 8%, transparent);
  }

  .draft.off > .cell {
    opacity: 0.45;
  }

  .cell {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    border-radius: 6px;
  }

  /* The header row names the columns, so repeating the name in every cell is
     noise — until the table stacks, where the header is gone. */
  .cell label {
    display: none;
    margin: 0;
  }

  .cell.pick {
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    padding-top: 0.5rem;
  }

  .cell.drop {
    padding-top: 0.15rem;
  }

  /* Second line of a cell: the note under a meaning, the translation under a
     sentence, the subcategory under a category. Quieter than the first. */
  .cell .sub {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .cell.notes {
    grid-column: 1 / -1;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0 0.5rem 2.2rem;
    border-bottom: 1px solid var(--divider);
    margin-bottom: 0.25rem;
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

  /* Ellipsised, never wrapped, and never a reason for the page to grow: the
     original line is a reference, not content. */
  .raw {
    font-size: 0.74rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    max-width: 100%;
    flex: 0 1 auto;
  }

  .issue {
    font-size: 0.7rem;
    color: var(--again);
    white-space: nowrap;
  }

  /*
   * A five-column table on a phone is a table you scroll sideways and stop
   * reading. Below this it becomes one field per line, labels back on, each
   * row an inset block so the boundary between entries stays obvious.
   */
  @media (max-width: 900px) {
    .table {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      /* The grid rule's `start` would size each row to its content here, and
         one long raw-text line then widens the page. */
      align-items: stretch;
    }

    .head-row {
      display: none;
    }

    .draft {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      border-radius: 10px;
      padding: 0.7rem 0.8rem;
      background: var(--bg);
      min-width: 0;
    }

    .draft.low {
      background: color-mix(in srgb, var(--again) 8%, var(--bg));
    }

    .draft.low > .cell {
      background: none;
    }

    .draft.off {
      opacity: 0.45;
    }

    .draft.off > .cell {
      opacity: 1;
    }

    .cell label {
      display: block;
      font-size: 0.72rem;
      color: var(--faint);
    }

    .cell.notes {
      padding: 0;
      border: none;
      margin: 0;
    }

    .cell.pick,
    .cell.drop {
      padding: 0;
    }

    .results {
      width: auto;
      margin-inline: 0;
    }
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
