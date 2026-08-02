import { describe, expect, it } from 'vitest'
import { type Draft, draftToEntry, parseBlock } from './parse.ts'

const D = { category: 'vocabulario', subcategory: 'Comida y cocina' }

/** Parse a single line and assert it produced exactly one draft. */
function one(line: string): Draft {
  const drafts = parseBlock(line, D)
  expect(drafts).toHaveLength(1)
  return drafts[0]
}

const shape = (d: Draft) => ({
  kind: d.kind,
  kanji: d.kanji,
  kana: d.kana,
  pattern: d.pattern,
  meaning: d.meaning,
  example: d.exampleTarget ? [d.exampleTarget, d.exampleNative] : null,
})

describe('readings in parentheses', () => {
  it('reads the full-width form', () => {
    expect(shape(one('慣れる（なれる）acostumbrarse'))).toEqual({
      kind: 'word',
      kanji: '慣れる',
      kana: 'なれる',
      pattern: '',
      meaning: 'acostumbrarse',
      example: null,
    })
  })

  it('reads the half-width form', () => {
    const d = one('慣れる (なれる) acostumbrarse')
    expect([d.kanji, d.kana, d.meaning]).toEqual(['慣れる', 'なれる', 'acostumbrarse'])
  })

  it('does not mistake a Spanish gloss in parentheses for a reading', () => {
    const d = one('食べる (comer)')
    expect(d.kana).not.toBe('comer')
    expect(d.kanji).toBe('食べる')
  })
})

describe('separators', () => {
  it.each([
    ['にんにく = ajo', 'にんにく', 'ajo'],
    ['にんにく ＝ ajo', 'にんにく', 'ajo'],
    ['にんにく : ajo', 'にんにく', 'ajo'],
    ['にんにく：ajo', 'にんにく', 'ajo'],
    ['にんにく → ajo', 'にんにく', 'ajo'],
    ['にんにく - ajo', 'にんにく', 'ajo'],
  ])('splits %s', (line, kana, meaning) => {
    const d = one(line)
    expect([d.kana, d.meaning]).toEqual([kana, meaning])
    expect(d.confidence).toBe('high')
  })

  it('falls back to the script boundary with lower confidence', () => {
    const d = one('たまねぎ cebolla')
    expect([d.kana, d.meaning]).toEqual(['たまねぎ', 'cebolla'])
    expect(d.confidence).toBe('medium')
  })
})

describe('the user’s own kanji・kana shorthand', () => {
  it('splits on the interpunct', () => {
    expect(shape(one('進歩・しんぽ = progreso'))).toEqual({
      kind: 'word',
      kanji: '進歩',
      kana: 'しんぽ',
      pattern: '',
      meaning: 'progreso',
      example: null,
    })
  })

  it('splits a space-separated writing and reading', () => {
    const d = one('風邪 かぜ resfriado')
    expect([d.kanji, d.kana, d.meaning]).toEqual(['風邪', 'かぜ', 'resfriado'])
  })

  it('leaves katakana words containing ・ alone', () => {
    const d = one('アイス・コーヒー = café helado')
    expect(d.kanji).toBe('')
    expect(d.kana).toBe('アイス・コーヒー')
  })
})

describe('grammar patterns', () => {
  it('recognises the tilde and does not look for a reading', () => {
    expect(shape(one('〜たびに cada vez que'))).toEqual({
      kind: 'pattern',
      kanji: '',
      kana: '',
      pattern: '〜たびに',
      meaning: 'cada vez que',
      example: null,
    })
  })

  it('handles the full-width tilde', () => {
    expect(one('～ばかり = recién hecho').kind).toBe('pattern')
  })
})

describe('examples', () => {
  it('peels the example off before reading the meaning', () => {
    expect(shape(one('酢（す）vinagre 酢を入れます。(Añado vinagre.)'))).toEqual({
      kind: 'word',
      kanji: '酢',
      kana: 'す',
      pattern: '',
      meaning: 'vinagre',
      example: ['酢を入れます。', 'Añado vinagre.'],
    })
  })

  it('flags an untranslated example', () => {
    const d = one('| 鮭 | さけ | salmón | 鮭を焼きます。 |')
    expect(d.exampleTarget).toBe('鮭を焼きます。')
    expect(d.issues).toContain('example not translated')
  })
})

