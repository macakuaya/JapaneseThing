import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTER,
  REQUEUE_HORIZON_MS,
  buildQueue,
  cardKey,
  countsFor,
  enumerateCards,
  interleave,
  practiceConfig,
  requeue,
  newAllowance,
  newIntroducedToday,
  reviewConfig,
  shuffle,
} from './session.ts'
import type { Card } from './session.ts'
import { DAY, MINUTE, newCardState } from './srs.ts'
import { DEFAULT_SETTINGS } from './types.ts'
import type { CardState, Dataset, Entry, ReviewLogEntry, Settings } from './types.ts'

const T0 = new Date('2026-07-30T12:00:00').getTime()

/** Deterministic RNG so shuffles are reproducible in assertions. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const word = (id: string, category: string, subcategory: string, related: string[] = []): Entry => ({
  id,
  kind: 'word',
  category,
  subcategory,
  kanji: null,
  kana: id,
  variants: [],
  meaning: `meaning-${id}`,
  example: null,
  source: 'seed',
  relatedIds: related,
})

const dataset = (entries: Entry[]): Dataset => ({
  id: 'test',
  name: 'Test',
  nativeLang: 'es',
  targetLang: 'ja',
  categories: [
    { id: 'verbos', label: 'Verbos', subcategories: ['Cocina', 'Emociones'] },
    { id: 'vocabulario', label: 'Vocabulario', subcategories: ['Comida'] },
  ],
  entries,
})

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over })

const reviewed = (key: string, dueAt: number, interval = 5): CardState => ({
  ...newCardState(key, T0),
  stage: 'review',
  due: dueAt,
  interval,
  reps: 3,
})

describe('enumerateCards', () => {
  const ds = dataset([word('a', 'verbos', 'Cocina'), word('b', 'vocabulario', 'Comida')])

  it('produces one recognition card per entry by default', () => {
    const cards = enumerateCards(ds, {}, settings(), T0)
    expect(cards).toHaveLength(2)
    expect(cards.every((c) => c.direction === 'recognition')).toBe(true)
  })

  it('adds production cards only for the enabled categories', () => {
    const cards = enumerateCards(ds, {}, settings({ productionCategories: ['verbos'] }), T0)
    expect(cards.map((c) => c.key).sort()).toEqual([
      'a:production',
      'a:recognition',
      'b:recognition',
    ])
  })

  it('materialises unseen cards as new rather than skipping them', () => {
    const cards = enumerateCards(ds, {}, settings(), T0)
    expect(cards.every((c) => c.state.stage === 'new')).toBe(true)
  })
})

describe('the review queue', () => {
  const ds = dataset([
    word('a', 'verbos', 'Cocina'),
    word('b', 'verbos', 'Cocina'),
    word('c', 'vocabulario', 'Comida'),
    word('d', 'vocabulario', 'Comida'),
  ])
  const s = settings()

  it('includes cards due today and excludes cards due tomorrow', () => {
    const srs = {
      'a:recognition': reviewed('a:recognition', T0 - DAY),
      'b:recognition': reviewed('b:recognition', T0 + 5 * DAY),
    }
    const keys = buildQueue(ds, srs, settings({ newPerDay: 0 }), reviewConfig(s), T0).map((c) => c.key)
    expect(keys).toEqual(['a:recognition'])
  })

  it('orders due cards by how overdue they are', () => {
    const srs = {
      'a:recognition': reviewed('a:recognition', T0 - 1 * DAY),
      'b:recognition': reviewed('b:recognition', T0 - 3 * DAY),
      'c:recognition': reviewed('c:recognition', T0 - 2 * DAY),
    }
    const keys = buildQueue(ds, srs, settings({ newPerDay: 0 }), reviewConfig(s), T0).map((c) => c.key)
    expect(keys).toEqual(['b:recognition', 'c:recognition', 'a:recognition'])
  })

  it('caps new cards at newPerDay', () => {
    const queue = buildQueue(ds, {}, settings({ newPerDay: 2 }), reviewConfig(s), T0)
    expect(queue).toHaveLength(2)
  })

  it('caps reviews at reviewsPerDay', () => {
    const srs = Object.fromEntries(
      ['a', 'b', 'c', 'd'].map((id) => [
        `${id}:recognition`,
        reviewed(`${id}:recognition`, T0 - DAY),
      ]),
    )
    const queue = buildQueue(
      ds,
      srs,
      settings({ reviewsPerDay: 3, newPerDay: 0 }),
      reviewConfig(s),
      T0,
    )
    expect(queue).toHaveLength(3)
  })

  it('is empty when nothing is due and no new cards are allowed', () => {
    const srs = { 'a:recognition': reviewed('a:recognition', T0 + 10 * DAY) }
    expect(buildQueue(ds, srs, settings({ newPerDay: 0 }), reviewConfig(s), T0)).toEqual([])
  })
})

describe('sibling suppression', () => {
  // 落ち着く is taught both as a verb and as an expression.
  const ds = dataset([
    word('verb', 'verbos', 'Emociones', ['expr']),
    word('expr', 'expresiones', '', ['verb']),
    word('other', 'vocabulario', 'Comida'),
  ])

  it('queues only one of a linked pair', () => {
    const keys = buildQueue(ds, {}, settings(), reviewConfig(settings()), T0).map((c) => c.key)
    expect(keys).toContain('other:recognition')
    expect(keys.filter((k) => k === 'verb:recognition' || k === 'expr:recognition')).toHaveLength(1)
  })

  it('still allows both when the user asks for them explicitly in practice', () => {
    const queue = buildQueue(ds, {}, settings(), practiceConfig(EMPTY_FILTER, 50), T0, seeded(1))
    expect(queue).toHaveLength(3)
  })
})

describe('the practice queue', () => {
  const ds = dataset([
    word('a', 'verbos', 'Cocina'),
    word('b', 'verbos', 'Emociones'),
    word('c', 'vocabulario', 'Comida'),
  ])

  it('filters by category', () => {
    const cfg = practiceConfig({ ...EMPTY_FILTER, categories: ['verbos'] }, 50)
    const keys = buildQueue(ds, {}, settings(), cfg, T0, seeded(7)).map((c) => c.key).sort()
    expect(keys).toEqual(['a:recognition', 'b:recognition'])
  })

  it('filters by subcategory', () => {
    const cfg = practiceConfig({ ...EMPTY_FILTER, subcategories: ['Cocina'] }, 50)
    const keys = buildQueue(ds, {}, settings(), cfg, T0, seeded(7)).map((c) => c.key)
    expect(keys).toEqual(['a:recognition'])
  })

  it('filters by maturity', () => {
    const srs = { 'a:recognition': reviewed('a:recognition', T0 + DAY, 60) }
    const cfg = practiceConfig({ ...EMPTY_FILTER, maturity: ['mature'] }, 50)
    const keys = buildQueue(ds, srs, settings(), cfg, T0, seeded(7)).map((c) => c.key)
    expect(keys).toEqual(['a:recognition'])
  })

  it('ignores due dates entirely', () => {
    const srs = {
      'a:recognition': reviewed('a:recognition', T0 + 100 * DAY),
      'b:recognition': reviewed('b:recognition', T0 + 100 * DAY),
      'c:recognition': reviewed('c:recognition', T0 + 100 * DAY),
    }
    expect(buildQueue(ds, srs, settings(), practiceConfig(EMPTY_FILTER, 50), T0, seeded(3))).toHaveLength(3)
  })

  it('respects the requested count', () => {
    expect(buildQueue(ds, {}, settings(), practiceConfig(EMPTY_FILTER, 2), T0, seeded(3))).toHaveLength(2)
  })

  it('leaves the scheduling state byte-identical', () => {
    const srs = { 'a:recognition': reviewed('a:recognition', T0 - DAY) }
    const before = JSON.stringify(srs)
    buildQueue(ds, srs, settings(), practiceConfig(EMPTY_FILTER, 50), T0, seeded(5))
    expect(JSON.stringify(srs)).toBe(before)
  })

  it('does not cap by newPerDay the way the review queue does', () => {
    const cfg = practiceConfig(EMPTY_FILTER, 50)
    expect(buildQueue(ds, {}, settings({ newPerDay: 1 }), cfg, T0, seeded(9))).toHaveLength(3)
  })
})

describe('interleave', () => {
  it('spreads new cards through the reviews instead of clumping them', () => {
    expect(interleave<number | string>([1, 2, 3, 4, 5, 6], ['a', 'b'])).toEqual([
      1, 2, 3, 'a', 4, 5, 6, 'b',
    ])
  })

  it('handles either side being empty', () => {
    expect(interleave<number>([1, 2], [])).toEqual([1, 2])
    expect(interleave<string>([], ['a'])).toEqual(['a'])
  })

  it('keeps every element exactly once', () => {
    const out = interleave<number | string>([1, 2, 3], ['a', 'b', 'c', 'd', 'e'])
    expect(out).toHaveLength(8)
    expect(new Set(out).size).toBe(8)
  })
})

describe('shuffle', () => {
  it('keeps the same elements', () => {
    const input = [1, 2, 3, 4, 5]
    expect(shuffle(input, seeded(42)).sort()).toEqual(input)
  })

  it('does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5]
    shuffle(input, seeded(42))
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})

describe('requeue', () => {
  const mk = (id: string, due: number): Card => ({
    key: `${id}:recognition`,
    entry: word(id, 'verbos', 'Cocina'),
    direction: 'recognition',
    state: { ...newCardState(`${id}:recognition`, T0), stage: 'learning', due },
  })

  it('puts a card still in a learning step back in the queue', () => {
    const queue = [mk('a', T0), mk('b', T0), mk('c', T0)]
    const answered = { ...queue[0], state: { ...queue[0].state, due: T0 + 10 * MINUTE } }
    const next = requeue(queue, 0, answered, T0)
    expect(next.map((c) => c.key)).toContain('a:recognition')
    expect(next).toHaveLength(3)
  })

  it('never places it immediately next', () => {
    const queue = [mk('a', T0), mk('b', T0 + 60 * MINUTE)]
    const answered = { ...queue[0], state: { ...queue[0].state, due: T0 + MINUTE } }
    expect(requeue(queue, 0, answered, T0)[0].key).toBe('b:recognition')
  })

  it('drops a card whose next review is beyond the session horizon', () => {
    const queue = [mk('a', T0), mk('b', T0)]
    const answered = { ...queue[0], state: { ...queue[0].state, due: T0 + REQUEUE_HORIZON_MS + 1 } }
    const next = requeue(queue, 0, answered, T0)
    expect(next.map((c) => c.key)).toEqual(['b:recognition'])
  })

  it('empties the queue once the last card graduates', () => {
    const queue = [mk('a', T0)]
    const answered = { ...queue[0], state: { ...queue[0].state, due: T0 + DAY } }
    expect(requeue(queue, 0, answered, T0)).toEqual([])
  })
})

describe('countsFor', () => {
  const ds = dataset([
    word('a', 'verbos', 'Cocina'),
    word('b', 'verbos', 'Cocina'),
    word('c', 'vocabulario', 'Comida'),
  ])

  it('separates answerable-now from new', () => {
    const srs = {
      'a:recognition': reviewed('a:recognition', T0 - DAY),
      'b:recognition': {
        ...newCardState('b:recognition', T0),
        stage: 'learning' as const,
        due: T0 - MINUTE,
      },
    }
    const cards = enumerateCards(ds, srs, settings(), T0)
    expect(countsFor(cards, settings(), T0)).toEqual({
      due: 2,
      fresh: 1,
      later: 0,
      nextAt: null,
      total: 3,
    })
  })

  it('counts a learning card due later today as "later", not "due"', () => {
    const soon = T0 + 10 * MINUTE
    const srs = {
      'a:recognition': {
        ...newCardState('a:recognition', T0),
        stage: 'learning' as const,
        due: soon,
      },
    }
    const cards = enumerateCards(ds, srs, settings(), T0)
    const counts = countsFor(cards, settings(), T0)
    expect(counts.due).toBe(0)
    expect(counts.later).toBe(1)
    expect(counts.nextAt).toBe(soon)
  })

  it('clamps the reported counts to the daily caps', () => {
    const cards = enumerateCards(ds, {}, settings({ newPerDay: 1 }), T0)
    expect(countsFor(cards, settings({ newPerDay: 1 }), T0).fresh).toBe(1)
  })
})

describe('the daily new-card limit', () => {
  const ds = dataset(
    Array.from({ length: 40 }, (_, i) => word(`w${i}`, 'verbos', 'Cocina')),
  )
  const s = settings({ newPerDay: 10, reviewsPerDay: 100 })

  const logFor = (keys: string[], at: number): ReviewLogEntry[] =>
    keys.map((key) => ({ key, grade: 'good' as const, at, prevInterval: 0 }))

  it('counts cards introduced today, not cards still unseen', () => {
    const log = logFor(['w0:recognition', 'w1:recognition', 'w2:recognition'], T0)
    expect(newIntroducedToday(log, s, T0)).toBe(3)
    expect(newAllowance(log, s, T0)).toBe(7)
  })

  it('counts a card once however many times it was answered', () => {
    const log = [...logFor(['w0:recognition'], T0), ...logFor(['w0:recognition'], T0 + MINUTE)]
    expect(newIntroducedToday(log, s, T0)).toBe(1)
  })

  it('stops offering new cards once the day’s limit is spent', () => {
    // The bug: finishing a session offered another full batch immediately,
    // because the cap was measured against cards still in the `new` state.
    const log = logFor(
      Array.from({ length: 10 }, (_, i) => `w${i}:recognition`),
      T0,
    )
    expect(newAllowance(log, s, T0)).toBe(0)
    expect(buildQueue(ds, {}, s, reviewConfig(s), T0, () => 0.5, log)).toEqual([])
    expect(countsFor(enumerateCards(ds, {}, s, T0), s, T0, log).fresh).toBe(0)
  })

  it('resets when the study day rolls over', () => {
    const yesterday = T0 - DAY
    const log = logFor(
      Array.from({ length: 10 }, (_, i) => `w${i}:recognition`),
      yesterday,
    )
    expect(newAllowance(log, s, T0)).toBe(10)
  })

  it('ignores the limit in practice, which is not scheduled', () => {
    const log = logFor(
      Array.from({ length: 10 }, (_, i) => `w${i}:recognition`),
      T0,
    )
    const queue = buildQueue(ds, {}, s, practiceConfig(EMPTY_FILTER, 50), T0, seeded(3), log)
    expect(queue.length).toBe(40)
  })
})

describe('cardKey', () => {
  it('is stable and direction-scoped', () => {
    expect(cardKey('abc', 'recognition')).toBe('abc:recognition')
    expect(cardKey('abc', 'production')).toBe('abc:production')
  })
})


/*
 * The log now holds drills as well as reviews, so anything reading it for
 * scheduling has to say which it wants. The daily new-card allowance is the
 * one that would go wrong quietly: twenty drilled cards would look like twenty
 * new ones introduced, and the next day's review would offer nothing.
 */
describe('practice lines in the review log', () => {
  const settings = { ...DEFAULT_SETTINGS, newPerDay: 10 }
  const now = new Date(2026, 6, 15, 12, 0, 0).getTime()
  const line = (practice: boolean) => ({
    key: 'a:recognition',
    grade: 'good' as const,
    at: now,
    prevInterval: 0,
    ...(practice ? { practice: 1 as const } : {}),
  })

  it('do not spend the daily new-card allowance', () => {
    const drilled = Array.from({ length: 8 }, () => line(true))
    expect(newAllowance(drilled, settings, now)).toBe(settings.newPerDay)
  })

  it('while real reviews still do', () => {
    const reviewed = [line(false), line(false)]
    expect(newAllowance(reviewed, settings, now)).toBeLessThan(settings.newPerDay)
  })
})
