// Queue construction for both study modes.
//
// Review and Practice are not two features — they are this module under two
// configs. Review lets the scheduler choose (`source: 'due'`) and writes the
// results back; Practice lets the user choose (`source: 'filtered'`) and
// writes nothing. Everything below is pure so both paths are testable.

import type {
  CardState,
  Dataset,
  Direction,
  Entry,
  Maturity,
  ReviewLogEntry,
  Settings,
} from './types.ts'
import { dayEnd, dayStart, maturityOf, newCardState } from './srs.ts'

export interface Filter {
  /** Empty means "all". */
  categories: string[]
  subcategories: string[]
  maturity: Maturity[]
}

export interface SessionConfig {
  source: 'due' | 'filtered'
  order: 'srs' | 'shuffle'
  /** Whether grading rewrites the card's schedule. */
  writeThrough: boolean
  filter?: Filter
  limit: number
}

export interface Card {
  key: string
  entry: Entry
  direction: Direction
  state: CardState
}

export const EMPTY_FILTER: Filter = { categories: [], subcategories: [], maturity: [] }

export const reviewConfig = (settings: Settings): SessionConfig => ({
  source: 'due',
  order: 'srs',
  writeThrough: true,
  limit: settings.reviewsPerDay + settings.newPerDay,
})

export const practiceConfig = (filter: Filter, limit: number): SessionConfig => ({
  source: 'filtered',
  order: 'shuffle',
  writeThrough: false,
  filter,
  limit,
})

export const cardKey = (entryId: string, direction: Direction): string =>
  `${entryId}:${direction}`

/**
 * Every (entry, direction) pair the settings currently enable, paired with its
 * scheduling state. Cards with no stored state are materialised as new.
 */
export function enumerateCards(
  dataset: Dataset,
  srs: Record<string, CardState>,
  settings: Settings,
  now: number,
): Card[] {
  const out: Card[] = []
  for (const entry of dataset.entries) {
    const directions: Direction[] = ['recognition']
    if (settings.productionCategories.includes(entry.category)) directions.push('production')
    for (const direction of directions) {
      const key = cardKey(entry.id, direction)
      out.push({ key, entry, direction, state: srs[key] ?? newCardState(key, now) })
    }
  }
  return out
}

function matchesFilter(card: Card, filter: Filter, settings: Settings): boolean {
  const { entry } = card
  if (filter.categories.length && !filter.categories.includes(entry.category)) return false
  if (filter.subcategories.length) {
    if (!entry.subcategory || !filter.subcategories.includes(entry.subcategory)) return false
  }
  if (filter.maturity.length && !filter.maturity.includes(maturityOf(card.state, settings))) {
    return false
  }
  return true
}

/** Fisher-Yates, with the RNG injected so tests are deterministic. */
export function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Spread `news` evenly through `reviews` rather than front- or back-loading
 * them, so a session doesn't become a wall of unfamiliar cards at either end.
 */
export function interleave<T>(reviews: T[], news: T[]): T[] {
  if (!news.length) return reviews.slice()
  if (!reviews.length) return news.slice()
  const out: T[] = []
  const gap = reviews.length / news.length
  let taken = 0
  for (let i = 0; i < reviews.length; i++) {
    out.push(reviews[i])
    while (taken < news.length && (taken + 1) * gap <= i + 1) {
      out.push(news[taken++])
    }
  }
  while (taken < news.length) out.push(news[taken++])
  return out
}

/**
 * Drop cards whose related entry is already queued. 落ち着く is taught both as
 * a verb and as an expression; being asked for both in one sitting is noise,
 * not repetition. Only applied to the scheduled queue — if the user explicitly
 * filters for them in Practice, they asked for it.
 */
function dropSiblings(cards: Card[]): Card[] {
  const claimed = new Set<string>()
  const out: Card[] = []
  for (const card of cards) {
    if (card.entry.relatedIds.some((id) => claimed.has(`${id}:${card.direction}`))) continue
    claimed.add(card.key)
    out.push(card)
  }
  return out
}

/**
 * How many cards were shown for the first time during the current study day.
 *
 * `newPerDay` has to be measured against something durable. Counting cards
 * still in the `new` state can't work: the moment one is answered it stops
 * being new, so the cap resets and the app offers another full batch the
 * instant a session ends — which is exactly what "finished my review, it
 * tells me to review again" looks like.
 *
 * A card's first appearance in the review log is the durable record.
 */
export function newIntroducedToday(
  log: ReviewLogEntry[],
  settings: Settings,
  now: number = Date.now(),
): number {
  const start = dayStart(now, settings.dayStartHour)
  const firstSeen = new Map<string, number>()
  for (const entry of log) {
    const at = firstSeen.get(entry.key)
    if (at === undefined || entry.at < at) firstSeen.set(entry.key, entry.at)
  }
  let count = 0
  for (const at of firstSeen.values()) if (at >= start) count++
  return count
}

