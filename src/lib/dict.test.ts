import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  type WordHit,
  deinflect,
  installDeck,
  installDict,
  isWorthExplaining,
  kanjiInfo,
  lookupWord,
  readingFor,
  readingOf,
  segment,
} from './dict.ts'

beforeAll(() => {
  const read = (f: string) =>
    JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/dict', f), 'utf8'))
  installDict(read('words.json').words, read('kanji.json').kanji)
})

/** First Spanish gloss of the best hit. */
const gloss = (surface: string): string | undefined => lookupWord(surface)[0]?.word.s[0].g[0]
const bases = (surface: string) => deinflect(surface).map((d) => d.form)

describe('deinflection', () => {
  it.each([
    ['涼しいです', '涼しい'],
    ['涼しかった', '涼しい'],
    ['涼しくない', '涼しい'],
    ['食べました', '食べる'],
    ['食べてしまいました', '食べる'],
    ['閉まってしまいました', '閉まる'],
    ['空きました', '空く'],
    ['行きません', '行く'],
    ['飲んだ', '飲む'],
    ['話した', '話す'],
    ['待って', '待つ'],
    ['見られたい', '見る'],
  ])('%s reaches %s', (surface, expected) => {
    expect(bases(surface)).toContain(expected)
  })

  it('always offers the surface form itself', () => {
    expect(bases('涼しい')).toContain('涼しい')
  })

  // Written as a grid rather than a list of one-off cases. Three separate gaps
  // (irregular 行った, bare masu-stem 降り, passive 言われる) each shipped and
  // each silently resolved to an unrelated noun; a grid fails loudly instead.
  describe.each([
    ['言う', 'v5u'],
    ['書く', 'v5k'],
    ['泳ぐ', 'v5g'],
    ['話す', 'v5s'],
    ['待つ', 'v5t'],
    ['飲む', 'v5m'],
    ['遊ぶ', 'v5b'],
    ['降る', 'v5r'],
    ['食べる', 'v1'],
  ])('every form of %s (%s)', (dict) => {
    const stem = dict.slice(0, -1)
    const last = dict.slice(-1)
    const row: Record<string, string[]> = {
      う: ['わ', 'い', 'え', 'お'],
      く: ['か', 'き', 'け', 'こ'],
      ぐ: ['が', 'ぎ', 'げ', 'ご'],
      す: ['さ', 'し', 'せ', 'そ'],
      つ: ['た', 'ち', 'て', 'と'],
      む: ['ま', 'み', 'め', 'も'],
      ぶ: ['ば', 'び', 'べ', 'ぼ'],
      る: ['ら', 'り', 'れ', 'ろ'],
    }

    const forms: string[] =
      dict === '食べる'
        ? ['食べます', '食べない', '食べたい', '食べられる', '食べさせる', '食べよう', '食べ']
        : (() => {
            const [a, i, e, o] = row[last]
            return [
              stem + i + 'ます',
              stem + a + 'ない',
              stem + i + 'たい',
              stem + a + 'れる', // passive — the 言われる gap
              stem + a + 'せる',
              stem + e + 'る', // potential
              stem + e + 'ば',
              stem + o + 'う', // volitional
              stem + i, // bare masu-stem — the 降り gap
            ]
          })()

    it.each(forms)('%s', (form) => {
      expect(bases(form)).toContain(dict)
    })
  })

  it('reaches 言う from the passive progressive that broke it', () => {
    expect(bases('言われています')).toContain('言う')
  })

  it('does not run away on a long string', () => {
    expect(deinflect('閉まってしまいました').length).toBeLessThan(200)
  })
})

