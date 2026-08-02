import { describe, expect, it } from 'vitest'
import { alignFurigana } from './furigana.ts'

/** Compact rendering of an alignment: 落[お]ち着[つ]く */
const show = (word: string, reading: string) =>
  alignFurigana(word, reading)
    .map((s) => (s.ruby ? `${s.text}[${s.ruby}]` : s.text))
    .join('')

describe('okurigana anchoring', () => {
  it.each([
    ['慣れる', 'なれる', '慣[な]れる'],
    ['落ちる', 'おちる', '落[お]ちる'],
    ['落ち着く', 'おちつく', '落[お]ち着[つ]く'],
    ['開ける', 'あける', '開[あ]ける'],
    ['気に入る', 'きにいる', '気[き]に入[い]る'],
    ['引っ越す', 'ひっこす', '引[ひ]っ越[こ]す'],
  ])('%s / %s → %s', (word, reading, expected) => {
    expect(show(word, reading)).toBe(expected)
  })
})

describe('unsplittable compounds', () => {
  it('puts one ruby over the whole run when nothing anchors it', () => {
    expect(show('進歩', 'しんぽ')).toBe('進歩[しんぽ]')
    expect(show('化学繊維', 'かがくせんい')).toBe('化学繊維[かがくせんい]')
  })

  it('does not split adjacent kanji, even with okurigana after them', () => {
    // 出会う: nothing in the strings says where で ends and あ begins. One ruby
    // spanning 出会 is coarse but correct; splitting would need a dictionary.
    expect(show('出会う', 'であう')).toBe('出会[であ]う')
    expect(show('知り合う', 'しりあう')).toBe('知[し]り合[あ]う')
  })

  it('still splits a compound that has kana between the kanji', () => {
    expect(show('遊びが足りない', 'あそびがたりない')).toBe('遊[あそ]びが足[た]りない')
  })
})

describe('kana-only and edge cases', () => {
  it('emits no ruby when the word is already its own reading', () => {
    expect(show('にんにく', 'にんにく')).toBe('にんにく')
  })

  it('treats katakana as matching its hiragana reading', () => {
    expect(show('コーヒーを飲む', 'こーひーをのむ')).toBe('コーヒーを飲[の]む')
  })

  it('returns the word untouched with no reading', () => {
    expect(show('大人に見られたい', '')).toBe('大人に見られたい')
  })

  it('handles an empty word', () => {
    expect(alignFurigana('', 'なにか')).toEqual([])
  })
})

describe('refusing to guess', () => {
  it('falls back to one ruby when the kana do not line up', () => {
    // Reading disagrees with the okurigana, so no per-kanji split is safe.
    expect(show('食べる', 'たべた')).toBe('食べる[たべた]')
  })

  it('falls back when the reading is shorter than the kana in the word', () => {
    expect(show('走り回る', 'はし')).toBe('走り回る[はし]')
  })

  it('never drops or duplicates characters of the word', () => {
    const cases: [string, string][] = [
      ['落ち着く', 'おちつく'],
      ['進歩', 'しんぽ'],
      ['食べる', 'たべた'],
      ['気に入る', 'きにいる'],
    ]
    for (const [word, reading] of cases) {
      expect(alignFurigana(word, reading).map((s) => s.text).join('')).toBe(word)
    }
  })

  it('reconstructs the reading exactly when it splits', () => {
    const segs = alignFurigana('落ち着く', 'おちつく')
    expect(segs.map((s) => s.ruby || s.text).join('')).toBe('おちつく')
  })
})

describe('the whole bundled deck', () => {
  it('aligns every entry without losing characters', async () => {
    const seed = (await import('../data/seed.json')).default as {
      entries: { kind: string; kanji: string | null; kana: string }[]
    }
    const words = seed.entries.filter((e) => e.kind === 'word' && e.kanji && e.kana)
    expect(words.length).toBeGreaterThan(100)

    let split = 0
    for (const e of words) {
      const segs = alignFurigana(e.kanji!, e.kana)
      expect(segs.map((s) => s.text).join('')).toBe(e.kanji)
      if (segs.length > 1) split++
    }
    // Regression guard: if a change makes alignment give up more often, this
    // drops and the test fails rather than silently degrading the furigana.
    expect(split).toBeGreaterThanOrEqual(60)
  })
})