describe('markdown table rows', () => {
  it('reads a four-column row', () => {
    expect(shape(one('| 鮭 | さけ | salmón | 鮭を焼きます。(Aso salmón.) |'))).toEqual({
      kind: 'word',
      kanji: '鮭',
      kana: 'さけ',
      pattern: '',
      meaning: 'salmón',
      example: ['鮭を焼きます。', 'Aso salmón.'],
    })
  })

  it('treats an em dash in the kanji column as "kana only"', () => {
    const d = one('| — | にんにく | ajo | にんにくを使います。(Uso ajo.) |')
    expect(d.kanji).toBe('')
    expect(d.kana).toBe('にんにく')
  })

  it('reads a three-column word row', () => {
    const d = one('| 鮭 | さけ | salmón |')
    expect([d.kanji, d.kana, d.meaning]).toEqual(['鮭', 'さけ', 'salmón'])
  })

  it('reads a three-column pattern row', () => {
    const d = one('| 〜について | acerca de ~ | 歴史についての本です。(Es un libro.) |')
    expect(d.kind).toBe('pattern')
    expect(d.pattern).toBe('〜について')
    expect(d.exampleNative).toBe('Es un libro.')
  })

  it('skips header and separator rows', () => {
    const text = '| Kanji | Kana | Significado | Ejemplo |\n|---|---|---|---|\n| 鮭 | さけ | salmón | — |'
    expect(parseBlock(text, D)).toHaveLength(1)
  })
})

describe('WhatsApp furniture', () => {
  it('strips bullets and numbering', () => {
    expect(one('- 落ち着く（おちつく）calmarse').kanji).toBe('落ち着く')
    expect(one('3. 落ち着く（おちつく）calmarse').kanji).toBe('落ち着く')
    expect(one('• 落ち着く（おちつく）calmarse').kanji).toBe('落ち着く')
  })

  it('ignores blank lines, headings and rules', () => {
    expect(parseBlock('\n\n# Vocabulario\n---\n***\n', D)).toEqual([])
  })

  it('ignores lines with no Japanese at all', () => {
    expect(parseBlock('Hola, aquí va el vocabulario de hoy:', D)).toEqual([])
  })
})

describe('confidence and inclusion', () => {
  it('keeps a line with no meaning, flagged for the user to fill in', () => {
    const d = one('慣れる（なれる）')
    expect(d.meaning).toBe('')
    expect(d.issues).toContain('needs meaning')
    expect(d.include).toBe(true)
  })

  it('excludes a line whose Japanese has letters glued into it', () => {
    const d = one('理解p118　しゅくだい')
    expect(d.include).toBe(false)
    expect(d.confidence).toBe('low')
  })

  it('flags a kanji writing with no reading but still includes it', () => {
    const d = one('進歩 = progreso')
    expect(d.issues).toContain('no reading')
    expect(d.include).toBe(true)
    expect(d.confidence).toBe('medium')
  })

  it('does not flag a kana-only word for having no reading', () => {
    expect(one('にんにく = ajo').issues).toEqual([])
  })
})

describe('a realistic paste', () => {
  const text = `
Hola! Vocabulario de hoy 🍳

1. にんにく = ajo
2. たまねぎ = cebolla
3. 酢（す）= vinagre  酢を入れます。(Añado vinagre.)
- 蒸す（むす）cocinar al vapor
〜たびに = cada vez que
Nos vemos el jueves!
`.trim()

  it('finds exactly the five vocabulary lines', () => {
    const drafts = parseBlock(text, D)
    expect(drafts).toHaveLength(5)
    expect(drafts.map((d) => d.meaning)).toEqual([
      'ajo',
      'cebolla',
      'vinagre',
      'cocinar al vapor',
      'cada vez que',
    ])
  })

  it('includes every row it found', () => {
    expect(parseBlock(text, D).every((d) => d.include)).toBe(true)
  })

  it('applies the default category to all of them', () => {
    expect(parseBlock(text, D).every((d) => d.category === 'vocabulario')).toBe(true)
  })
})

