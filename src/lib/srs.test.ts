import { describe, expect, it } from 'vitest'
import {
  DAY,
  MINUTE,
  MIN_EASE,
  applyGrade,
  dayEnd,
  dayStart,
  formatDelay,
  isDueToday,
  maturityOf,
  newCardState,
  previewIntervals,
} from './srs.ts'
import { DEFAULT_SETTINGS } from './types.ts'
import type { CardState, Grade } from './types.ts'

const T0 = new Date('2026-07-30T12:00:00').getTime()
const noFuzz = () => 0.5

const card = (over: Partial<CardState> = {}): CardState => ({
  ...newCardState('x:recognition', T0),
  ...over,
})

/** Walk a card through a sequence of grades, returning the final state. */
function walk(start: CardState, grades: Grade[], now = T0): CardState {
  let s = start
  let t = now
  for (const g of grades) {
    s = applyGrade(s, g, t, noFuzz)
    t = s.due
  }
  return s
}

describe('a new card', () => {
  it('is scheduled for tomorrow on "good" — no steps in between', () => {
    const a = applyGrade(card(), 'good', T0, noFuzz)
    expect(a.stage).toBe('review')
    expect(a.interval).toBe(1)
    expect(a.due - T0).toBe(DAY)
  })

  it('jumps straight to four days on "easy"', () => {
    const a = applyGrade(card(), 'easy', T0, noFuzz)
    expect(a.stage).toBe('review')
    expect(a.interval).toBe(4)
  })

  it('stays new on "hard" — it has not earned a gap yet', () => {
    // The session puts it back in the queue; nothing is scheduled, so it
    // cannot roll silently into tomorrow half-learned.
    const a = applyGrade(card(), 'hard', T0, noFuzz)
    expect(a.stage).toBe('new')
    expect(a.interval).toBe(0)
    expect(a.due).toBe(T0)
  })

  it('counts the attempt even when it stays new', () => {
    const a = applyGrade(card(), 'hard', T0, noFuzz)
    expect(a.reps).toBe(1)
    expect(a.lapses).toBe(1)
  })
})

describe('a scheduled card', () => {
  const young = card({ stage: 'review', interval: 10, ease: 2.5, reps: 4 })

  it('multiplies the gap by its ease on "good"', () => {
    expect(applyGrade(young, 'good', T0, noFuzz).interval).toBe(25)
  })

  it('multiplies further, and raises the ease, on "easy"', () => {
    const a = applyGrade(young, 'easy', T0, noFuzz)
    expect(a.ease).toBeCloseTo(2.65)
    expect(a.interval).toBeCloseTo(10 * 2.65 * 1.3)
  })

  it('halves the gap and drops the ease on "hard"', () => {
    const a = applyGrade(young, 'hard', T0, noFuzz)
    expect(a.interval).toBe(5)
    expect(a.ease).toBeCloseTo(2.3)
    expect(a.lapses).toBe(1)
  })

  it('schedules the halved gap, and leaves repeating to the session', () => {
    // "Later today" is the queue's job now, not a due date a few minutes out —
    // so the due date is the real next gap, and requeue decides the repeat.
    const a = applyGrade(young, 'hard', T0, noFuzz)
    expect(a.due - T0).toBe(5 * DAY)
  })

  it('keeps its stage on "hard" so the gap it earned is not thrown away', () => {
    expect(applyGrade(young, 'hard', T0, noFuzz).stage).toBe('review')
  })
})

describe('ease', () => {
  it('never falls below the floor, however often a card is missed', () => {
    let s = card({ stage: 'review', interval: 20, ease: 2.5 })
    for (let i = 0; i < 20; i++) {
      s = applyGrade(s, 'hard', s.due, noFuzz)
      s = applyGrade(s, 'good', s.due, noFuzz)
    }
    expect(s.ease).toBe(MIN_EASE)
  })

  it('never lets the gap fall below one day', () => {
    const s = walk(card({ stage: 'review', interval: 1, ease: 1.3 }), ['hard', 'good'])
    expect(s.interval).toBeGreaterThanOrEqual(1)
  })
})