describe('word lookup', () => {
  it('finds the word from the example sentence that started all this', () => {
    expect(gloss('涼しい')).toBe('fresco')
  })

  it('finds it through its inflection', () => {
    expect(gloss('涼しいです')).toBe('fresco')
    expect(gloss('涼しかった')).toBe('fresco')
  })

  it('looks up by kana as well as kanji', () => {
    expect(gloss('すずしい')).toBe('fresco')
  })

  it('reports how it got there', () => {
    const hit = lookupWord('涼しいです')[0]
    expect(hit.base).toBe('涼しい')
    expect(hit.via.length).toBeGreaterThan(0)
  })

  it('prefers common words over obscure homographs', () => {
    const hits = lookupWord('日本')
    expect(hits[0].word.c).toBe(1)
  })

  it('returns nothing for a non-word', () => {
    expect(lookupWord('ぬぬぬぬぬ')).toEqual([])
  })
})

describe('kanji lookup', () => {
  it('returns readings and meanings', () => {
    const info = kanjiInfo('涼')
    expect(info?.o).toContain('リョウ')
    expect(info?.k.some((r) => r.startsWith('すず'))).toBe(true)
    expect(info?.m[0]).toBe('refrescante')
  })

  it('covers every kanji in the bundled deck', async () => {
    const seed = (await import('../data/seed.json')).default as {
      entries: { kanji: string | null; pattern?: string; example: { target: string } | null }[]
    }
    const missing = new Set<string>()
    for (const e of seed.entries) {
      for (const s of [e.kanji ?? '', e.pattern ?? '', e.example?.target ?? '']) {
        for (const ch of s) if (/[㐀-鿿]/.test(ch) && !kanjiInfo(ch)) missing.add(ch)
      }
    }
    expect([...missing]).toEqual([])
  })
})

describe('segmentation', () => {
  const texts = (s: string) => segment(s).map((t) => t.text)

  it('splits a real example sentence from the deck', () => {
    // ドイツはバルセロナより涼しいです。
    const tokens = segment('ドイツはバルセロナより涼しいです。')
    expect(texts('ドイツはバルセロナより涼しいです。')).toContain('ドイツ')
    expect(tokens.some((t) => t.text.startsWith('涼しい'))).toBe(true)
  })

  it('resolves 涼しい to its dictionary entry inside the sentence', () => {
    const token = segment('ドイツはバルセロナより涼しいです。').find((t) =>
      t.text.startsWith('涼しい'),
    )
    expect(token?.hit?.word.s[0].g).toContain('fresco')
  })

  it('keeps punctuation as its own token', () => {
    expect(texts('犬と猫。')).toContain('。')
  })

  it('never loses or reorders characters', () => {
    const samples = [
      'ドイツはバルセロナより涼しいです。',
      '週末は歩いたり走ったりします。',
      '友達に本をすすめてもらいました。',
      'にんにくを使います。',
    ]
    for (const s of samples) {
      expect(segment(s).map((t) => t.text).join('')).toBe(s)
    }
  })

  it('reports positions that index back into the source', () => {
    const s = '犬と猫とどちらが好きですか。'
    for (const t of segment(s)) {
      expect(s.slice(t.at, t.at + t.text.length)).toBe(t.text)
    }
  })
})

