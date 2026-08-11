// How much you actually studied, from the review log.
//
// Pure functions over `{at}[]` and a day-start hour, so the numbers can be
// tested without a DOM and without pretending it is a particular date.
//
// Every boundary here is the app's study day, not the calendar day: answering
// a card at 01:00 belongs to the previous day's work, the same way the due
// counts treat it. Using midnight instead would break a streak for anyone who
// reviews late, which is most people.

import { dayStart } from './srs.ts'

const DAY = 86_400_000

export interface DayCount {
  /** Start of the study day, epoch ms. */
  day: number
  count: number
}

export interface Streaks {
  /** Days in a row up to today. */
  current: number
  longest: number
  /** Distinct days with at least one answer. */
  activeDays: number
  /** Answers across the whole log. */
  total: number
}

/** Answers per study day, oldest first. Days with none are absent. */
export function countByDay(log: { at: number }[], dayStartHour: number): DayCount[] {
  const buckets = new Map<number, number>()
  for (const entry of log) {
    const day = dayStart(entry.at, dayStartHour)
    buckets.set(day, (buckets.get(day) ?? 0) + 1)
  }
  return [...buckets.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day - b.day)
}

/**
 * Streaks, counted back from today.
 *
 * A day you haven't studied *yet* doesn't end a streak — it is still in
 * progress until it is over. So a run ending yesterday still counts as
 * current; one ending the day before yesterday does not.
 */
export function streaks(log: { at: number }[], dayStartHour: number, now: number): Streaks {
  const days = countByDay(log, dayStartHour)
  const total = log.length
  if (!days.length) return { current: 0, longest: 0, activeDays: 0, total }

  const seen = new Set(days.map((d) => d.day))
  const today = dayStart(now, dayStartHour)

  let current = 0
  // Today if it has answers, otherwise yesterday — today isn't over yet.
  let cursor = seen.has(today) ? today : today - DAY
  while (seen.has(cursor)) {
    current++
    cursor -= DAY
  }

  let longest = 0
  let run = 0
  let previous: number | null = null
  for (const { day } of days) {
    run = previous !== null && day - previous === DAY ? run + 1 : 1
    if (run > longest) longest = run
    previous = day
  }

  return { current, longest, activeDays: days.length, total }
}

export interface Cell {
  day: number
  count: number
  /** 0 for nothing, then 1–4 by how much. */
  level: 0 | 1 | 2 | 3 | 4
  /** True for days after today, which are drawn as absent rather than empty. */
  future: boolean
}

/**
 * A grid of weeks, each a column of seven days, oldest week first.
 *
 * Columns start on Monday because the week does, and the last column is the
 * one containing today — so the grid always ends at the right-hand edge with
 * today in it, the way a calendar you are living in should.
 */
export function heatmap(
  log: { at: number }[],
  dayStartHour: number,
  now: number,
  weeks = 26,
): Cell[][] {
  const counts = new Map(countByDay(log, dayStartHour).map((d) => [d.day, d.count]))
  const today = dayStart(now, dayStartHour)

  // Monday of this week. getDay() is 0 for Sunday, so shift it.
  const weekday = (new Date(today).getDay() + 6) % 7
  const thisMonday = today - weekday * DAY
  const firstMonday = thisMonday - (weeks - 1) * DAY * 7

  const busiest = Math.max(1, ...counts.values())

  const grid: Cell[][] = []
  for (let w = 0; w < weeks; w++) {
    const column: Cell[] = []
    for (let d = 0; d < 7; d++) {
      const day = firstMonday + (w * 7 + d) * DAY
      const count = counts.get(day) ?? 0
      column.push({ day, count, level: levelFor(count, busiest), future: day > today })
    }
    grid.push(column)
  }
  return grid
}

/**
 * Shade relative to your own busiest day rather than to fixed thresholds.
 *
 * Fixed bands would leave the whole grid on level 1 for someone doing ten
 * cards a day, which says nothing. Scaled, the darkest square always means
 * "this was one of your big days", whatever your normal is.
 */
function levelFor(count: number, busiest: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  const share = count / busiest
  if (share > 0.75) return 4
  if (share > 0.5) return 3
  if (share > 0.25) return 2
  return 1
}