/** New cards still allowed today. */
export const newAllowance = (
  log: ReviewLogEntry[],
  settings: Settings,
  now: number = Date.now(),
): number => Math.max(0, settings.newPerDay - newIntroducedToday(log, settings, now))

export function buildQueue(
  dataset: Dataset,
  srs: Record<string, CardState>,
  settings: Settings,
  config: SessionConfig,
  now: number = Date.now(),
  rand: () => number = Math.random,
  log: ReviewLogEntry[] = [],
): Card[] {
  const all = enumerateCards(dataset, srs, settings, now)

  if (config.source === 'filtered') {
    const filter = config.filter ?? EMPTY_FILTER
    const matching = all.filter((c) => matchesFilter(c, filter, settings))
    const ordered = config.order === 'shuffle' ? shuffle(matching, rand) : matching
    return ordered.slice(0, config.limit)
  }

  const cutoff = dayEnd(now, settings.dayStartHour)

  const due = all
    .filter((c) => c.state.stage !== 'new' && c.state.due < cutoff)
    .sort((a, b) => a.state.due - b.state.due)

  const fresh = all.filter((c) => c.state.stage === 'new')

  const reviews = dropSiblings(due).slice(0, settings.reviewsPerDay)
  const news = dropSiblings(fresh).slice(0, newAllowance(log, settings, now))

  return interleave(reviews, news).slice(0, config.limit)
}

/**
 * Re-insert a card that is still in a sub-day learning step, so 1- and
 * 10-minute steps actually happen inside the session instead of silently
 * rolling to tomorrow. Cards due further out are dropped from the queue.
 *
 * Returns a new queue; `index` is the position of the card just answered.
 */
export const REQUEUE_HORIZON_MS = 20 * 60_000

export function requeue(queue: Card[], index: number, answered: Card, now: number): Card[] {
  const rest = queue.slice(0, index).concat(queue.slice(index + 1))
  const delay = answered.state.due - now
  if (delay > REQUEUE_HORIZON_MS) return rest

  // Place it after any cards that come due sooner, so the order stays honest.
  let at = rest.length
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].state.due > answered.state.due) {
      at = i
      break
    }
  }
  // Never immediately next: seeing the same card twice in a row isn't a test.
  at = Math.max(at, Math.min(1, rest.length))
  return rest.slice(0, at).concat([answered], rest.slice(at))
}

// ---------------------------------------------------------------------------
// Resuming
// ---------------------------------------------------------------------------

/**
 * Rebuild a queue from stored card keys.
 *
 * Cards are looked up fresh rather than deserialised, so a resumed session
 * carries the *current* scheduling state — if a card was answered elsewhere in
 * the meantime, the resumed queue reflects that. Keys that no longer resolve
 * (an entry deleted, a direction turned off) are dropped silently; the
 * alternative is a session that crashes on a card that isn't there.
 */
export function rehydrateQueue(
  keys: string[],
  dataset: Dataset,
  srs: Record<string, CardState>,
  settings: Settings,
  now: number = Date.now(),
): Card[] {
  const available = new Map(
    enumerateCards(dataset, srs, settings, now).map((c) => [c.key, c]),
  )
  const out: Card[] = []
  for (const key of keys) {
    const card = available.get(key)
    if (card) out.push(card)
  }
  return out
}

// ---------------------------------------------------------------------------
// Counts for the Home screen
// ---------------------------------------------------------------------------

export interface DueCounts {
  /** Answerable right now. */
  due: number
  /** New cards still allowed today. */
  fresh: number
  /**
   * In a learning step that falls due later today. Not answerable yet — this
   * is what makes "finished the session" and "nothing left today" different.
   */
  later: number
  /** Epoch ms the soonest `later` card becomes answerable, if any. */
  nextAt: number | null
  total: number
}

export function countsFor(
  cards: Card[],
  settings: Settings,
  now: number,
  log: ReviewLogEntry[] = [],
): DueCounts {
  const cutoff = dayEnd(now, settings.dayStartHour)
  let due = 0
  let unseen = 0
  let later = 0
  let nextAt: number | null = null

  for (const c of cards) {
    if (c.state.stage === 'new') {
      unseen++
    } else if (c.state.due <= now) {
      due++
    } else if (c.state.due < cutoff) {
      later++
      if (nextAt === null || c.state.due < nextAt) nextAt = c.state.due
    }
  }

  return {
    due: Math.min(due, settings.reviewsPerDay),
    fresh: Math.min(unseen, newAllowance(log, settings, now)),
    later,
    nextAt,
    total: cards.length,
  }
}
