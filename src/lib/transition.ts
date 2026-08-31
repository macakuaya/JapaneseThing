// View Transitions, used to grow a Home card into the card you're studying.
//
// The browser snapshots the page before and after the DOM changes, then
// animates between the two. Elements that share a `view-transition-name` are
// matched and morphed into one another — so the tapped deck and the flashcard
// carry the same name, and one becomes the other rather than the screen
// cutting.

import { tick } from 'svelte'
import { store } from './store.svelte.ts'

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
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * How long the contents take to leave and to arrive.
 *
 * Read from the stylesheet rather than declared here, because the fade itself
 * is a CSS transition — two numbers that must match are one number if the code
 * asks the CSS what it is doing.
 */
const fadeMs = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--morph-fade')) || 0

/**
 * A deck opening into a card, or a card closing back into its deck.
 *
 * Three beats, not one: the contents fade out, then the empty shape travels
 * and resizes, then the new contents fade in. The default — cross-fading the
 * two snapshots while they move — shows a deck's title stretching into a
 * card's question, which reads as text being distorted rather than as one
 * object becoming another.
 *
 * The emptying is why this exists at all. A view transition animates
 * snapshots, and a snapshot is whatever the element contained at the moment it
 * was taken; there is no way to move an element's box while leaving its text
 * behind. So the text is taken out of the DOM's way first, and what travels is
 * a card with nothing on it.
 */
export async function morph(update: () => void): Promise<void> {
  if (reduced()) {
    update()
    await tick()
    return
  }

  store.morphHidden = true
  await tick()
  await wait(fadeMs())

  await withViewTransition(update)

  // The new side mounted hushed, so this is the third beat rather than a
  // cleanup: whatever the card now holds fades in where the old contents left.
  store.morphHidden = false
}

export async function withViewTransition(update: () => void): Promise<void> {
  const doc = document as WithTransitions

  if (!doc.startViewTransition || reduced()) {
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
