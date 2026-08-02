<script lang="ts">
  import type { CardState, Grade } from '../lib/types.ts'
  import { previewIntervals } from '../lib/srs.ts'

  interface Props {
    state: CardState
    /** Scheduling mode shows four buttons; practice shows a simple pass/fail. */
    writeThrough: boolean
    now: number
    onGrade: (grade: Grade) => void
  }

  const { state, writeThrough, now, onGrade }: Props = $props()

  const preview = $derived(writeThrough ? previewIntervals(state, now) : null)

  const SCHEDULING: { grade: Grade; label: string; key: string }[] = [
    { grade: 'again', label: 'Again', key: '1' },
    { grade: 'hard', label: 'Hard', key: '2' },
    { grade: 'good', label: 'Good', key: '3' },
    { grade: 'easy', label: 'Easy', key: '4' },
  ]

  // Without scheduling there is no consumer for four-way granularity, so
  // practice collapses to the only distinction that still means something.
  const PRACTICE: { grade: Grade; label: string; key: string }[] = [
    { grade: 'again', label: 'Missed', key: '1' },
    { grade: 'good', label: 'Got it', key: '2' },
  ]

  const buttons = $derived(writeThrough ? SCHEDULING : PRACTICE)
</script>

<div class="grader" class:two={!writeThrough}>
  {#each buttons as b (b.grade)}
    <button class={b.grade} onclick={() => onGrade(b.grade)}>
      <span class="label">{b.label}</span>
      <span class="sub">{preview ? preview[b.grade] : b.key}</span>
    </button>
  {/each}
</div>

<style>
  .grader {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .grader.two {
    grid-template-columns: repeat(2, 1fr);
  }

  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.7rem 0.3rem;
  }

  /* Not decoration: the label colour IS the grade, so it carries meaning that
     no fill or spacing conveys. Tinting the text beats an outline. */
  .label {
    font-weight: 600;
    font-size: 0.92rem;
  }

  .sub {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .again .label {
    color: var(--again);
  }
  .hard .label {
    color: var(--hard);
  }
  .good .label {
    color: var(--good);
  }
  .easy .label {
    color: var(--easy);
  }
</style>
