<script lang="ts">
  import { tick } from 'svelte'
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
  import { withViewTransition } from '../lib/transition.ts'
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

  // Tell the header to stand down to just 語 while this runs, and to go back
  // to being navigation on the way out.
  $effect(() => {
    store.sessionActive = true
    return () => {
      store.sessionActive = false
      store.sessionEditing = false
    }
  })

  // A different card means the editor was for the previous one. Closing it is
  // the only honest thing to do — leaving it open would show one card's fields
  // over another card's question.
  $effect(() => {
    void current?.key
    store.sessionEditing = false
  })
  /**
   * The card that emptied the deck, held so it stays on screen while the run
   * winds up. The queue is empty by then, and without this the card would be
   * unmounted before the closing animation had anything to animate.
   */
  let lastCard = $state<Card | null>(null)

  /**
   * The keyed block's key, frozen at the last answer.
   *
   * It normally includes `answered`, so incrementing it would tear down the
   * card and build a new one — in the frame before the closing animation, of
   * all frames. Freezing it means the element that goes home is the same
   * element you were just looking at, which is the entire point.
   */
  let frozenKey = $state<string | null>(null)

  /*
   * Falls back to the card that emptied the queue: finishing should not blank
   * the screen, it should send that card back to its deck.
   */
  const current = $derived(queue[Math.min(index, queue.length - 1)] ?? lastCard)
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

  /**
   * How long the pressed button stays lit before the next card replaces it.
   * Short enough to feel like the button responding rather than the app
   * hesitating — but it is a real delay on every answer, so it is one number
   * in one place.
   */
  const FLASH_MS = 150

  let pressed = $state<Grade | null>(null)


  /** Light the button, then commit. Also swallows a second press mid-flash. */
  function grade(g: Grade) {
    if (pressed || !current || !revealed) return
    pressed = g
    setTimeout(() => {
      pressed = null
      commit(g)
    }, FLASH_MS)
  }

  function commit(g: Grade) {
    const card = current
    if (!card || !revealed) return

    const key = `${card.key}:${index}:${answered}`
    const at = Date.now()
    const previous = store.srs[card.key] ?? null
    const nextState = store.grade(card, g, config.writeThrough, at)

    // Snapshotting the queue array is safe because it is only ever replaced,
    // never mutated in place — so undo gets the exact deck it had before.
    // svelte-ignore state_referenced_locally
    history = [...history, { card, previous, queue, index, wasCorrect: g !== 'hard' }]
    answered++
    if (g !== 'hard') correct++

    // A missed card comes round again before the session ends, whether or not
    // the answer changed its schedule.
    queue = requeue(queue, index, { ...card, state: nextState }, g === 'hard')

    // The answered card left the queue, so the cursor now points at whatever
    // took its place. Clamp for the case where it was the last one.
    index = Math.min(index, Math.max(0, queue.length - 1))
    now = at
    persist()

    if (!queue.length) {
      // Keep it exactly as it is — still face-up, still showing the grades it
      // was showing — and send it home. Clearing its reveal or handing it the
      // new schedule would change the card during its own exit.
      lastCard = card
      frozenKey = key
      finish()
      return
    }

    revealedKeys = new Set([...revealedKeys].filter((k) => k !== card.key))
  }

  function undo() {
    const last = history.at(-1)
    if (!last || pressed) return
    if (config.writeThrough) store.ungrade(last.card.key, last.previous)
    else store.unlog(last.card.key)
    queue = last.queue
    index = last.index
    history = history.slice(0, -1)
    answered--
    if (last.wasCorrect) correct--
    revealedKeys = new Set(revealedKeys).add(last.card.key)
    now = Date.now()
    persist()
  }

  /**
   * The last answer ends the run, so the card goes back where it came from.
   *
   * It used to turn over instead, with the tally printed on its back. The turn
   * read as the card contradicting itself — the same object, inverted, saying
   * something else — when what actually happened is that the deck is finished.
   * Reversing the motion that opened it says that without any words, and the
   * tally goes home too, on Home's status line.
   */
  function finish() {
    if (startedWith > 0) {
      store.lastRun = { correct, answered, counted: config.writeThrough }
    }
    dismiss()
  }

  /**
   * Leave the way we came in: the card shrinks back into the Home deck it grew
   * out of. Claiming the shared name on that deck has to happen before the
   * transition starts, and the deck only exists once Home has rendered — so
   * `store.morphing` is set first and Home picks it up inside the callback.
   */
  async function dismiss() {
    store.morphing = store.studySource
    await tick()
    await withViewTransition(onExit)
    store.morphing = null
    store.studySource = null
  }

  /**
   * Anywhere off the card is a way out. The card itself, the header and the
   * dictionary tooltip are not — those are things you are using, not the
   * backdrop behind them.
   */
  function onWindowClick(event: MouseEvent) {
    // With the editor open, an off-card click is far more likely to be a miss
    // than a request to throw away what you were typing.
    if (store.sessionEditing) return
    const target = event.target as HTMLElement | null
    if (!target || !target.isConnected) return
    if (target.closest('.card, nav, .panel')) return
    dismiss()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

    // While the editor is open it owns the keyboard: Escape closes it rather
    // than leaving the session, and nothing else reaches the card underneath.
    if (store.sessionEditing) {
      if (event.key === 'Escape') {
        event.preventDefault()
        store.sessionEditing = false
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      dismiss()
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

    const grades: Grade[] = config.writeThrough ? ['hard', 'good', 'easy'] : ['hard', 'good']
    const index = Number(event.key) - 1
    if (Number.isInteger(index) && index >= 0 && index < grades.length) {
      event.preventDefault()
      grade(grades[index])
    }
  }
</script>

<svelte:window onkeydown={onKeydown} onclick={onWindowClick} />

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

  <!--
    What the run did to your schedule, on the bottom edge with every other
    status line. "Scheduling updated / nothing scheduled" was Anki's word for
    it, sitting on the card as the smallest text on screen — and it was the
    one fact that actually mattered: whether the answers count.
  -->
  {#if current}
    <!-- Takes all the room between header and hint, and centres the card in it. -->
    <div class="stage">
      {#key frozenKey ?? `${current.key}:${index}:${answered}`}
        <Flashcard
          card={current}
          {revealed}
          writeThrough={config.writeThrough}
          {now}
          {pressed}
          editing={store.sessionEditing}
          onEditDone={() => (store.sessionEditing = false)}
          onReveal={reveal}
          onGrade={grade}
        />
      {/key}
    </div>

    <!--
      Where Home keeps its counts, saying the same kind of thing: what is left
      of the work in front of you. "Done" counts answers rather than distinct
      cards, so a card coming back for its next learning step counts each time
      — the progress bar measures the same, so the two never disagree.
    -->
    {#if !done}
      <p class="page-status">
        <span class="n">{answered}</span> done · <span class="n">{queue.length}</span> left
      </p>
    {/if}
  {:else}
    <!--
      Nothing was due. Not the end of a run — there was no run — so it is a
      plain line rather than a card, and there is nothing to send home.
    -->
    <div class="stage">
      <p class="idle muted">No cards are due right now.</p>
    </div>
  {/if}
</section>

<style>
  .session {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /*
   * The card is centred on the viewport itself, not on the space left over
   * after the header and the hint have taken their share. Those two float
   * above it at the edges, so the one thing you are looking at sits in the
   * true middle of the screen.
   *
   * Below the header's z-index, so 語 stays clickable where they meet.
   */
  .stage {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
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

  .idle {
    margin: 0;
    font-size: 0.9rem;
  }


</style>
