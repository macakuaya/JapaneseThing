<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte'
  import { store } from '../lib/store.svelte.ts'
  import {
    EASY_INTERVAL,
    LEARNING_STEPS_MIN,
    MATURE_DAYS,
    MIN_EASE,
    START_EASE,
  } from '../lib/srs.ts'
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

  <div class="card-surface panel">
    <!--
    The scheduler, in words. Every number here is read from the same constants
    the scheduler uses — MATURE_DAYS, START_EASE, LEARNING_STEPS_MIN and the
    user's own limits — so this panel cannot drift out of step with the code it
    describes, which is the usual fate of a page like this.
  -->
  <div class="card-surface panel">
    <h2>How it works</h2>
    <p class="intro muted">
      Every card moves through the same five states. The words are the ones on the labels in
      Deck.
    </p>

    <dl class="stages">
      <dt><span class="pill new">New</span></dt>
      <dd>
        Never answered. Up to {store.settings.newPerDay} enter the queue each day, so a big import
        doesn't become a wall.
      </dd>

      <dt><span class="pill learning">Learning</span></dt>
      <dd>
        Comes back after {LEARNING_STEPS_MIN[0]} minute, then {LEARNING_STEPS_MIN[1]}. Two rights
        in a row and it graduates to tomorrow; <strong>Easy</strong> skips both steps and jumps
        straight to {EASY_INTERVAL} days.
      </dd>

      <dt><span class="pill young">Young</span></dt>
      <dd>
        Now scheduled in days. Each <strong>Good</strong> multiplies the gap by the card's ease,
        which starts at {START_EASE} — roughly 1 day, 3, 6, 15, and on out.
      </dd>

      <dt><span class="pill mature">Mature</span></dt>
      <dd>
        The same card once its gap passes {MATURE_DAYS} days. Nothing about the scheduling
        changes; it is simply one you evidently know.
      </dd>

      <dt><span class="pill leech">Leech</span></dt>
      <dd>
        {store.settings.leechThreshold} lapses. You keep forgetting it, which usually means the
        card is at fault rather than you — worth rewriting with the pen before drilling it again.
      </dd>
    </dl>

    <p class="hint faint">
      The buttons move the gap rather than set it. <strong>Good</strong> multiplies by the ease,
      <strong>Hard</strong> by 1.2 and lowers the ease a little, <strong>Easy</strong> raises both.
      <strong>Again</strong> is a lapse: the gap halves, the ease drops, and the card returns in
      ten minutes. Ease never falls below {MIN_EASE}, and every interval is jittered by a few per
      cent so one heavy day doesn't come back as a single spike.
    </p>
  </div>

  <!--
      Credit, in jisho.org/about's sense: where the words actually come from.
      The counts that used to be here were trivia — how many entries, how many
      log lines — and none of it told you anything you could act on.
    -->
    <h2>Data sources</h2>

    <dl class="sources">
      <dt>
        <a href="https://www.edrdg.org/jmdict/j_jmdict.html" target="_blank" rel="noreferrer">
          JMdict
        </a>
        <span class="faint">Spanish edition</span>
      </dt>
      <dd>
        Word meanings, readings and parts of speech — the tooltip when you tap a word, and the
        readings the parser fills in for you.
      </dd>

      <dt>
        <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noreferrer">
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
