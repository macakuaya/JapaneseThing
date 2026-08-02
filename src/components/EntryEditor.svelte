<script lang="ts">
  // Manual correction for a single entry.
  //
  // The importer and the paste parser are heuristics, and the dictionary is
  // ambiguous by nature — 行った is the past of two different verbs. There has
  // to be a way to just fix a card, so this is reachable from the card itself
  // during review, not only from Browse.

  import { store } from '../lib/store.svelte.ts'
  import type { Entry } from '../lib/types.ts'

  interface Props {
    entry: Entry
    onDone: () => void
  }

  const { entry, onDone }: Props = $props()

  // A snapshot taken when the editor opens: these are draft values the user
  // edits, and must not be reset by the entry updating underneath them.
  /* svelte-ignore state_referenced_locally */
  let kanji = $state(entry.kind === 'word' ? (entry.kanji ?? '') : '')
  /* svelte-ignore state_referenced_locally */
  let kana = $state(entry.kind === 'word' ? entry.kana : '')
  /* svelte-ignore state_referenced_locally */
  let pattern = $state(entry.kind === 'pattern' ? entry.pattern : '')
  /* svelte-ignore state_referenced_locally */
  let meaning = $state(entry.meaning)
  /* svelte-ignore state_referenced_locally */
  let note = $state(entry.note ?? '')
  /* svelte-ignore state_referenced_locally */
  let exampleTarget = $state(entry.example?.target ?? '')
  /* svelte-ignore state_referenced_locally */
  let exampleNative = $state(entry.example?.native ?? '')

  const canSave = $derived(
    meaning.trim().length > 0 &&
      (entry.kind === 'pattern' ? pattern.trim().length > 0 : (kanji || kana).trim().length > 0),
  )

  function save() {
    if (!canSave) return
    const shared = {
      meaning: meaning.trim(),
      note: note.trim() || undefined,
      example: exampleTarget.trim()
        ? { target: exampleTarget.trim(), native: exampleNative.trim() }
        : null,
    }
    const patch =
      entry.kind === 'pattern'
        ? { ...shared, pattern: pattern.trim() }
        : {
            ...shared,
            // A word written only in kana keeps kanji null rather than ''.
            kanji: kanji.trim() || null,
            kana: kana.trim() || kanji.trim(),
          }
    store.updateEntry(entry.id, patch as Partial<Entry>)
    onDone()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onDone()
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save()
  }
</script>

<!-- The keydown is a convenience layer (Esc to cancel, Cmd+Enter to save) over
     controls that are each independently focusable and operable. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="editor" aria-label="Edit entry" onkeydown={onKeydown} onsubmit={(e) => { e.preventDefault(); save() }}>
  <div class="grid">
    {#if entry.kind === 'pattern'}
      <div class="wide">
        <label for="e-pattern">Pattern</label>
        <input id="e-pattern" class="jp" bind:value={pattern} />
      </div>
    {:else}
      <div>
        <label for="e-kanji">Kanji</label>
        <input id="e-kanji" class="jp" bind:value={kanji} placeholder="—" />
      </div>
      <div>
        <label for="e-kana">Kana</label>
        <input id="e-kana" class="jp" bind:value={kana} />
      </div>
    {/if}

    <div class="wide">
      <label for="e-meaning">Meaning</label>
      <input id="e-meaning" bind:value={meaning} />
    </div>

    <div class="wide">
      <label for="e-ex">Example</label>
      <input id="e-ex" class="jp" bind:value={exampleTarget} />
    </div>

    <div class="wide">
      <label for="e-exn">Example translation</label>
      <input id="e-exn" bind:value={exampleNative} />
    </div>

    <div class="wide">
      <label for="e-note">Note</label>
      <input id="e-note" bind:value={note} placeholder="optional" />
    </div>
  </div>

  <div class="row actions">
    <button class="primary" onclick={save} disabled={!canSave}>Save</button>
    <button class="ghost" onclick={onDone}>Cancel</button>
    <span class="spacer"></span>
    {#if entry.source === 'seed'}
      <span class="faint small">Your edit shadows the imported entry</span>
    {/if}
  </div>
</form>

<style>
  .editor {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .actions {
    gap: 0.5rem;
  }

  .small {
    font-size: 0.75rem;
  }
</style>
