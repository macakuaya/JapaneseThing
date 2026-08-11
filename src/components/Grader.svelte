<script lang="ts">
  import type { CardState, Grade } from '../lib/types.ts'
  import { previewIntervals } from '../lib/srs.ts'

  interface Props {
    state: CardState
    /** Scheduling mode shows four buttons; practice shows a simple pass/fail. */
    writeThrough: boolean
    now: number
    /**
     * The grade being committed right now, shown filled. Owned by the session
     * rather than here so a number key lights the same button a click does.
     */
    pressed?: Grade | null
    onGrade: (grade: Grade) => void
  }

  const { state, writeThrough, now, pressed = null, onGrade }: Props = $props()

  const preview = $derived(writeThrough ? previewIntervals(state, now) : null)

  const SCHEDULING: { grade: Grade; label: string; key: string }[] = [
    { grade: 'hard', label: 'Hard', key: '1' },
    { grade: 'good', label: 'Good', key: '2' },
    { grade: 'easy', label: 'Easy', key: '3' },
  ]

  // Without scheduling there is no consumer for four-way granularity, so
  // practice collapses to the only distinction that still means something.
  const PRACTICE: { grade: Grade; label: string; key: string }[] = [
    { grade: 'hard', label: 'Missed', key: '1' },
    { grade: 'good', label: 'Got it', key: '2' },
  ]

  const buttons = $derived(writeThrough ? SCHEDULING : PRACTICE)
</script>

<div class="grader" class:two={!writeThrough}>
  {#each buttons as b (b.grade)}
    <button class={b.grade} class:on={pressed === b.grade} onclick={() => onGrade(b.grade)}>
      <span class="label">{b.label}</span>
      <span class="sub">{preview ? preview[b.grade] : b.key}</span>
    </button>
  {/each}
</div>

<style>
  .grader {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .grader.two {
    grid-template-columns: repeat(2, 1fr);
  }

  /*
   * The colour is feedback, not decoration.
   *
   * A tinted label sat there permanently and so said nothing about what you
   * had just done; the answer registered with no acknowledgement at all. Now
   * the four buttons rest identical and the one you choose floods with its
   * grade's colour for a moment before the next card arrives — the press is
   * confirmed by the thing you pressed.
   */
  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.7rem 0.3rem;
  }

  /*
   * Faster than the hold that follows it, so the button arrives at full colour
   * and stays there for a beat. A fade that is still running when the card
   * changes reads as a smear rather than as an answer being taken.
   */
  button,
  .label,
  .sub {
    transition: background 90ms ease-out, color 90ms ease-out;
  }

  .label {
    font-weight: 600;
    font-size: 0.92rem;
  }

  .sub {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  /* Hovering hints at the colour the press will bring, without the resting
     state having to carry it. */
  /* Hard is the one that means "that went badly" now that Again is gone, so
     it takes the red Again used to wear. */
  .hard:hover:not(:disabled) {
    background: color-mix(in srgb, var(--again) 18%, transparent);
    border-color: color-mix(in srgb, var(--again) 45%, transparent);
  }
  .good:hover:not(:disabled) {
    background: color-mix(in srgb, var(--good) 18%, transparent);
    border-color: color-mix(in srgb, var(--good) 45%, transparent);
  }
  .easy:hover:not(:disabled) {
    background: color-mix(in srgb, var(--easy) 18%, transparent);
    border-color: color-mix(in srgb, var(--easy) 45%, transparent);
  }

  /* Pressed wins over hover — the mouse is still on the button it just hit.
     Border matches the fill so the lit button has no rim of its own. */
  .hard.on,
  .hard.on:hover {
    background: var(--again);
    border-color: var(--again);
  }
  .good.on,
  .good.on:hover {
    background: var(--good);
    border-color: var(--good);
  }
  .easy.on,
  .easy.on:hover {
    background: var(--easy);
    border-color: var(--easy);
  }

  /* The grade colours are pale in the dark theme and deep in the light one, so
     the text on top has to flip with them. --on-accent already does exactly
     that, which is why it isn't spelled as a literal here. */
  .on .label,
  .on .sub {
    color: var(--on-accent);
  }

  @media (prefers-reduced-motion: reduce) {
    button,
    .label,
    .sub {
      transition: none;
    }
  }
</style>