describe('deciding what deserves a tooltip', () => {
  const SENTENCE = 'ドイツはバルセロナより涼しいです。'
  const explained = (sentence: string, taught = '') =>
    segment(sentence)
      .filter((t) => isWorthExplaining(t, taught))
      .map((t) => t.text)

  it('skips single-kana particles', () => {
    // は and が resolve to the nouns 羽 and 画 in the Spanish subset, so a
    // part-of-speech check alone would let them through.
    const out = explained(SENTENCE)
    expect(out).not.toContain('は')
    expect(out).not.toContain('が')
    expect(out).not.toContain('を')
    expect(out).not.toContain('に')
  })

  it('skips the grammar the card is teaching', () => {
    expect(explained(SENTENCE, '〜より〜のほうが〜です')).not.toContain('より')
  })

  it('keeps the one word actually worth explaining', () => {
    const out = explained(SENTENCE, '〜より〜のほうが〜です')
    expect(out.some((t) => t.startsWith('涼しい'))).toBe(true)
  })

  it('reduces that sentence to a handful of targets', () => {
    expect(explained(SENTENCE, '〜より〜のほうが〜です').length).toBeLessThanOrEqual(3)
  })

  it('skips copulas and auxiliaries by part of speech', () => {
    expect(explained('食べます。')).not.toContain('です')
    for (const t of segment('本です。')) {
      if (t.text === 'です') expect(isWorthExplaining(t)).toBe(false)
    }
  })

  it('does not skip a content word merely because it is short', () => {
    const out = explained('鍋を食べます。')
    expect(out).toContain('鍋')
  })

  it('skips the headword on its own card', () => {
    expect(explained('鍋を食べます。', '鍋なべ')).not.toContain('鍋')
  })

  it('never marks a token with no dictionary hit', () => {
    for (const token of segment(SENTENCE)) {
      if (!token.hit) expect(isWorthExplaining(token)).toBe(false)
    }
  })
})

