import { describe, expect, it } from 'vitest'
import {
  cardFront,
  isAllKana,
  makeId,
  normalizePattern,
  parseReading,
  splitExample,
  splitSlashLines,
  splitVariants,
  stripPlaceholder,
} from './text.ts'
import type { Entry } from './types.ts'

const w = (over: Partial<Entry> = {}): Entry =>
  ({
    id: 'x',
    kind: 'word',
    category: 'vocabulario',
    subcategory: null,
    kanji: null,
    kana: '',
    variants: [],
    meaning: '',
    example: null,
    source: 'seed',
    relatedIds: [],
    ...over,
  }) as Entry

describe('isAllKana', () => {
  it.each([
    ['しんぽ', true],
    ['コーヒー', true],
    ['とぶ／とばす', true],
    ['進歩', false],
    ['progreso', false],
    ['', false],
  ])('%s -> %s', (input, expected) => {
    expect(isAllKana(input)).toBe(expected)
  })
})

describe('stripPlaceholder', () => {
  it('treats the em dash as absent', () => {
    expect(stripPlaceholder('—')).toBeNull()
    expect(stripPlaceholder('  ')).toBeNull()
    expect(stripPlaceholder('鮭')).toBe('鮭')
  })
})

describe('splitExample', () => {
  it('splits a sentence from its translation', () => {
    expect(splitExample('鮭を焼きます。(Aso salmón.)')).toEqual({
      target: '鮭を焼きます。',
      native: 'Aso salmón.',
    })
  })

  it('takes the last parenthesised group when the sentence has its own', () => {
    expect(splitExample('「国宝」という映画を見ました。(Vi una película.)')).toEqual({
      target: '「国宝」という映画を見ました。',
      native: 'Vi una película.',
    })
  })

  it('keeps a two-sentence example intact', () => {
    expect(splitExample('ドアが開きます。／ドアを開けます。(Se abre. / Abro.)')).toEqual({
      target: 'ドアが開きます。／ドアを開けます。',
      native: 'Se abre. / Abro.',
    })
  })

  it('returns null for a placeholder', () => {
    expect(splitExample('—')).toBeNull()
  })
})

describe('parseReading', () => {
  it('reads a parenthesised kana reading', () => {
    expect(parseReading('開く（あく）')).toEqual({ kanji: '開く', kana: 'あく' })
  })

  it('treats a bare kana word as its own reading', () => {
    expect(parseReading('こわれる')).toEqual({ kanji: null, kana: 'こわれる' })
  })

  it('refuses to read a Spanish gloss as a reading', () => {
    expect(parseReading('食べる (comer)')).toBeNull()
  })

  it('returns null for kanji with no reading supplied', () => {
    expect(parseReading('変わる')).toBeNull()
  })
})

describe('cardFront', () => {
  it('renders kanji・kana', () => {
    expect(cardFront(w({ kanji: '進歩', kana: 'しんぽ' }))).toBe('進歩・しんぽ')
  })

  it('renders a kana-only word without the interpunct', () => {
    expect(cardFront(w({ kanji: null, kana: 'にんにく' }))).toBe('にんにく')
  })

  it('zips variants with their readings when the counts line up', () => {
    const e = w({ kanji: '飛ぶ／飛ばす', kana: 'とぶ／とばす', variants: ['飛ぶ', '飛ばす'] })
    expect(cardFront(e)).toBe('飛ぶ・とぶ ／ 飛ばす・とばす')
  })

  it('appends a single shared reading when the counts do not line up', () => {
    const e = w({ kanji: '入れる／淹れる', kana: 'いれる', variants: ['入れる', '淹れる'] })
    expect(cardFront(e)).toBe('入れる／淹れる・いれる')
  })

  it('renders a grammar pattern as-is', () => {
    expect(cardFront(w({ kind: 'pattern', pattern: '〜たびに' }))).toBe('〜たびに')
  })
})

