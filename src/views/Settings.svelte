<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte'
  import { store } from '../lib/store.svelte.ts'
  import type { FuriganaMode } from '../lib/types.ts'
  import {
    applyBackup,
    backupFilename,
    exportBackup,
    parseBackup,
  } from '../lib/storage.ts'

  interface Props {
    onExit: () => void
  }

  const { onExit }: Props = $props()

  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null)
  let fileInput: HTMLInputElement

  function download() {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFilename()
    a.click()
    URL.revokeObjectURL(url)
    message = { kind: 'ok', text: 'Backup downloaded.' }
  }

  async function upload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      const cards = Object.keys(backup.srs).length
      if (
        !confirm(
          `Replace everything on this device with the backup?\n\n` +
            `${cards} scheduled cards, ${backup.entries.length} added entries` +
            (backup.exportedAt ? `\nExported ${new Date(backup.exportedAt).toLocaleString()}` : ''),
        )
      )
        return
      applyBackup(backup)
      store.reloadFromStorage()
      message = { kind: 'ok', text: `Imported ${cards} scheduled cards.` }
    } catch (err) {
      message = { kind: 'error', text: err instanceof Error ? err.message : String(err) }
    } finally {
      fileInput.value = ''
    }
  }

  function resetScheduling() {
    if (
      confirm(
        'Reset all review progress?\n\nEvery card goes back to new. Your added words are kept. This cannot be undone.',
      )
    ) {
      store.resetScheduling()
      message = { kind: 'ok', text: 'All scheduling reset.' }
    }
  }

  const num = (value: string, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
</script>

<section class="stack">
  <header class="row">
    <button class="ghost with-icon" onclick={onExit}>
      <ArrowLeft size={16} /> Home
    </button>
  </header>

  <div class="card-surface panel">
    <h2>Daily limits</h2>
    <div class="grid">
      <div>
        <label for="new">New cards per day</label>
        <input
          id="new"
          type="number"
          min="0"
          max="200"
          value={store.settings.newPerDay}
          oninput={(e) =>
            store.updateSettings({ newPerDay: num(e.currentTarget.value, 10) })}
        />
      </div>
      <div>
        <label for="rev">Reviews per day</label>
        <input
          id="rev"
          type="number"
          min="0"
          max="2000"
          value={store.settings.reviewsPerDay}
          oninput={(e) =>
            store.updateSettings({ reviewsPerDay: num(e.currentTarget.value, 100) })}
        />
      </div>
      <div>
        <label for="hour">Day starts at</label>
        <select
          id="hour"
          value={store.settings.dayStartHour}
          onchange={(e) =>
            store.updateSettings({ dayStartHour: num(e.currentTarget.value, 4) })}
        >
          {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}
            <option value={h}>{String(h).padStart(2, '0')}:00</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="leech">Lapses before leech</label>
        <input
          id="leech"
          type="number"
          min="2"
          max="20"
          value={store.settings.leechThreshold}
          oninput={(e) =>
            store.updateSettings({ leechThreshold: num(e.currentTarget.value, 5) })}
        />
      </div>
    </div>
    <p class="hint faint">
      A card answered after midnight still counts toward the previous day until the hour above.
    </p>
  </div>

  <div class="card-surface panel">
    <h2>Reading help</h2>
    <div>
      <label for="furi">Furigana over kanji</label>
      <select
        id="furi"
        value={store.settings.furigana}
        onchange={(e) =>
          store.updateSettings({ furigana: e.currentTarget.value as FuriganaMode })}
      >
        <option value="revealed">Only on the answer side</option>
        <option value="always">Always</option>
        <option value="off">Never</option>
      </select>
    </div>

    <label class="toggle">
      <input
        type="checkbox"
        checked={store.settings.lookup}
        onchange={(e) => {
          store.updateSettings({ lookup: e.currentTarget.checked })
          if (e.currentTarget.checked) store.ensureDict()
        }}
      />
      <span>Tap a word to look it up</span>
    </label>

    <p class="hint faint">
      Headword furigana always works offline — it comes from your own deck. Furigana over example
      sentences and word lookup need the dictionary below.
    </p>

    <p class="dict-status">
      {#if store.dict === 'ready'}
        <span class="ok">Dictionary loaded</span>
        <span class="faint"> · 34,298 words · 2,582 kanji · available offline</span>
      {:else if store.dict === 'loading'}
        <span class="faint">Loading dictionary…</span>
      {:else if store.dict === 'error'}
        <span class="err">Dictionary failed to load.</span>
        <button class="ghost tiny" onclick={() => store.ensureDict()}>Retry</button>
        <span class="faint"> {store.dictError}</span>
      {:else}
        <button class="ghost tiny" onclick={() => store.ensureDict()}>Load dictionary now</button>
      {/if}
    </p>
  </div>

  <div class="card-surface panel">
    <h2>Production cards</h2>
    <p class="muted intro">
      By default you are shown Japanese and recall the Spanish. Turn a category on here to also
      be shown the Spanish and asked to produce the Japanese — it doubles that category's cards.
    </p>
    {#each store.dataset.categories as cat (cat.id)}
      <label class="toggle">
        <input
          type="checkbox"
          checked={store.settings.productionCategories.includes(cat.id)}
          onchange={() => store.toggleProduction(cat.id)}
        />
        <span>{cat.label}</span>
        <span class="spacer"></span>
        <span class="faint">
          {store.dataset.entries.filter((e) => e.category === cat.id).length} entries
        </span>
      </label>
    {/each}
  </div>

  <div class="card-surface panel">
    <h2>Backup</h2>
    <p class="muted intro">
      Progress is stored in this browser only — it does not sync between your laptop and your
      phone. Export here and import on the other device to move it across.
    </p>
    <div class="row wrap">
      <button onclick={download}>Export JSON</button>
      <button onclick={() => fileInput.click()}>Import JSON…</button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        onchange={upload}
        hidden
      />
      <span class="spacer"></span>
      <button class="danger" onclick={resetScheduling}>Reset progress</button>
    </div>
    {#if message}
      <p class="message {message.kind}" role="status">{message.text}</p>
    {/if}
  </div>

  <div class="card-surface panel">
    <h2>Deck</h2>
    <dl>
      <dt>Name</dt>
      <dd>{store.dataset.name}</dd>
      <dt>Languages</dt>
      <dd>{store.dataset.targetLang} → {store.dataset.nativeLang}</dd>
      <dt>Entries</dt>
      <dd>
        {store.dataset.entries.length}
        <span class="faint">({store.userEntries.length} added by you)</span>
      </dd>
      <dt>Scheduled cards</dt>
      <dd>{Object.keys(store.srs).length}</dd>
      <dt>Answers recorded</dt>
      <dd>{store.log.length}</dd>
    </dl>
    <p class="hint faint">
      To bulk-update the deck, edit <code>japones_organizado.md</code> and run
      <code>npm run import</code>. Review progress survives, because card ids are derived from
      the Japanese itself rather than from row order.
    </p>
    <p class="hint faint">
      Dictionary data from JMdict and KANJIDIC2, © the Electronic Dictionary Research and
      Development Group, used under
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer"
        >CC BY-SA 4.0</a
      >.
    </p>
  </div>
</section>

<style>
  .panel {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .intro {
    margin: 0;
    font-size: 0.88rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.75rem;
  }

  .hint {
    margin: 0;
    font-size: 0.78rem;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0;
    padding: 0.4rem 0;
    color: var(--text);
    font-size: 0.92rem;
    cursor: pointer;
  }

  .toggle input {
    width: auto;
  }

  .toggle .faint {
    font-size: 0.78rem;
  }

  .danger {
    color: var(--again);
    background: color-mix(in srgb, var(--again) 14%, transparent);
  }

  .message {
    margin: 0;
    font-size: 0.85rem;
  }

  .message.ok {
    color: var(--good);
  }

  .message.error {
    color: var(--again);
  }

  .dict-status {
    margin: 0;
    font-size: 0.82rem;
  }

  .dict-status .ok {
    color: var(--good);
  }

  .dict-status .err {
    color: var(--again);
  }

  .tiny {
    padding: 0.15rem 0.45rem;
    font-size: 0.78rem;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 1rem;
    margin: 0;
    font-size: 0.88rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
  }

  code {
    font-size: 0.85em;
    background: var(--surface-2);
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
  }
</style>