describe('fuzz', () => {
  it('leaves short intervals exact', () => {
    const s = card({ stage: 'review', interval: 1, ease: 2 })
    expect(applyGrade(s, 'good', T0, () => 0).interval).toBe(2)
    expect(applyGrade(s, 'good', T0, () => 1).interval).toBe(2)
  })

  it('varies long intervals by at most 5%', () => {
    const s = card({ stage: 'review', interval: 100, ease: 2.5 })
    const low = applyGrade(s, 'good', T0, () => 0).interval
    const high = applyGrade(s, 'good', T0, () => 1).interval
    expect(low).toBeCloseTo(250 * 0.95, 5)
    expect(high).toBeCloseTo(250 * 1.05, 5)
  })
})

describe('day boundaries', () => {
  it('treats 02:00 as still the previous study day', () => {
    const lateNight = new Date('2026-07-30T02:00:00').getTime()
    expect(dayStart(lateNight, 4)).toBe(new Date('2026-07-29T04:00:00').getTime())
  })

  it('rolls over at the configured hour', () => {
    const morning = new Date('2026-07-30T09:00:00').getTime()
    expect(dayStart(morning, 4)).toBe(new Date('2026-07-30T04:00:00').getTime())
    expect(dayEnd(morning, 4)).toBe(new Date('2026-07-31T04:00:00').getTime())
  })

  it('counts a card due later today but excludes tomorrow', () => {
    const now = new Date('2026-07-30T09:00:00').getTime()
    const tonight = card({ stage: 'review', due: new Date('2026-07-30T23:00:00').getTime() })
    const tomorrow = card({ stage: 'review', due: new Date('2026-07-31T12:00:00').getTime() })
    expect(isDueToday(tonight, now, 4)).toBe(true)
    expect(isDueToday(tomorrow, now, 4)).toBe(false)
  })

  it('does not count new cards as due', () => {
    expect(isDueToday(card(), T0, 4)).toBe(false)
  })
})

describe('maturity', () => {
  const s = DEFAULT_SETTINGS

  it('classifies by interval and lapse count', () => {
    expect(maturityOf(undefined, s)).toBe('new')
    expect(maturityOf(card(), s)).toBe('new')
    expect(maturityOf(card({ stage: 'review', interval: 5 }), s)).toBe('young')
    expect(maturityOf(card({ stage: 'review', interval: 30 }), s)).toBe('mature')
  })

  it('flags a leech regardless of how long its interval is', () => {
    expect(maturityOf(card({ stage: 'review', interval: 60, lapses: 5 }), s)).toBe('leech')
  })
})

describe('previews', () => {
  it('labels every button and orders them by increasing delay', () => {
    const p = previewIntervals(card({ stage: 'review', interval: 10, ease: 2.5 }), T0)
    // Hard is labelled by what you will experience, not by the delay it
    // computes — that delay is the *next* gap, and the card is in front of you
    // again before then.
    expect(p).toEqual({ hard: 'again now', good: '25d', easy: '1.1mo' })
  })

  it('matches what grading actually does', () => {
    const s = card({ stage: 'review', interval: 10, ease: 2.5 })
    const actual = applyGrade(s, 'good', T0, () => 0.5)
    expect(previewIntervals(s, T0).good).toBe(formatDelay(actual.due - T0))
  })
})

describe('formatDelay', () => {
  it('picks a readable unit', () => {
    expect(formatDelay(30_000)).toBe('<1m')
    expect(formatDelay(10 * MINUTE)).toBe('10m')
    expect(formatDelay(3 * 3600_000)).toBe('3h')
    expect(formatDelay(5 * DAY)).toBe('5d')
    expect(formatDelay(60 * DAY)).toBe('2.0mo')
    expect(formatDelay(400 * DAY)).toBe('1.1y')
  })
})
