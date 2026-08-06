// The seed/user-entry merge, tested without a DOM.
//
// Editing a bundled entry stores a user entry under the same id. Concatenating
// the two lists put that id in the dataset twice, which broke Browse's keyed
// each block, made entryById return the stale copy (so edits did nothing), and
// created a second card for the same word. These assert the merge substitutes.

import { describe, expect, it } from 'vitest'
import { cardFront, hasKanji } from './text.ts'
import type { Entry } from './types.ts'

const word = (id: string, meaning: string, source: 'seed' | 'user' = 'seed'): Entry => ({
  id,
  kind: 'word',
  category: 'vocabulario',
  subcategory: null,
  kanji: null,
  kana: id,
  variants: [],
  meaning,
  example: null,
  source,
  relatedIds: [],
})

/** Mirrors Store.dataset. Kept in step by the last test in this file. */
function merge(seedEntries: Entry[], userEntries: Entry[]): Entry[] {
  const overrides = new Map(userEntries.map((e) => [e.id, e]))
  const merged = seedEntries.map((e) => overrides.get(e.id) ?? e)
  const seedIds = new Set(seedEntries.map((e) => e.id))
  const added = userEntries.filter((e) => !seedIds.has(e.id))
  return [...merged, ...added]
}

const seed = [word('a', 'uno'), word('b', 'dos'), word('c', 'tres')]

describe('merging user edits into the seed deck', () => {
  it('substitutes an edited seed entry rather than appending it', () => {
    const out = merge(seed, [word('b', 'DOS EDITADO', 'user')])
    expect(out).toHaveLength(3)
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(out.find((e) => e.id === 'b')!.meaning).toBe('DOS EDITADO')
  })

  it('never produces a duplicate id', () => {
    const out = merge(seed, [word('b', 'x', 'user'), word('nuevo', 'y', 'user')])
    expect(new Set(out.map((e) => e.id)).size).toBe(out.length)
  })

  it('keeps the edited entry in its original position', () => {
    const out = merge(seed, [word('a', 'UNO EDITADO', 'user')])
    expect(out[0].id).toBe('a')
    expect(out[0].meaning).toBe('UNO EDITADO')
  })

  it('appends genuinely new entries after the seed', () => {
    const out = merge(seed, [word('nuevo', 'cuatro', 'user')])
    expect(out).toHaveLength(4)
    expect(out[3].id).toBe('nuevo')
  })

  it('makes a lookup by id find the edit, not the stale original', () => {
    // `.find` on a concatenated list hit the seed copy first, so every edit
    // appeared to save and then had no effect on the card.
    const out = merge(seed, [word('c', 'TRES EDITADO', 'user')])
    expect(out.find((e) => e.id === 'c')!.meaning).toBe('TRES EDITADO')
  })

  it('yields exactly one card per id for the real deck', async () => {
    const real = (await import('../data/seed.json')).default as { entries: Entry[] }
    const edited = { ...real.entries[5], meaning: 'editado' }
    const out = merge(real.entries, [edited])
    expect(out).toHaveLength(real.entries.length)
    expect(new Set(out.map((e) => e.id)).size).toBe(out.length)
  })
})

/*
 * Sweeps the shipped deck for fronts that say the same thing twice.
 *
 * びっくりする arrived with its own writing repeated as its reading, so the
 * front rendered びっくりする・びっくりする. Nothing was wrong with the code
 * that built it — the rule was simply "kanji column means kanji", and the
 * teacher's tables don't always honour that. Checking the output rather than
 * the rule catches whatever shape the next one takes.
 */
describe('the shipped deck', () => {
  it('has no word whose writing is its own reading', async () => {
    const real = (await import('../data/seed.json')).default as { entries: Entry[] }
    const doubled = real.entries.filter(
      (e) => e.kind === 'word' && e.kanji !== null && e.kanji === e.kana,
    )
    expect(doubled.map((e) => e.id)).toEqual([])
  })

  it('stores no kanji field that contains no kanji', async () => {
    const real = (await import('../data/seed.json')).default as { entries: Entry[] }
    const kanaOnly = real.entries.filter(
      (e) => e.kind === 'word' && e.kanji !== null && !hasKanji(e.kanji),
    )
    expect(kanaOnly.map((e) => `${e.id} ${e.kind === 'word' ? e.kanji : ''}`)).toEqual([])
  })

  it('never renders a front with a repeated half', async () => {
    const real = (await import('../data/seed.json')).default as { entries: Entry[] }
    const repeated = real.entries
      .map((e) => cardFront(e))
      .filter((front) => {
        const halves = front.split('・').map((h) => h.trim())
        return halves.length > 1 && new Set(halves).size !== halves.length
      })
    expect(repeated).toEqual([])
  })
})
