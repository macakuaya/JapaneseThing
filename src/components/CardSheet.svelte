<script lang="ts">
  // One entry, opened from the deck list — as the card it is, not as a form.
  //
  // The list used to expand a row into input fields, which meant the app had
  // two places to edit an entry and neither of them showed you the card you
  // were changing. Here the card is the thing on screen, and editing is a
  // state of it, reached from the kebab exactly as it is during a session.

  import { EllipsisVertical, X } from '@lucide/svelte'
  import Overlay from './Overlay.svelte'
  import Flashcard from './Flashcard.svelte'
  import { newCardState } from '../lib/srs.ts'
  import { store } from '../lib/store.svelte.ts'
  import type { Entry } from '../lib/types.ts'

  interface Props {
    entry: Entry
    onClose: () => void
    onDelete: () => void
  }

  const { entry, onClose, onDelete }: Props = $props()

  let editing = $state(false)

  /**
   * The card as recognition, revealed. Browsing is not a session, so this
   * borrows the scheduler's state only to render — nothing here writes.
   */
  const key = $derived(`${entry.id}:recognition`)
  const card = $derived({
    key,
    entry,
    direction: 'recognition' as const,
    state: store.srs[key] ?? newCardState(key, store.now),
  })
</script>

<Overlay onClose={editing ? () => (editing = false) : onClose} label={'Card'}>
  <div class="sheet">
    <div class="bar">
      <button
        class="ghost icon"
        class:on={editing}
        onclick={() => (editing = !editing)}
        title="Edit this card"
        aria-label="Edit this card"
      >
        <EllipsisVertical size={18} />
      </button>
      <button class="ghost icon" onclick={onClose} aria-label="Close"><X size={18} /></button>
    </div>

    <Flashcard
      {card}
      revealed
      readOnly
      {editing}
      onEditDone={() => (editing = false)}
    />

    {#if editing}
      <div class="row">
        <span class="spacer"></span>
        <button class="ghost danger tiny" onclick={onDelete}>Delete</button>
      </div>
    {/if}
  </div>
</Overlay>

<style>
  .sheet {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /*
   * In the card's own corner. Floated above it they were two loose icons over
   * whatever the overlay happened to be covering, belonging to nothing; here
   * the sheet is one object. A session's card keeps its corner clear because
   * the whole face is a tap target there — this one is only for reading.
   */
  .bar {
    position: absolute;
    top: 0.35rem;
    right: 0.4rem;
    z-index: 1;
    display: flex;
    gap: 0.1rem;
  }

  .bar :global(button) {
    color: var(--faint);
    padding: 0.35rem;
  }

  .bar :global(button:hover) {
    color: var(--text);
  }

  .row {
    display: flex;
    align-items: center;
  }

  .danger {
    color: var(--again);
    border-color: transparent;
  }

  .danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--again) 12%, transparent);
    border-color: transparent;
  }

  .tiny {
    padding: 0.2rem 0.5rem;
    font-size: 0.76rem;
  }
</style>
