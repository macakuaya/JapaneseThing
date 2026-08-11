// SM-2 with Anki-style learning steps.
//
// Every function here is pure: state in, state out, `now` and `rand` injected.
// That keeps the scheduler unit-testable without a DOM or a clock, which
// matters because scheduling bugs are invisible until weeks of progress are
// already wrong.

import type { CardState, Grade, Maturity, Settings, Stage } from './types.ts'

export const MINUTE = 60_000
export const DAY = 86_400_000

/** Sub-day steps a new card walks before graduating to daily intervals. */
export const GRADUATING_INTERVAL = 1
export const EASY_INTERVAL = 4
export const MIN_EASE = 1.3
export const START_EASE = 2.5

/** Below this many days a review card still counts as "young". */
export const MATURE_DAYS = 21

export function newCardState(key: string, now: number): CardState {
  return {
    key,
    stage: 'new',
    due: now,
    interval: 0,
    ease: START_EASE,
    reps: 0,
    lapses: 0,
    step: 0,
    lastReviewed: null,
  }
}

/**
 * ±5% jitter on multi-day intervals so a big study day doesn't reappear as a
 * single spike weeks later. Short intervals are left alone — fuzzing 1 day is
 * pointless and makes tests noisy.
 */
function fuzz(days: number, rand: () => number): number {
  if (days < 2.5) return days
  return days * (1 + (rand() * 2 - 1) * 0.05)
}

const clampEase = (e: number) => Math.max(MIN_EASE, e)

export function applyGrade(
  state: CardState,
  grade: Grade,
  now: number = Date.now(),
  rand: () => number = Math.random,
): CardState {
  const next: CardState = { ...state, reps: state.reps + 1, lastReviewed: now }

  const schedule = (days: number) => {
    next.stage = 'review'
    next.step = 0
    next.interval = Math.max(1, fuzz(days, rand))
    next.due = now + next.interval * DAY
  }

  if (grade === 'hard') {
    /*
     * The one answer that means "that did not go well".
     *
     * It never schedules the card forward — the session puts it back in the
     * queue and you see it again before you finish. What it does change is
     * next time: the gap it had earned is halved and its multiplier drops, so
     * a card you keep struggling with keeps coming back sooner.
     *
     * A card still new stays new. It has no gap to halve, and it has not yet
     * shown it is worth scheduling.
     */
    next.lapses = state.lapses + 1
    next.ease = clampEase(state.ease - 0.2)
    if (state.stage === 'review') {
      next.interval = Math.max(1, state.interval * 0.5)
      next.due = now + next.interval * DAY
    } else {
      next.due = now
    }
    return next
  }

  if (state.stage === 'new') {
    schedule(grade === 'easy' ? EASY_INTERVAL : GRADUATING_INTERVAL)
    return next
  }

  if (grade === 'easy') {
    next.ease = state.ease + 0.15
    schedule(state.interval * next.ease * 1.3)
  } else {
    schedule(state.interval * state.ease)
  }
  return next
}

/**
 * What each button would do, for the labels under Hard/Good/Easy.
 *
 * Hard is labelled by what you will actually experience — the card comes back
 * in this session — rather than by the delay it computes, which is zero and
 * would read as "<1m".
 *
 * A fixed rand so the preview matches what happens for short intervals and
 * doesn't jitter between re-renders for long ones.
 */
export function previewIntervals(
  state: CardState,
  now: number = Date.now(),
): Record<Grade, string> {
  const grades: Grade[] = ['hard', 'good', 'easy']
  const out = {} as Record<Grade, string>
  for (const g of grades) {
    const after = applyGrade(state, g, now, () => 0.5)
    out[g] = g === 'hard' ? 'again now' : formatDelay(after.due - now)
  }
  return out
}

export function formatDelay(ms: number): string {
  const min = ms / MINUTE
  if (min < 1) return '<1m'
  if (min < 60) return `${Math.round(min)}m`
  const hours = min / 60
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)}d`
  const months = days / 30.44
  if (months < 12) return `${months.toFixed(months < 10 ? 1 : 0)}mo`
  return `${(days / 365.25).toFixed(1)}y`
}

// ---------------------------------------------------------------------------
// Day boundaries
// ---------------------------------------------------------------------------

/**
 * Epoch ms of the start of the study day containing `now`. Anki convention:
 * the day rolls over at 04:00 local, so a 2am session still counts as the
 * previous day.
 */
export function dayStart(now: number, hour: number): number {
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0)
  if (d.getTime() < start.getTime()) start.setDate(start.getDate() - 1)
  return start.getTime()
}

export const dayEnd = (now: number, hour: number): number => dayStart(now, hour) + DAY

/** Ready right now — used to order the live session queue. */
export const isDueNow = (s: CardState, now: number): boolean =>
  s.stage !== 'new' && s.due <= now

/** Will come up before the day rolls over — used for the Home counts. */
export const isDueToday = (s: CardState, now: number, hour: number): boolean =>
  s.stage !== 'new' && s.due < dayEnd(now, hour)

// ---------------------------------------------------------------------------
// Maturity
// ---------------------------------------------------------------------------

export function maturityOf(state: CardState | undefined, settings: Settings): Maturity {
  if (!state || state.stage === 'new') return 'new'
  if (state.lapses >= settings.leechThreshold) return 'leech'
  return state.interval >= MATURE_DAYS ? 'mature' : 'young'
}

export const STAGE_LABEL: Record<Stage, string> = {
  new: 'New',
  review: 'Review',
}

export const MATURITY_LABEL: Record<Maturity, string> = {
  new: 'New',
  young: 'Young',
  mature: 'Mature',
  leech: 'Leech',
}
