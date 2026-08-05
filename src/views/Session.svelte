<script lang="ts">
  import Flashcard from '../components/Flashcard.svelte'
  import {
    type Card,
    type SessionConfig,
    buildQueue,
    rehydrateQueue,
    requeue,
  } from '../lib/session.ts'
  import { dayStart } from '../lib/srs.ts'
  import { store } from '../lib/store.svelte.ts'
  import * as storage from '../lib/storage.ts'
  import type { CardState, Grade, ReviewLogEntry } from '../lib/types.ts'

  interface Props {
    config: SessionConfig
    /** Distinguishes a stored review session from a stored practice one. */
    mode: 'review' | 'practice'
    /** Needed to enforce the daily new-card limit across sessions. */
    log?: ReviewLogEntry[]
    onExit: () => void
  }

  const { config, mode, log = [], onExit }: Props = $props()

  interface HistoryStep {
    card: Card
    /** null when the card had never been reviewed before this answer. */
    previous: CardState | null
    queue: Card[]
    index: number
    wasCorrect: boolean
  }

  /**
   * Resume an interrupted session rather than starting over.
   *
   * Leaving mid-review and coming back used to rebuild the queue from scratch,
   * which re-showed cards already answered — their learning steps fall due in
   * a minute or two, so they were still "due today". Only a session from the
   * same study day and the same mode is resumed; anything older starts fresh.
   */
  // Snapshotted on purpose: the fingerprint identifies the queue we started
  // with, so it must not drift if settings change mid-session.
  // svelte-ignore state_referenced_locally
  const fingerprint = JSON.stringify(config)

  function initialQueue(): { queue: Card[]; answered: number; correct: number; startedWith: number } {
    const now = Date.now()
    const saved = storage.loadSession()
    const today = dayStart(now, store.settings.dayStartHour)

    if (
      saved &&
      saved.mode === mode &&
      saved.fingerprint === fingerprint &&
      saved.day === today &&
      saved.queue.length
    ) {
      const restored = rehydrateQueue(saved.queue, store.dataset, store.srs, store.settings, now)
      if (restored.length) {
        return {
          queue: restored,
          answered: saved.answered,
          correct: saved.correct,
          startedWith: saved.startedWith,
        }
      }
    }

    const fresh = buildQueue(store.dataset, store.srs, store.settings, config, now, Math.random, log)
    return { queue: fresh, answered: 0, correct: 0, startedWith: fresh.length }
  }

  // svelte-ignore state_referenced_locally
  const initial = initialQueue()

  let queue = $state<Card[]>(initial.queue)

  /**
   * Where you are looking, which is not the same as what you have answered.
   * The arrow keys move this cursor through the queue so you can page over the
   * deck; only grading removes a card and moves the progress bar.
   */
  let index = $state(0)

  /**
   * Revealed cards, by key. Kept as a set rather than a single flag so that
   * paging away from a card you have already turned over and back again shows
   * it turned over — hiding it again would be a small lie about what you know.
   */
  let revealedKeys = $state(new Set<string>())
  // Undo history is intentionally not persisted: it holds queue snapshots, and
  // being able to undo across an app restart isn't worth storing them.
  let history = $state<HistoryStep[]>([])
  let answered = $state(initial.answered)
  let correct = $state(initial.correct)
  let now = $state(Date.now())

  // The size of the deck we were handed, used only to tell "you finished" from
  // "there was nothing to do". Must not track the shrinking queue.
  const startedWith = initial.startedWith

  /** Persist after every answer, so even a crash resumes in the right place. */
  function persist() {
    if (!queue.length) {
      storage.clearSession()
      return
    }
    storage.saveSession({
      mode,
      fingerprint,
      queue: queue.map((c) => c.key),
      answered,
      correct,
      startedWith,
      day: dayStart(Date.now(), store.settings.dayStartHour),
    })
  }

  // Record the starting queue immediately: quitting before the first answer
  // should still resume, not restart.
  persist()

  // Publish the counter to the app header, which owns the only header on
  // screen while a session is running. Cleared on the way out so the header
  // goes back to being navigation.
  $effect(() => {
    store.sessionStatus = { answered, left: queue.length }
    return () => {
      store.sessionStatus = null
    }
  })
  const current = $derived(queue[Math.min(index, queue.length - 1)] ?? null)
  const done = $derived(queue.length === 0)
  const revealed = $derived(current ? revealedKeys.has(current.key) : false)

  // Cards re-enter the queue during learning steps, so "answered" can exceed
  // the starting count. Progress tracks work done against work remaining.
  const progress = $derived(
    Math.round((answered / Math.max(1, answered + queue.length)) * 100),
  )

  function reveal() {
    if (!current || revealed) return
    revealedKeys = new Set(revealedKeys).add(current.key)
    now = Date.now()
  }

  /** Page through the queue without answering anything. */
  function move(delta: number) {
    if (queue.length < 2) return
    index = Math.min(Math.max(index + delta, 0), queue.length - 1)
    now = Date.now()
  }

  function grade(g: Grade) {
    const card = current
    if (!card || !revealed) return

    const at = Date.now()
    const previous = store.srs[card.key] ?? null
    const nextState = store.grade(card, g, config.writeThrough, at)

    // Snapshotting the queue array is safe because it is only ever replaced,
    // never mutated in place — so undo gets the exact deck it had before.
    // svelte-ignore state_referenced_locally
    history = [...history, { card, previous, queue, index, wasCorrect: g !== 'again' }]
    answered++
    if (g !== 'again') correct++

    if (config.writeThrough) {
      queue = requeue(queue, index, { ...card, state: nextState }, at)
    } else {
      // Practice never reschedules, so a missed card simply comes round again
      // at the back of the deck.
      const rest = queue.toSpliced(index, 1)
      queue = g === 'again' ? [...rest, card] : rest
    }

    // The answered card left the queue, so the cursor now points at whatever
    // took its place. Clamp for the case where it was the last one.
    index = Math.min(index, Math.max(0, queue.length - 1))
    revealedKeys = new Set([...revealedKeys].filter((k) => k !== card.key))
    now = at
    persist()
  }

  function undo() {
    const last = history.at(-1)
    if (!last) return
    if (config.writeThrough) store.ungrade(last.card.key, last.previous)
    queue = last.queue
    index = last.index
    history = history.slice(0, -1)
    answered--
    if (last.wasCorrect) correct--
    revealedKeys = new Set(revealedKeys).add(last.card.key)
    now = Date.now()
    persist()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

    if (event.key === 'Escape') {
      event.preventDefault()
      onExit()
      return
    }
    // Arrows page through the deck. They neither reveal nor answer: looking
    // ahead at what is coming should cost nothing.
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(1)
      return
    }
    // Taking back the last answer is a different act from paging, so it keeps
    // its own key rather than sharing the left arrow.
    if (event.key === 'u' || event.key === 'Backspace') {
      event.preventDefault()
      undo()
      return
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      reveal()
      return
    }
    if (!revealed) return

    const grades: Grade[] = config.writeThrough
      ? ['again', 'hard', 'good', 'easy']
      : ['again', 'good']
    const index = Number(event.key) - 1
    if (Number.isInteger(index) && index >= 0 && index < grades.length) {
      event.preventDefault()
      grade(grades[index])
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section class="session">
  <!-- Pinned to the very top of the viewport and full-bleed, above the nav —
       a page-level loading bar rather than a widget inside the card column. -->
  <div
    class="bar"
    role="progressbar"
    aria-valuenow={progress}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label="Session progress"
  >
    <div class="fill" style:width="{progress}%"></div>
  </div>

  {#if done}
    <div class="summary card-surface">
      <h2>{startedWith === 0 ? 'Nothing to review' : 'Session complete'}</h2>
      {#if startedWith === 0}
        <p class="muted">
          No cards are due right now. Try free practice if you want to drill something specific.
        </p>
      {:else}
        <p class="score">{correct} / {answered}</p>
        <p class="muted">
          {answered} answer{answered === 1 ? '' : 's'}
          {config.writeThrough ? '· scheduling updated' : '· nothing scheduled'}
        </p>
      {/if}
      <button class="primary" onclick={onExit}>Done</button>
    </div>
  {:else if current}
    {#key current.key + ':' + index + ':' + answered}
      <Flashcard
        card={current}
        {revealed}
        writeThrough={config.writeThrough}
        {now}
        onReveal={reveal}
        onGrade={grade}
      />
    {/key}

    <p class="hint faint">
      {revealed ? 'number keys to grade' : 'space to reveal'} · ←→ browse the deck · Esc to exit
    </p>
  {/if}
</section>

<style>
  .session {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    /* Above the sticky nav (z-index 10) and the tooltip's word highlights,
       below the tooltip panel itself. */
    z-index: 60;
    background: transparent;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.25s ease;
  }

  .hint {
    margin: 0;
    font-size: 0.75rem;
    text-align: center;
  }

  .summary {
    padding: 2.5rem 1.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .summary p {
    margin: 0;
  }

  .score {
    font-size: 2.5rem;
    font-variant-numeric: tabular-nums;
  }

  .summary button {
    margin-top: 1rem;
    min-width: 140px;
  }

  @media (max-width: 480px) {
    .hint {
      display: none;
    }
  }
</style>
