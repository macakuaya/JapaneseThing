<script lang="ts">
  // Something above the page, with a way out.
  //
  // Owns only the three things every overlay has to get right and none of them
  // interesting: a scrim you can click, Escape, and sitting above everything
  // else. What it holds is the caller's business.
  //
  // Extracted when the deck list needed one too, rather than growing a second
  // copy that would drift — the two would have disagreed about Escape first.

  import type { Snippet } from 'svelte'

  interface Props {
    onClose: () => void
    /** Where the panel sits: above the footer it opened from, or centred. */
    anchor?: 'bottom' | 'center'
    label: string
    children: Snippet
  }

  const { onClose, anchor = 'center', label, children }: Props = $props()

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    // Stops the session underneath from also reading it as "leave the run".
    event.stopPropagation()
    onClose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- A button rather than a div with a click handler: it is the way out, and
     that should be true for a keyboard as well as a mouse. -->
<button class="scrim" onclick={onClose} aria-label="Close"></button>

<div class="panel" class:bottom={anchor === 'bottom'} role="dialog" aria-modal="true" aria-label={label}>
  {@render children()}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    border: none;
    border-radius: 0;
    padding: 0;
    cursor: default;
  }

  .scrim:hover {
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    border: none;
  }

  .panel {
    position: fixed;
    z-index: 41;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-height: calc(100dvh - 2rem);
    animation: rise 180ms ease-out;
  }

  /* Comes up from the footer it was opened from, rather than appearing in the
     middle of the screen with no relationship to the thing you clicked. */
  .panel.bottom {
    top: auto;
    bottom: 3.5rem;
    transform: translateX(-50%);
    animation: rise-bottom 180ms ease-out;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-50% + 8px));
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  @keyframes rise-bottom {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel {
      animation: none;
    }
  }
</style>
