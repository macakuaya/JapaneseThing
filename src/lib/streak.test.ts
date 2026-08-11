import { describe, expect, it } from 'vitest'
import { countByDay, heatmap, streaks } from './streak.ts'

const HOUR = 4
const DAY = 86_400_000

/** Noon on a fixed day, so nothing here depends on when the suite runs. */
const noon = (dayOffset: number) => new Date(2026, 6, 15, 12, 0, 0).getTime() + dayOffset * DAY
const answersOn = (offsets: number[]) => offsets.map((o) => ({ at: noon(o) }))

describe('counting the days you studied', () => {
  it('buckets answers by study day, oldest first', () => {
    const days = countByDay(answersOn([-2, -2, -1, 0, 0, 0]), HOUR)
    expect(days.map((d) => d.count)).toEqual([2, 1, 3])
  })

  it('counts a card answered after midnight toward the day before', () => {
    // 01:00 is still last night's session — the same boundary the due counts
    // use, or a late reviewer would break their streak every night.
    const lateNight = new Date(2026, 6, 15, 1, 30, 0).getTime()
    const theEvening = new Date(2026, 6, 14, 22, 0, 0).getTime()
    expect(countByDay([{ at: lateNight }, { at: theEvening }], HOUR)).toHaveLength(1)
  })

  it('separates them if the day starts at midnight instead', () => {
    const lateNight = new Date(2026, 6, 15, 1, 30, 0).getTime()
    const theEvening = new Date(2026, 6, 14, 22, 0, 0).getTime()
    expect(countByDay([{ at: lateNight }, { at: theEvening }], 0)).toHaveLength(2)
  })
})

describe('streaks', () => {
  it('is zero with nothing logged', () => {
    expect(streaks([], HOUR, noon(0))).toEqual({
      current: 0,
      longest: 0,
      activeDays: 0,
      total: 0,
    })
  })

  it('counts consecutive days up to today', () => {
    expect(streaks(answersOn([-2, -1, 0]), HOUR, noon(0)).current).toBe(3)
  })

  it('keeps the streak alive on a day you have not studied yet', () => {
    // Today isn't over. A run ending yesterday is still going.
    expect(streaks(answersOn([-2, -1]), HOUR, noon(0)).current).toBe(2)
  })

  it('ends the streak once a whole day has been missed', () => {
    expect(streaks(answersOn([-3, -2]), HOUR, noon(0)).current).toBe(0)
  })

  it('a gap does not join two runs', () => {
    const s = streaks(answersOn([-9, -8, -7, -6, -1, 0]), HOUR, noon(0))
    expect(s.longest).toBe(4)
    expect(s.current).toBe(2)
  })

  it('several answers in one day are still one day', () => {
    const s = streaks(answersOn([0, 0, 0, 0]), HOUR, noon(0))
    expect(s).toMatchObject({ current: 1, longest: 1, activeDays: 1, total: 4 })
  })
})

describe('the heatmap grid', () => {
  it('is weeks of seven days', () => {
    const grid = heatmap([], HOUR, noon(0), 26)
    expect(grid).toHaveLength(26)
    expect(grid.every((week) => week.length === 7)).toBe(true)
  })

  it('puts today in the last column', () => {
    const grid = heatmap(answersOn([0]), HOUR, noon(0))
    const lastWeek = grid[grid.length - 1]
    expect(lastWeek.some((c) => c.count === 1)).toBe(true)
  })

  it('marks days after today as future, not as empty', () => {
    // Otherwise the rest of this week reads as days you skipped.
    const grid = heatmap([], HOUR, noon(0))
    const lastWeek = grid[grid.length - 1]
    expect(lastWeek.some((c) => c.future)).toBe(true)
    expect(lastWeek.every((c) => c.future)).toBe(false)
  })

  it('shades against your own busiest day', () => {
    // Ten cards a day is a full day for one person and a warm-up for another,
    // so fixed thresholds would put a whole grid on the palest shade.
    const light = heatmap(answersOn([0, -1, -1]), HOUR, noon(0)).flat()
    expect(light.find((c) => c.count === 2)?.level).toBe(4)
    expect(light.find((c) => c.count === 1)?.level).toBe(2)
  })

  it('leaves days with nothing at level zero', () => {
    const grid = heatmap(answersOn([0]), HOUR, noon(0)).flat()
    expect(grid.filter((c) => c.count === 0).every((c) => c.level === 0)).toBe(true)
  })
})
