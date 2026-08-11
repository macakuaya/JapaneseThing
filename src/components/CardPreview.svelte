<script lang="ts">
  // An entry from the deck list, shown as the card it is.
  //
  // Not a dialog over the list. It was one, and the result was a second style
  // of card: its own size, its own close button, its own kebab sitting on the
  // card face. There is one card in this app and this is it — same shape, same
  // place on screen, same header above it, differing only in that browsing is
  // not answering, so there is nothing to grade.
  //
  // The page behind is covered rather than dimmed. A scrim says "you are still
  // in the list, temporarily"; you are not, you are looking at a card.

  import Flashcard from './Flashcard.svelte'
  import { newCardState } from '../lib/srs.ts'
  import { store } from '../lib/store.svelte.ts'
  import type { Entry } from '../lib/types.ts'

  interface Props {
    entry: Entry
    onClose: () => void
  }

  const { entry, onClose }: Props = $props()

  const key = $derived(`${entry.id}:recognition`)
  const card = $derived({
    key,
    entry,
    direction: 'recognition' as const,
    state: store.srs[key] ?? newCardState(key, store.now),
  })

  /*
   * Clear the flag when this leaves the screen, however it leaves.
   *
   * `close()` handled the ways out from here — Escape, a click off the card —
   * but not navigating away: tapping 語 unmounted this and left previewId set,
   * so the header went on believing a card was open and kept Deck, Add and
   * Settings hidden behind a kebab that edited nothing.
   */
  $effect(() => () => {
    store.previewId = null
    store.previewEditing = false
  })

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    // Escape backs out of the editor first, then out of the card.
    if (store.previewEditing) store.previewEditing = false
    else onClose()
  }

  /** Anywhere off the card closes it, as it does during a session. */
  function onWindowClick(event: MouseEvent) {
    if (store.previewEditing) return
    const target = event.target as HTMLElement | null
    if (!target || !target.isConnected) return
    if (target.closest('.card, nav, .panel')) return
    onClose()
  }
</script>

<svelte:window onkeydown={onKeydown} onclick={onWindowClick} />

<div class="page">
  <div class="stage">
    <Flashcard
      {card}
      revealed
      readOnly
      editing={store.previewEditing}
      onEditDone={() => (store.previewEditing = false)}
    />
  </div>
</div>

<style>
  /*
   * Opaque, and below the header's z-index so 語 and the kebab stay on top of
   * it — the same relationship a session has with the header.
   */
  .page {
    position: fixed;
    inset: 0;
    z-index: 5;
    background: var(--bg);
    animation: fade 140ms ease-out;
  }

  .stage {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
    }
  }
</style>