describe('the whole deck, swept at once', () => {
  // A budget rather than a list of cases. Finding these one card at a time
  // while drilling is the slowest possible way to find them; `npm run audit`
  // reports the same signals in bulk, and this keeps them from creeping back.
  let sentences: { text: string; taught: string }[] = []

  beforeAll(async () => {
    const seed = (await import('../data/seed.json')).default as {
      entries: {
        kind: string
        kanji: string | null
        kana?: string
        pattern?: string
        example: { target: string } | null
      }[]
    }
    installDeck(seed.entries as never)
    sentences = seed.entries
      .filter((e) => e.example)
      .map((e) => ({
        text: e.example!.target,
        taught: e.kind === 'pattern' ? (e.pattern ?? '') : `${e.kanji ?? ''}${e.kana ?? ''}`,
      }))
  })

  const explainedIn = (s: { text: string; taught: string }) =>
    segment(s.text).filter((t) => isWorthExplaining(t, s.taught))

  it('never glosses a kana-only token that is not in the deck', () => {
    // ものがいい used to segment as もの|がい|と and gloss がい as 害 "daño".
    const offenders: string[] = []
    for (const s of sentences) {
      for (const t of explainedIn(s)) {
        if (!/[㐀-鿿]/.test(t.text) && !t.hit?.deck) offenders.push(`${t.text} in ${s.text}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('never glosses these specific fragments again', () => {
    const banned = ['がい', 'いと', 'のた', 'ます', 'うち', 'いています']
    const seen = new Set(sentences.flatMap((s) => explainedIn(s).map((t) => t.text)))
    for (const fragment of banned) expect(seen.has(fragment)).toBe(false)
  })

  it('still explains the words that matter', () => {
    const all = new Set(sentences.flatMap((s) => explainedIn(s).map((t) => t.text)))
    for (const word of ['涼しい', '健康', '野菜', '鮭', '雨']) {
      expect([...all].some((t) => t.startsWith(word))).toBe(true)
    }
  })

  it('produces no furigana that contradicts the characters under it', () => {
    for (const s of sentences) {
      for (const token of segment(s.text)) {
        const reading = readingOf(token)
        if (!reading) continue
        expect(reading).toMatch(/^[぀-ヿー]+$/)
        // Kana in the token must survive into the reading unchanged.
        const trailing = token.text.match(/[぀-ヿー]+$/)
        if (trailing) expect(reading.endsWith(trailing[0])).toBe(true)
      }
    }
  })
})

describe('readings for furigana over a sentence', () => {
  const readingFor = (sentence: string, word: string): string | null => {
    const token = segment(sentence).find((t) => t.text.startsWith(word))
    return token ? readingOf(token) : null
  }

  it('reads an uninflected word', () => {
    expect(readingFor('猫が好きです。', '猫')).toBe('ねこ')
  })

  it('carries the reading through an inflection', () => {
    // 涼しいです → base 涼しい, reading すずしい → すずしいです, which aligns to
    // 涼[すず]しいです.
    expect(readingFor('ドイツはバルセロナより涼しいです。', '涼しい')).toBe('すずしいです')
  })

  it('never annotates kana', () => {
    // The particle は matches the noun 羽 (はね); annotating it would print a
    // wrong reading on the commonest character in the language.
    for (const token of segment('ドイツはバルセロナより涼しいです。')) {
      if (!/[㐀-鿿]/.test(token.text)) expect(readingOf(token)).toBeNull()
    }
  })

  it('declines to guess when a word has more than one reading', () => {
    const token = segment('一日').find((t) => t.hit && t.hit.word.r.length > 1)
    if (token) expect(readingOf(token)).toBeNull()
  })

  it('produces a reading that is pure kana whenever it produces one', () => {
    const sentences = [
      'ドイツはバルセロナより涼しいです。',
      '週末は歩いたり走ったりします。',
      '友達に本をすすめてもらいました。',
      '冬は鍋を食べます。',
    ]
    for (const s of sentences) {
      for (const token of segment(s)) {
        const reading = readingOf(token)
        if (reading) expect(reading).toMatch(/^[぀-ヿー]+$/)
      }
    }
  })
})

describe('performance', () => {
  it('segments a sentence fast enough to run on every card', () => {
    const started = performance.now()
    for (let i = 0; i < 20; i++) segment('ドイツはバルセロナより涼しいです。')
    const perCall = (performance.now() - started) / 20
    expect(perCall).toBeLessThan(50)
  })
})

describe('hit shape', () => {
  it('carries everything the tooltip needs', () => {
    const hit: WordHit = lookupWord('涼しい')[0]
    expect(hit.word.k).toContain('涼しい')
    expect(hit.word.r).toContain('すずしい')
    expect(hit.word.s[0].p).toBe('adj-i')
  })
})


/*
 * 来 is the one kanji whose reading changes as its verb inflects — く, き, こ.
 * The generic splice assumed it didn't, which is correct for every other verb
 * and gave くました, くて and くます on three of the deck's own sentences.
 */
describe('来る, the irregular the splice got wrong', () => {
  const reading = (surface: string) => {
    const token = segment(surface).find((t) => t.text.startsWith('来'))
    return token ? readingOf(token) : null
  }

  it('reads 来ます as きます, not くます', () => {
    expect(reading('来ます')).toBe('きます')
  })

  it('reads 来ました as きました', () => {
    expect(reading('来ました')).toBe('きました')
  })

  it('reads 来て as きて', () => {
    expect(reading('来て')).toBe('きて')
  })

  it('still reads the plain form as くる', () => {
    expect(reading('来る')).toBe('くる')
  })

  it('refuses a tail it has no rule for rather than guessing', () => {
    // 来れる, the colloquial potential. Not listed, so no reading — a blank is
    // recoverable and a wrong ruby is not.
    const token = segment('来れる').find((t) => t.text.startsWith('来'))
    if (token && token.text === '来れる') expect(readingOf(token)).toBe(null)
  })
})

describe('readingFor, a reading for a whole phrase', () => {
  it('reads a phrase the teacher left bare', () => {
    expect(readingFor('落ち着く')).toBe('おちつく')
    expect(readingFor('気に入る')).toBe('きにいる')
  })

  it('keeps kana and punctuation between the kanji', () => {
    expect(readingFor('〜同士（で）')).toBe('〜どうし（で）')
  })

  it('has nothing to say about a phrase with no kanji', () => {
    expect(readingFor('〜たびに')).toBe(null)
  })

  it('refuses the whole phrase when one token refuses', () => {
    // Half a reading looks like a finished one. 様態 is a grammar term the
    // dictionary does not carry, so the phrase gets nothing at all.
    expect(readingFor('〜そうです（様態）')).toBe(null)
  })
})
