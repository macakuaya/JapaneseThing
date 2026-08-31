<script lang="ts">
  // Manual correction for a single entry.
  //
  // The importer and the paste parser are heuristics, and the dictionary is
  // ambiguous by nature — 行った is the past of two different verbs. There has
  // to be a way to just fix a card, so this is reachable from the card itself
  // during review, not only from Browse.

  import { store } from '../lib/store.svelte.ts'
  import { Trash2 } from '@lucide/svelte'
  import { cardFront, hasKanji, parseVocabulary, splitReadings } from '../lib/text.ts'
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
  let reading = $state(entry.kind === 'pattern' ? (entry.reading ?? '') : '')
  /* svelte-ignore state_referenced_locally */
  let meaning = $state(entry.meaning)
  /* svelte-ignore state_referenced_locally */
  let exampleTarget = $state(entry.example?.target ?? '')
  /* svelte-ignore state_referenced_locally */
  let exampleNative = $state(entry.example?.native ?? '')

  /*
   * A kanji entry has fields no other kind has, and had no branch here at all
   * — it fell through to the word fields, which showed an empty Kanji and Kana
   * box for a card that has neither, hid its readings and its vocabulary, and
   * left Save disabled so a typo in the meaning could not be corrected.
   *
   * Readings are edited as they are shown: ニチ・ジツ. Vocabulary is one word
   * per line, 単語・たんご・significado, because a grid of six inputs to add a
   * word is worse than a line you can type.
   */
  /* svelte-ignore state_referenced_locally */
  let character = $state(entry.kind === 'kanji' ? entry.character : '')
  /* svelte-ignore state_referenced_locally */
  let onReadings = $state(entry.kind === 'kanji' ? entry.on.join('・') : '')
  /* svelte-ignore state_referenced_locally */
  let kunReadings = $state(entry.kind === 'kanji' ? entry.kun.join('・') : '')
  /* svelte-ignore state_referenced_locally */
  let vocabulary = $state(
    entry.kind === 'kanji'
      ? entry.vocabulary.map((v) => `${v.word}・${v.reading}・${v.meaning}`).join('\n')
      : '',
  )



  const canSave = $derived.by(() => {
    if (!meaning.trim()) return false
    if (entry.kind === 'pattern') return pattern.trim().length > 0
    if (entry.kind === 'kanji') return character.trim().length > 0
    return (kanji || kana).trim().length > 0
  })

  function save() {
    if (!canSave) return
    /*
     * `note` is deliberately absent. It is set by the importer for the two
     * halves of a verb pair and shown on the card, but there is nothing here
     * worth editing by hand — and leaving it out of the patch is what
     * *preserves* it, since updateEntry merges. Sending `note: undefined`,
     * which an empty field did, wiped it.
     */
    const shared = {
      meaning: meaning.trim(),
      example: exampleTarget.trim()
        ? { target: exampleTarget.trim(), native: exampleNative.trim() }
        : null,
    }
    if (entry.kind === 'kanji') {
      // `strokes` is left out on purpose: it is not editable here, and
      // omitting it is what keeps it.
      store.updateEntry(entry.id, {
        ...shared,
        character: character.trim(),
        on: splitReadings(onReadings),
        kun: splitReadings(kunReadings),
        vocabulary: parseVocabulary(vocabulary),
      } as Partial<Entry>)
      onDone()
      return
    }

    const patch =
      entry.kind === 'pattern'
        ? {
            ...shared,
            pattern: pattern.trim(),
            // Undefined rather than '' so a pattern with nothing to read has
            // no reading at all, the way a kana-only word has no kanji.
            reading: reading.trim() || undefined,
          }
        : {
            ...shared,
            // A word written only in kana keeps kanji null rather than ''.
            kanji: kanji.trim() || null,
            kana: kana.trim() || kanji.trim(),
          }
    store.updateEntry(entry.id, patch as Partial<Entry>)
    onDone()
  }

  /**
   * Delete works the same on every card.
   *
   * Where a card came from — the bundled file or the Add screen — is a fact
   * about this app's plumbing, not about the card, and it has no business
   * showing up in what you are allowed to do with it. The store records the
   * id so a bundled card stays gone; see store.deleteEntry.
   */
  function remove() {
    if (!confirm(`Delete "${cardFront(entry)}" and its review history?`)) return
    store.deleteEntry(entry.id)
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
    {#if entry.kind === 'kanji'}
      <div>
        <label for="e-char">Carácter</label>
        <input id="e-char" class="jp" bind:value={character} maxlength="1" />
      </div>
      <div>
        <label for="e-meaning-k">Meaning</label>
        <input id="e-meaning-k" bind:value={meaning} placeholder="required" />
      </div>
      <div>
        <label for="e-on">音読み</label>
        <input id="e-on" class="jp" bind:value={onReadings} placeholder="ニチ・ジツ" />
      </div>
      <div>
        <label for="e-kun">訓読み</label>
        <input id="e-kun" class="jp" bind:value={kunReadings} placeholder="ひ・び・か" />
      </div>
      <div class="wide">
        <label for="e-vocab">Vocabulario</label>
        <textarea
          id="e-vocab"
          class="jp vocab-field"
          bind:value={vocabulary}
          placeholder="日本・にほん・Japón"
        ></textarea>
      </div>
    {:else if entry.kind === 'pattern'}
      <div class="wide">
        <label for="e-pattern">Pattern</label>
        <input id="e-pattern" class="jp" bind:value={pattern} />
      </div>
      <div class="wide">
        <label for="e-reading">Reading</label>
        <input
          id="e-reading"
          class="jp"
          bind:value={reading}
          placeholder={hasKanji(pattern) ? 'required — the pattern has kanji' : 'optional'}
        />
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

    {#if entry.kind !== 'kanji'}
      <div class="wide">
        <label for="e-meaning">Meaning</label>
        <input id="e-meaning" bind:value={meaning} placeholder="required" />
      </div>
    {/if}

    <div class="wide">
      <label for="e-ex">Example</label>
      <input id="e-ex" class="jp" bind:value={exampleTarget} />
    </div>

    <div class="wide">
      <label for="e-exn">Example translation</label>
      <input id="e-exn" bind:value={exampleNative} />
    </div>

  </div>

  <div class="row actions">
    <button class="primary" onclick={save} disabled={!canSave}>Save</button>
    <button class="ghost" onclick={onDone}>Cancel</button>
    <span class="spacer"></span>
    <!-- A bin rather than the word: it sits beside Save and Cancel, and of the
         three it is the one you should not be able to press by reading fast. -->
    <button
      class="ghost danger icon"
      onclick={remove}
      title="Delete this card"
      aria-label="Delete this card"
    >
      <Trash2 size={16} />
    </button>
  </div>
</form>

<style>
  /*
   * Fills the card, so the actions can sit on the bottom edge rather than
   * wherever the last field happened to end. A pattern card has two fewer
   * fields than a kanji one; without this the buttons moved up the card
   * depending on which kind you opened.
   */
  .editor {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    min-height: 100%;
  }

  /*
   * Sized in line units, not rows.
   *
   * `rows` counts lines at the font's own metrics, but .jp sets line-height
   * 1.4, so four rows came out shorter than four lines and the fourth was
   * sliced in half. `lh` measures the line box actually in use.
   *
   * Three lines by default, which is what leaves Save, Cancel and the bin
   * visible without scrolling the card — the form was overflowing by 7px at
   * four. It deliberately does not grow with its content: a field that resizes
   * itself would push the buttons back off the bottom as you typed. Drag it
   * when you want to see more; the rest scrolls behind it.
   */
  .vocab-field {
    height: calc(3lh + 1.1rem);
    min-height: calc(2lh + 1.1rem);
    overflow-y: auto;
    resize: vertical;
    line-height: 1.4;
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
    margin-top: auto;
  }

  .danger {
    color: var(--again);
    border-color: transparent;
    padding: 0.3rem 0.5rem;
  }

  .danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--again) 12%, transparent);
    border-color: transparent;
  }
</style>
