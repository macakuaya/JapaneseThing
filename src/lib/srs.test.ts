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

describe('learning steps', () => {
  it('walks a new card through both steps before graduating', () => {
    const a = applyGrade(card(), 'good', T0, noFuzz)
    expect(a.stage).toBe('learning')
    expect(a.due - T0).toBe(10 * MINUTE)

    const b = applyGrade(a, 'good', a.due, noFuzz)
    expect(b.stage).toBe('review')
    expect(b.interval).toBe(1)
    expect(b.due - a.due).toBe(DAY)
  })

  it('sends "again" back to the first step', () => {
    const a = applyGrade(card(), 'good', T0, noFuzz)
    const b = applyGrade(a, 'again', a.due, noFuzz)
    expect(b.stage).toBe('learning')
    expect(b.step).toBe(0)
    expect(b.due - a.due).toBe(1 * MINUTE)
  })

  it('graduates immediately on "easy"', () => {
    const a = applyGrade(card(), 'easy', T0, noFuzz)
    expect(a.stage).toBe('review')
    expect(a.interval).toBe(4)
  })

  it('does not advance the step on "hard"', () => {
    const a = applyGrade(card(), 'good', T0, noFuzz) // step 1
    const b = applyGrade(a, 'hard', a.due, noFuzz)
    expect(b.stage).toBe('learning')
    expect(b.step).toBe(1)
  })
})

describe('review intervals', () => {
  const mature = card({ stage: 'review', interval: 10, ease: 2.5, reps: 5 })

  it('multiplies by ease on "good"', () => {
    const next = applyGrade(mature, 'good', T0, noFuzz)
    expect(next.interval).toBeCloseTo(25)
    expect(next.ease).toBe(2.5)
  })

  it('grows slowly and drops ease on "hard"', () => {
    const next = applyGrade(mature, 'hard', T0, noFuzz)
    expect(next.interval).toBeCloseTo(12)
    expect(next.ease).toBeCloseTo(2.35)
  })

  it('grows fastest and raises ease on "easy"', () => {
    const next = applyGrade(mature, 'easy', T0, noFuzz)
    expect(next.ease).toBeCloseTo(2.65)
    expect(next.interval).toBeCloseTo(10 * 2.65 * 1.3)
  })

  it('always moves a review card forward, even at minimum ease', () => {
    const stuck = card({ stage: 'review', interval: 1, ease: MIN_EASE })
    for (const grade of ['hard', 'good', 'easy'] as Grade[]) {
      expect(applyGrade(stuck, grade, T0, noFuzz).interval).toBeGreaterThan(1)
    }
  })
})

describe('lapses', () => {
  const mature = card({ stage: 'review', interval: 20, ease: 2.5, reps: 8 })

  it('halves the interval once and enters relearning', () => {
    const lapsed = applyGrade(mature, 'again', T0, noFuzz)
    expect(lapsed.stage).toBe('relearning')
    expect(lapsed.lapses).toBe(1)
    expect(lapsed.interval).toBe(10)
    expect(lapsed.ease).toBeCloseTo(2.3)
    expect(lapsed.due - T0).toBe(10 * MINUTE)
  })

  it('does not halve again when graduating out of relearning', () => {
    const lapsed = applyGrade(mature, 'again', T0, noFuzz)
    const back = applyGrade(lapsed, 'good', lapsed.due, noFuzz)
    expect(back.stage).toBe('review')
    expect(back.interval).toBe(10)
  })

  it('keeps ease at the floor no matter how many lapses', () => {
    let s = card({ stage: 'review', interval: 20, ease: 2.5 })
    for (let i = 0; i < 20; i++) {
      s = applyGrade(s, 'again', s.due, noFuzz)
      s = applyGrade(s, 'good', s.due, noFuzz)
    }
    expect(s.ease).toBe(MIN_EASE)
    expect(s.interval).toBeGreaterThanOrEqual(1)
  })

  it('never lets the interval fall below one day', () => {
    const s = walk(card({ stage: 'review', interval: 1, ease: 1.3 }), ['again', 'good'])
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
    expect(maturityOf(card({ stage: 'learning' }), s)).toBe('learning')
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
    expect(p).toEqual({ again: '10m', hard: '12d', good: '25d', easy: '1.1mo' })
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
