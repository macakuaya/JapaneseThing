// A deck opening into the card you're studying, and closing back into itself.
//
// The browser snapshots the page before and after a DOM change, then animates
// between the two. Elements sharing a `view-transition-name` are matched and
// morphed into one another — so the tapped deck and the flashcard carry the
// same name, and one becomes the other rather than the screen cutting.

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

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The timings, read from the stylesheet rather than declared here.
 *
 * The fade is a CSS transition and the travel is a CSS animation; this file
 * only decides when each one starts. Two numbers that have to agree are one
 * number if the code asks the CSS what it is doing.
 */
const ms = (name: string) =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0

/**
 * How long the travel will actually take, asked of the running animation
 * rather than of the stylesheet.
 *
 * `--morph-travel` sets it, but only if custom properties reach the
 * view-transition pseudo tree — they should, since it hangs off the root
 * element and inherits from it, but if they ever didn't the rule would fall
 * back to the UA default and the arrival would start early with nothing to
 * show for it. Reading the animation is the same number when that works and
 * the right number when it doesn't.
 */
function travelMs(): number {
  // `pseudoElement` is on KeyframeEffect rather than the AnimationEffect base
  // the DOM types hand back, so it has to be asked for by name.
  const group = document
    .getAnimations()
    .find(
      (a) =>
        (a.effect as { pseudoElement?: string | null } | null)?.pseudoElement ===
        `::view-transition-group(${MORPH})`,
    )
  const duration = group?.effect?.getComputedTiming().duration
  return typeof duration === 'number' && duration > 0 ? duration : ms('--morph-travel')
}

/**
 * A deck opening into a card, or a card closing back into its deck.
 *
 * Three beats rather than one: the contents fade out, the empty shape travels
 * and resizes, the new contents fade in. The default — cross-fading the two
 * snapshots while they move — shows a deck's title stretching into a card's
 * question, which reads as text being distorted rather than as one object
 * becoming another.
 *
 * The emptying is the whole trick, and it has to happen in the DOM. A view
 * transition animates snapshots, and a snapshot carries whatever the element
 * contained at the moment it was taken; there is no way to move an element's
 * box and leave its text behind. So the text is moved out of the way first,
 * and what travels is a card with nothing written on it.
 */
export async function morph(update: () => void): Promise<void> {
  const doc = document as WithTransitions

  if (!doc.startViewTransition || reduced()) {
    update()
    await tick()
    return
  }

  // First beat. This one cannot overlap what follows: the snapshot is taken
  // the moment the transition starts, so anything still legible on the card
  // then is captured and stretched — the exact artefact this avoids.
  store.morphHidden = true
  await tick()
  await wait(ms('--morph-fade'))

  const transition = doc.startViewTransition(async () => {
    update()
    // Svelte applies DOM changes on the microtask queue, so the snapshot has
    // to wait for them or it captures the old view twice.
    await tick()
  })

  try {
    // `ready` resolves when the pseudo-element tree exists and the travel
    // starts, which is what the arrival is timed against.
    await transition.ready
    await wait(Math.max(0, travelMs() - ms('--morph-overlap')))
  } catch {
    // Skipped — a second transition interrupted it, or the tab is in the
    // background, where the browser doesn't run these at all. Either way the
    // DOM is already updated, so all that's left is to put the contents back.
  }

  /*
   * Third beat, and it starts fractionally before the second ends.
   *
   * Waiting for the shape to stop first read as two things happening in
   * sequence rather than one thing arriving. Coming in over the tail of the
   * travel ties them together — and by then the easing has the card at ~94% of
   * its final size, so nothing legible is being scaled.
   */
  store.morphHidden = false

  try {
    await transition.finished
  } catch {
    // Interrupted; nothing to clean up.
  }
}
