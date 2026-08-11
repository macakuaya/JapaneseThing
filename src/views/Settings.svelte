<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte'
  import { store } from '../lib/store.svelte.ts'
  import { MATURE_DAYS, START_EASE } from '../lib/srs.ts'
  import type { FuriganaMode, ThemeMode } from '../lib/types.ts'
  import {
    applyBackup,
    backupFilename,
    exportBackup,
    parseBackup,
  } from '../lib/storage.ts'

  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null)
  let fileInput: HTMLInputElement

  const THEMES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
    { id: 'system', label: 'System', icon: Monitor },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
  ]

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
  <!-- First, because it is the setting you go looking for when you cannot read
       the screen well enough to look for anything else. -->
  <div class="card-surface panel">
    <h2>Appearance</h2>
    <!--
      Three radios rather than a select or a light/dark switch: "follow the
      system" is a third state, not the absence of a choice, and one tap
      settling it beats opening a menu to pick from three.
    -->
    <div class="modes" role="radiogroup" aria-label="Theme">
      {#each THEMES as theme (theme.id)}
        {@const Icon = theme.icon}
        <button
          role="radio"
          aria-checked={store.settings.theme === theme.id}
          class:on={store.settings.theme === theme.id}
          onclick={() => store.setTheme(theme.id)}
        >
          <Icon size={16} />
          <span>{theme.label}</span>
        </button>
      {/each}
    </div>
    <p class="hint faint">
      Stored on this device, like your progress — set it again on your phone.
    </p>
  </div>

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
        class="switch"
        checked={store.settings.lookup}
        onchange={(e) => {
          store.updateSettings({ lookup: e.currentTarget.checked })
          if (e.currentTarget.checked) store.ensureDict()
        }}
      />
      <span>Tap a word to look it up</span>
    </label>

    <!--
      Nothing while the dictionary is ready: a working feature does not need to
      announce itself, and the counts belong in Data sources. What stays is the
      part you can act on — it is still loading, or it failed and needs a retry.
    -->
    {#if store.dict !== 'ready'}
      <p class="dict-status">
        {#if store.dict === 'loading'}
          <span class="faint">Loading dictionary…</span>
        {:else if store.dict === 'error'}
          <span class="err">Dictionary failed to load.</span>
          <button class="ghost tiny" onclick={() => store.ensureDict()}>Retry</button>
          <span class="faint"> {store.dictError}</span>
        {:else}
          <button class="ghost tiny" onclick={() => store.ensureDict()}>Load dictionary now</button>
        {/if}
      </p>
    {/if}
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
          class="switch"
          checked={store.settings.productionCategories.includes(cat.id)}
          onchange={() => store.toggleProduction(cat.id)}
        />
        <!-- Count against the name, as on the deck cards. Pushed to the far
             edge it read as a second column to scan; here it is an annotation
             on the label, which is all it is. The unit goes with it — the
             number is next to a category, so nothing else it could count. -->
        <span>
          {cat.label}
          <span class="count"
            >· {store.dataset.entries.filter((e) => e.category === cat.id).length}</span
          >
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

  <!--
    The scheduler, in four states and three buttons.

    An earlier version explained the mechanism — ease factors, multipliers,
    what each button does to the gap. All true, and none of it answers the
    question someone actually has, which is what a card is doing and when it
    comes back.

    The numbers are read from the scheduler's own constants and the user's own
    limits, so this can't drift out of step with the code it describes.
  -->
  <div class="card-surface panel">
    <h2>How it works</h2>
    <p class="intro muted">
      Get a card right and the gap before you see it again grows. Get it wrong and it shrinks, and
      the card comes back before you finish. The states are just names for how far along a card is.
    </p>

    <dl class="stages">
      <dt><span class="pill new">New</span></dt>
      <!-- Neither of these quotes its number. They are settings, not rules,
           and the setting is one panel up — repeating its value here only
           makes two places to read the same thing. -->
      <dd>
        Never answered. How many begin each day is yours to set under
        <strong>Daily limits</strong>.
      </dd>

      <dt><span class="pill young">Young</span></dt>
      <dd>Answered at least once, and coming back within a few days.</dd>

      <dt><span class="pill mature">Mature</span></dt>
      <dd>The gap has passed {MATURE_DAYS} days. You know this one.</dd>

      <dt><span class="pill leech">Leech</span></dt>
      <dd>
        Missed more times than <strong>Daily limits</strong> allows for. Usually the card is at
        fault rather than you, so it is worth rewriting before drilling it again.
      </dd>
    </dl>
  </div>

  <div class="card-surface panel">
    <h2>The three buttons</h2>
    <p class="intro muted">Each one moves the gap, rather than setting it.</p>

    <dl class="stages">
      <dt><span class="pill again">Hard</span></dt>
      <dd>
        Struggled, or forgot. The card comes round again before this session ends, and next time
        it will be sooner than it would have been.
      </dd>

      <dt><span class="pill good">Good</span></dt>
      <dd>Knew it. The gap multiplies — this is the one to press most of the time.</dd>

      <dt><span class="pill easy">Easy</span></dt>
      <dd>Instant. A bigger jump now, and bigger jumps from here on.</dd>
    </dl>

    <p class="hint faint">
      Each card carries its own multiplier, starting at {START_EASE} and moving with your answers.
      Intervals are nudged a few per cent either way so one heavy day doesn't all come back at
      once.
    </p>
  </div>

  <div class="card-surface panel">
    <!--
      Credit, in jisho.org/about's sense: where the words actually come from.
      The counts that used to be here were trivia — how many entries, how many
      log lines — and none of it told you anything you could act on.

      The two dictionary links point at /wiki/<Page>.html, not at
      /wiki/index.php/<Page>. EDRDG closed its documentation wiki after bots
      overran it, and every index.php address — including the ones its own home
      page and its own redirects still use — now serves the closure notice
      instead of the page. It kept static copies at the shorter path, and those
      are the only live ones.
    -->
    <h2>Data sources</h2>

    <dl class="sources">
      <dt>
        <a href="https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html" target="_blank" rel="noreferrer">
          JMdict
        </a>
        <span class="faint">Spanish edition</span>
      </dt>
      <dd>
        Word meanings, readings and parts of speech — the tooltip when you tap a word, and the
        readings the parser fills in for you.
      </dd>

      <dt>
        <a href="https://www.edrdg.org/wiki/KANJIDIC_Project.html" target="_blank" rel="noreferrer">
          KANJIDIC2
        </a>
      </dt>
      <dd>Per-character readings and meanings, behind the kanji cards and the furigana.</dd>

      <dt>
        <a href="https://github.com/scriptin/jmdict-simplified" target="_blank" rel="noreferrer">
          jmdict-simplified
        </a>
      </dt>
      <dd>
        The packaged form of both. <code>npm run dict</code> trims them down to what this deck can
        actually reach, which is what keeps the download small enough to hold offline.
      </dd>
    </dl>

    <p class="hint faint">
      JMdict and KANJIDIC2 are the property of the
      <a href="https://www.edrdg.org/" target="_blank" rel="noreferrer">
        Electronic Dictionary Research and Development Group
      </a>
      and are used under
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

  /*
   * Three buttons, not a segmented control.
   *
   * The tray around them was a fourth shape doing no work: it grouped three
   * things that a row already groups, and it needed its own fill, which put a
   * grey slab in the middle of a card. Left as plain buttons they match every
   * other control on the page, and the chosen one is marked the way a chosen
   * thing should be — by its own edge, not by a well cut out behind it.
   */
  .modes {
    display: flex;
    gap: 0.5rem;
  }

  .modes button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.6rem 0.5rem;
    font-size: 0.88rem;
    color: var(--muted);
  }

  .modes button:hover:not(.on) {
    color: var(--text);
  }

  /* Two pixels of border rather than one, in the accent: enough to read as
     chosen at a glance without the button having to change colour or weight
     and shove its neighbours around. */
  .modes button.on {
    color: var(--text);
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
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

  /* Same size as the label, set apart by an interpunct rather than by being
     smaller. Shrunk, it read as a footnote clinging to the word. */
  .toggle .count {
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  /*
   * A source and what it is for. The shared dl grid already puts the term left
   * and its description right; these rows are taller than a name/value pair,
   * so the gap grows and both sides start on the same line — a margin on the
   * term alone would push it out of step with the text beside it.
   */
  /* The four grade colours as pills, matching the buttons they describe. */
  .stages :global(.pill.again) {
    color: var(--again);
    background: color-mix(in srgb, var(--again) 16%, transparent);
  }
  .stages :global(.pill.hard) {
    color: var(--hard);
    background: color-mix(in srgb, var(--hard) 16%, transparent);
  }
  .stages :global(.pill.good) {
    color: var(--good);
    background: color-mix(in srgb, var(--good) 16%, transparent);
  }
  .stages :global(.pill.easy) {
    color: var(--easy);
    background: color-mix(in srgb, var(--easy) 16%, transparent);
  }

  /* Term is a pill, so the row aligns on the pill's own line rather than on a
     baseline the pill doesn't share. */
  .stages {
    row-gap: 0.8rem;
    align-items: baseline;
  }

  .stages dd {
    color: var(--muted);
    line-height: 1.5;
  }

  .sources {
    row-gap: 1rem;
    align-items: baseline;
  }

  .sources dt {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    color: var(--text);
  }

  .sources dd {
    color: var(--muted);
    line-height: 1.5;
  }

  .sources .faint {
    font-size: 0.75rem;
  }

  /* Outlined like the buttons beside it, but in its own colour — the warning
     is in the hue, and it no longer has to shout with a fill to be heard. */
  .danger {
    color: var(--again);
    border-color: color-mix(in srgb, var(--again) 40%, transparent);
  }

  .danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--again) 12%, transparent);
    border-color: color-mix(in srgb, var(--again) 60%, transparent);
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