describe('a real WhatsApp export from the teacher', () => {
  // Verbatim from a class on 27/07/2026. Note there are no translations at
  // all — the teacher writes word + reading, sometimes with an aside.
  const text = `[27/07/2026, 13:54:24] 先生Ai: 奇抜　きばつ　です
[27/07/2026, 13:54:41] 先生Ai: 奇抜な格好(かっこう)
[27/07/2026, 13:56:38] 先生Ai: 遊びが足りない　あそびがたりない
[27/07/2026, 14:04:27] 先生Ai: 大人に見られたい
[27/07/2026, 14:06:42] 先生Ai: 狙い目　ねらいめ
[27/07/2026, 14:07:42] 先生Ai: 試着　しちゃく　する
[27/07/2026, 14:07:51] 先生Ai: 服を試す　ためす
[27/07/2026, 14:09:34] 先生Ai: 品質　ひんしつ　クオリティ
[27/07/2026, 14:10:01] 先生Ai: 化学繊維　かがくせんい
[27/07/2026, 14:10:36] 先生Ai: 環境　かんきょう
[27/07/2026, 14:11:26] 先生Ai: 素材　そざい　マテリアル
[27/07/2026, 14:15:30] 先生Ai: 閉まってしまいました
[27/07/2026, 14:15:50] 先生Ai: 食べてしまいました
[27/07/2026, 14:33:23] 先生Ai: 理解p118　しゅくだい
[27/07/2026, 14:34:39] 先生Ai: 空きました　すきました`

  const drafts = parseBlock(text, D)

  it('finds one draft per message', () => {
    expect(drafts).toHaveLength(15)
  })

  it('strips the timestamp and the Japanese sender name', () => {
    expect(drafts[0].kanji).toBe('奇抜')
    expect(drafts[0].kanji).not.toContain('先生')
  })

  it('splits writing from reading on the ideographic space', () => {
    expect([drafts[0].kanji, drafts[0].kana]).toEqual(['奇抜', 'きばつ'])
    expect([drafts[4].kanji, drafts[4].kana]).toEqual(['狙い目', 'ねらいめ'])
    expect([drafts[8].kanji, drafts[8].kana]).toEqual(['化学繊維', 'かがくせんい'])
    expect([drafts[9].kanji, drafts[9].kana]).toEqual(['環境', 'かんきょう'])
  })

  it('keeps a trailing grammatical aside as a note, not as the meaning', () => {
    expect(drafts[0].note).toBe('です')
    expect(drafts[5].note).toBe('する')
    expect(drafts[0].meaning).toBe('')
  })

  it('treats a katakana synonym as a note rather than a reading', () => {
    expect([drafts[7].kanji, drafts[7].kana, drafts[7].note]).toEqual([
      '品質',
      'ひんしつ',
      'クオリティ',
    ])
    expect([drafts[10].kanji, drafts[10].kana, drafts[10].note]).toEqual([
      '素材',
      'そざい',
      'マテリアル',
    ])
  })

  it('handles a whole phrase with its full reading', () => {
    expect([drafts[2].kanji, drafts[2].kana]).toEqual(['遊びが足りない', 'あそびがたりない'])
    expect([drafts[6].kanji, drafts[6].kana]).toEqual(['服を試す', 'ためす'])
    expect([drafts[14].kanji, drafts[14].kana]).toEqual(['空きました', 'すきました'])
  })

  it('reads an inline parenthesised reading', () => {
    expect([drafts[1].kanji, drafts[1].kana]).toEqual(['奇抜な格好', 'かっこう'])
  })

  it('keeps a phrase that has no reading at all', () => {
    expect([drafts[3].kanji, drafts[3].kana]).toEqual(['大人に見られたい', ''])
    expect(drafts[11].kanji).toBe('閉まってしまいました')
    expect(drafts[12].kanji).toBe('食べてしまいました')
  })

  it('flags the homework reference and leaves it unticked', () => {
    const homework = drafts[13]
    expect(homework.include).toBe(false)
    expect(homework.issues).toContain('check — contains letters')
  })

  it('keeps untranslated rows selected so the meanings can be typed in', () => {
    const translatable = drafts.filter((d) => d.include)
    expect(translatable).toHaveLength(14)
    expect(translatable.every((d) => d.issues.includes('needs meaning'))).toBe(true)
  })

  it('never invents a meaning', () => {
    expect(drafts.every((d) => d.meaning === '')).toBe(true)
  })
})

describe('draftToEntry', () => {
  it('builds a word entry with a stable id', () => {
    const e = draftToEntry(one('酢（す）= vinagre'))
    expect(e).toMatchObject({
      kind: 'word',
      kanji: '酢',
      kana: 'す',
      meaning: 'vinagre',
      source: 'user',
      category: 'vocabulario',
      subcategory: 'Comida y cocina',
    })
    expect(e.id).toBe(draftToEntry(one('酢（す）= vinagre')).id)
  })

  it('falls back to kana for a word with no kanji', () => {
    const e = draftToEntry(one('にんにく = ajo'))
    expect(e).toMatchObject({ kind: 'word', kanji: null, kana: 'にんにく' })
  })

  it('builds a pattern entry', () => {
    const e = draftToEntry(one('〜たびに = cada vez que'))
    expect(e).toMatchObject({ kind: 'pattern', pattern: '〜たびに', meaning: 'cada vez que' })
  })

  it('drops an empty example rather than storing a blank one', () => {
    expect(draftToEntry(one('にんにく = ajo')).example).toBeNull()
  })
})
