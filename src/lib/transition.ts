// View Transitions, used to grow a Home card into the card you're studying.
//
// The browser snapshots the page before and after the DOM changes, then
// animates between the two. Elements that share a `view-transition-name` are
// matched and morphed into one another — so the tapped deck and the flashcard
// carry the same name, and one becomes the other rather than the screen
// cutting.

import { tick } from 'svelte'

/** The shared name. Only one element may claim it at a time. */
export const MORPH = 'card-morph'

interface ViewTransition {
  finished: Promise<void>
  ready: Promise<void>
}

type WithTransitions = Document & {
  startViewTransition?: (cb: () => Promise<void> | void) => ViewTransition
}

/**
 * Run a DOM update inside a view transition, falling back to a plain update
 * where the API is missing (Firefox at time of writing) or where the user has
 * asked for reduced motion. The fallback is the *whole* feature degrading
 * cleanly, not a broken animation.
 */
export async function withViewTransition(update: () => void): Promise<void> {
  const doc = document as WithTransitions
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!doc.startViewTransition || reduced) {
    update()
    await tick()
    return
  }

  const transition = doc.startViewTransition(async () => {
    update()
    // Svelte applies DOM changes on the microtask queue, so the snapshot has
    // to wait for them or it captures the old view twice.
    await tick()
  })

  try {
    await transition.finished
  } catch {
    // Interrupted by another transition; nothing to clean up.
  }
}