describe('normalizePattern', () => {
  it('compacts the spelled-out verb form', () => {
    expect(normalizePattern('Verbo (ます形) ＋ はじめる')).toBe('Vます＋はじめる')
  })

  it('handles other forms and the Japanese spelling', () => {
    expect(normalizePattern('Verbo（て形）＋ ください')).toBe('Vて＋ください')
    expect(normalizePattern('動詞（た形）＋ ことがあります')).toBe('Vた＋ことがあります')
  })

  it('works without the 形 suffix', () => {
    expect(normalizePattern('Verbo (ます) ＋ ながら')).toBe('Vます＋ながら')
  })

  it('tightens spacing around a fullwidth plus', () => {
    expect(normalizePattern('〜て ＋ いる')).toBe('〜て＋いる')
  })

  it('leaves an ordinary pattern untouched', () => {
    expect(normalizePattern('〜たびに')).toBe('〜たびに')
    expect(normalizePattern('〜より〜のほうが〜です')).toBe('〜より〜のほうが〜です')
  })

  it('leaves Spanish prose that mentions a verb alone', () => {
    expect(normalizePattern('el verbo (en pasado) va aquí')).toBe('el verbo (en pasado) va aquí')
  })
})

describe('splitSlashLines', () => {
  it('breaks a grammar pattern into its alternatives', () => {
    expect(splitSlashLines('〜と〜とどちらが〜ですか／〜のほうが〜です')).toEqual([
      '〜と〜とどちらが〜ですか',
      '〜のほうが〜です',
    ])
  })

  it('breaks a two-sentence example', () => {
    expect(splitSlashLines('ドアが開きます。／ドアを開けます。')).toEqual([
      'ドアが開きます。',
      'ドアを開けます。',
    ])
  })

  it('breaks a spaced slash in a Spanish gloss', () => {
    expect(splitSlashLines('abrirse / abrir')).toEqual(['abrirse', 'abrir'])
  })

  it('leaves gender slashes alone', () => {
    // These would be mangled into "el" / "la menor" by a naive split.
    expect(splitSlashLines('el/la menor')).toEqual(['el/la menor'])
    expect(splitSlashLines('veterinario/a')).toEqual(['veterinario/a'])
    expect(splitSlashLines('profesor/a universitario/a')).toEqual(['profesor/a universitario/a'])
    expect(splitSlashLines('este/ese/aquel, aquí/ahí/allí')).toEqual([
      'este/ese/aquel, aquí/ahí/allí',
    ])
  })

  it('handles a three-way pattern', () => {
    expect(splitSlashLines('〜てもらう／くれる／あげる')).toEqual([
      '〜てもらう',
      'くれる',
      'あげる',
    ])
  })

  it('splits the zipped variant front', () => {
    expect(splitSlashLines('飛ぶ・とぶ ／ 飛ばす・とばす')).toEqual([
      '飛ぶ・とぶ',
      '飛ばす・とばす',
    ])
  })

  it('returns the original when there is nothing to split', () => {
    expect(splitSlashLines('進歩・しんぽ')).toEqual(['進歩・しんぽ'])
  })
})

describe('splitVariants', () => {
  it('splits on either slash', () => {
    expect(splitVariants('飛ぶ／飛ばす')).toEqual(['飛ぶ', '飛ばす'])
    expect(splitVariants('a/b')).toEqual(['a', 'b'])
    expect(splitVariants('鮭')).toEqual(['鮭'])
  })
})

describe('makeId', () => {
  it('is stable for the same input', () => {
    expect(makeId('verbos', '進歩')).toBe(makeId('verbos', '進歩'))
  })

  it('distinguishes category, word and role', () => {
    const ids = new Set([
      makeId('verbos', '開く'),
      makeId('vocabulario', '開く'),
      makeId('verbos', '開ける'),
      makeId('verbos', '開く', 'transitive'),
    ])
    expect(ids.size).toBe(4)
  })

  it('does not collide across the real dataset', async () => {
    const seed = (await import('../data/seed.json')).default as { entries: { id: string }[] }
    const ids = seed.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
