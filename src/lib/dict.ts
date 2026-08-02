// Dictionary loading, deinflection and lookup.
//
// The files in public/dict/ are fetched on first use rather than bundled, so
// the app's initial load stays small; the service worker's runtime cache keeps
// them available offline afterwards.
//
// Data: JMdict and KANJIDIC2, © Electronic Dictionary Research and Development
// Group, CC BY-SA 4.0.

import { toHiragana } from './furigana.ts'

export interface DictSense {
  /** JMdict part-of-speech tag, e.g. 'adj-i', 'v5r', 'n'. */
  p: string
  /** Spanish glosses. */
  g: string[]
}

export interface DictWord {
  k: string[]
  r: string[]
  s: DictSense[]
  c?: 1
  /** Forms JMdict flags as rare, irregular or outdated for this entry. */
  rare?: string[]
}

export interface KanjiInfo {
  /** on'yomi */
  o: string[]
  /** kun'yomi, with the . that marks where okurigana begins */
  k: string[]
  m: string[]
  /** meanings are English because KANJIDIC has no Spanish gloss for it */
  en?: 1
  g?: number
}

export interface WordHit {
  word: DictWord
  /** The surface text that matched, as it appears in the sentence. */
  surface: string
  /** The dictionary form it was reduced to, if it was inflected. */
  base: string
  /** Human-readable chain of what was undone, e.g. ['polite', 'te-form']. */
  via: string[]
  /** True when this came from the user's own deck rather than JMdict. */
  deck?: true
  /** The deck entry, so the UI can link to it. */
  entryId?: string
  /** Ranking score; exposed so callers can tell a clear win from a coin flip. */
  score: number
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

interface Loaded {
  words: DictWord[]
  /** Every kanji and kana form → indices into `words`. */
  index: Map<string, number[]>
  kanji: Record<string, KanjiInfo>
  /** Longest key in the index, to bound the segmenter's window. */
  maxKeyLength: number
}

let loaded: Loaded | null = null
let loading: Promise<Loaded> | null = null

export const isDictLoaded = (): boolean => loaded !== null

function build(words: DictWord[], kanji: Record<string, KanjiInfo>): Loaded {
  const index = new Map<string, number[]>()
  let maxKeyLength = 1
  words.forEach((w, i) => {
    for (const form of [...w.k, ...w.r]) {
      if (!form) continue
      const at = index.get(form)
      if (at) at.push(i)
      else index.set(form, [i])
      if (form.length > maxKeyLength) maxKeyLength = form.length
    }
  })
  return { words, index, kanji, maxKeyLength }
}

/**
 * Install already-parsed dictionary data, bypassing the network. Used by the
 * tests, which read public/dict/ straight off disk.
 */
export function installDict(words: DictWord[], kanji: Record<string, KanjiInfo>): void {
  loaded = build(words, kanji)
}

/** Idempotent: concurrent callers share one fetch. */
export function loadDict(base = import.meta.env.BASE_URL): Promise<Loaded> {
  if (loaded) return Promise.resolve(loaded)
  if (loading) return loading

  loading = (async () => {
    const [wordsRes, kanjiRes] = await Promise.all([
      fetch(`${base}dict/words.json`),
      fetch(`${base}dict/kanji.json`),
    ])
    if (!wordsRes.ok || !kanjiRes.ok) {
      throw new Error('Could not load the dictionary files.')
    }
    const wordsJson = (await wordsRes.json()) as { words: DictWord[] }
    const kanjiJson = (await kanjiRes.json()) as { kanji: Record<string, KanjiInfo> }

    loaded = build(wordsJson.words, kanjiJson.kanji)
    return loaded
  })()

  loading.catch(() => {
    // Allow a retry after a failed fetch instead of caching the rejection.
    loading = null
  })
  return loading
}

export const kanjiInfo = (ch: string): KanjiInfo | undefined => loaded?.kanji[ch]

// ---------------------------------------------------------------------------
// The deck as the primary authority
// ---------------------------------------------------------------------------

/**
 * The user's own deck outranks JMdict for any word it contains.
 *
 * This is the answer to "how do we make sure everything uses the correct
 * translation". 行った is genuinely the past of both 行く (いく, "ir") and 行う
 * (おこなう, "ejecutar") — both are common, both take った regularly for their
 * class, so nothing in the dictionary breaks the tie. But the deck already
 * says 行く means "ir", and the teacher's gloss is the definition that matters
 * for these cards. Consulting it first fixes the ambiguity *and* keeps every
 * tooltip consistent with the card it appears on.
 */
interface DeckWord {
  word: DictWord
  entryId: string
}

let deckIndex = new Map<string, DeckWord[]>()

export function installDeck(
  entries: { id: string; kind: string; kanji?: string | null; kana?: string; meaning: string }[],
): void {
  const index = new Map<string, DeckWord[]>()
  for (const e of entries) {
    if (e.kind !== 'word') continue
    const kanji = e.kanji ?? null
    const kana = e.kana ?? ''
    if (!kanji && !kana) continue

    // Several deck entries pack alternatives into one field — 入れる／淹れる,
    // 飛ぶ／飛ばす, 湿気／湿度. Indexed whole they match nothing, so those five
    // words were silently absent from lookup entirely.
    const splitForms = (s: string) =>
      s
        .split(/[／/]/)
        .map((p) => p.trim())
        .filter(Boolean)

    const kanjiForms = kanji ? splitForms(kanji) : []
    const kanaForms = kana ? splitForms(kana) : []

    const word: DictWord = {
      k: kanjiForms,
      r: kanaForms,
      s: [{ p: 'deck', g: [e.meaning] }],
      c: 1,
    }
    for (const form of [...kanjiForms, ...kanaForms]) {
      const at = index.get(form)
      if (at) at.push({ word, entryId: e.id })
      else index.set(form, [{ word, entryId: e.id }])
    }
  }
  deckIndex = index
}

// ---------------------------------------------------------------------------
// Deinflection
// ---------------------------------------------------------------------------

/**
 * Rules are applied repeatedly, longest suffix first, to peel a surface form
 * back toward a dictionary form. Each rule is (suffix → replacement), so
 * 食べてしまいました → …しまう → 食べて → 食べる takes several passes.
 *
 * This is not a morphological analyser. It over-generates candidates on
 * purpose: anything that isn't a real word simply fails the dictionary lookup,
 * so a wrong guess costs nothing.
 */
/**
 * The godan conjugation grid, one row per consonant: [dictionary, a, i, e, o].
 *
 * Every godan ending attaches to one of these four stems, so the rules are
 * generated from the table rather than written out. Hand-listing them meant
 * three separate gaps found only by using the app — the irregular 行った, the
 * bare masu-stem 降り, and the passive 言われる, each of which silently
 * resolved to an unrelated noun instead.
 */
const GODAN_ROWS: [string, string, string, string, string][] = [
  ['う', 'わ', 'い', 'え', 'お'],
  ['く', 'か', 'き', 'け', 'こ'],
  ['ぐ', 'が', 'ぎ', 'げ', 'ご'],
  ['す', 'さ', 'し', 'せ', 'そ'],
  ['つ', 'た', 'ち', 'て', 'と'],
  ['ぬ', 'な', 'に', 'ね', 'の'],
  ['ぶ', 'ば', 'び', 'べ', 'ぼ'],
  ['む', 'ま', 'み', 'め', 'も'],
  ['る', 'ら', 'り', 'れ', 'ろ'],
]

/** Suffixes by which stem they attach to. */
const A_SUFFIXES: [string, string][] = [
  ['れる', 'passive'],
  ['れます', 'passive'],
  ['れました', 'passive past'],
  ['れて', 'passive'],
  ['せる', 'causative'],
  ['せます', 'causative'],
  ['される', 'causative-passive'],
  ['ない', 'negative'],
  ['なかった', 'past negative'],
  ['なくて', 'negative'],
  ['ず', 'negative'],
]

const I_SUFFIXES: [string, string][] = [
  ['たい', '〜たい'],
  ['たかった', '〜たい'],
  ['たくない', '〜たい'],
  ['ながら', '〜ながら'],
  ['やすい', '〜やすい'],
  ['にくい', '〜にくい'],
  ['すぎる', '〜すぎる'],
  ['', 'stem'],
]

const E_SUFFIXES: [string, string][] = [
  ['る', 'potential'],
  ['ます', 'potential'],
  ['ば', '〜ば'],
  ['', 'imperative'],
]

const O_SUFFIXES: [string, string][] = [['う', 'volitional']]

const godanRules = GODAN_ROWS.flatMap(([dict, a, i, e, o]) => [
  ...A_SUFFIXES.map(([s, name]) => ({ from: a + s, to: dict, name })),
  ...I_SUFFIXES.map(([s, name]) => ({ from: i + s, to: dict, name })),
  ...E_SUFFIXES.map(([s, name]) => ({ from: e + s, to: dict, name })),
  ...O_SUFFIXES.map(([s, name]) => ({ from: o + s, to: dict, name })),
])

/** The i-row → dictionary mapping, reused for the polite endings below. */
const I_TO_U: [string, string][] = GODAN_ROWS.map(([dict, , i]) => [i, dict])

const POLITE_ENDINGS: [string, string][] = [
  ['ませんでした', 'polite past negative'],
  ['ましょう', 'volitional'],
  ['ました', 'polite past'],
  ['ません', 'polite negative'],
  ['まして', 'te-form'],
  ['ます', 'polite'],
]

const politeRules = POLITE_ENDINGS.flatMap(([ending, name]) => [
  // Godan: 行き|ます → 行く
  ...I_TO_U.map(([i, u]) => ({ from: i + ending, to: u, name })),
  // Ichidan: 食べ|ます → 食べる
  { from: ending, to: 'る', name },
])

/**
 * Ichidan equivalents. 食べ is the stem for everything, so each ending simply
 * maps back to 〜る.
 */
const ICHIDAN_SUFFIXES: [string, string][] = [
  ['られる', 'passive'],
  ['させる', 'causative'],
  ['させられる', 'causative-passive'],
  ['ない', 'negative'],
  ['なかった', 'past negative'],
  ['たい', '〜たい'],
  ['たかった', '〜たい'],
  ['ながら', '〜ながら'],
  ['すぎる', '〜すぎる'],
  ['よう', 'volitional'],
  ['れば', '〜ば'],
  ['ろ', 'imperative'],
  ['', 'stem'],
]

const ichidanRules = ICHIDAN_SUFFIXES.map(([s, name]) => ({ from: s, to: 'る', name }))

const RULES: { from: string; to: string; name: string }[] = [
  ...politeRules,
  { from: 'です', to: '', name: 'polite' },

  // Irregulars. Without these the verbs are simply unreachable: 行く is v5k-s,
  // whose past is 行った rather than the regular 行いた, so 行った could only
  // ever resolve to 行う ("ejecutar") — the wrong verb entirely.
  { from: '行った', to: '行く', name: 'past' },
  { from: '行って', to: '行く', name: 'te-form' },
  { from: 'いった', to: 'いく', name: 'past' },
  { from: 'いって', to: 'いく', name: 'te-form' },
  { from: 'きた', to: 'くる', name: 'past' },
  { from: 'きて', to: 'くる', name: 'te-form' },
  { from: '来た', to: '来る', name: 'past' },
  { from: '来て', to: '来る', name: 'te-form' },
  { from: 'した', to: 'する', name: 'past' },
  { from: 'して', to: 'する', name: 'te-form' },
  { from: '問うた', to: '問う', name: 'past' },

  // Auxiliaries that attach to the te-form.
  { from: 'てしまう', to: 'て', name: '〜てしまう' },
  { from: 'でしまう', to: 'で', name: '〜てしまう' },
  { from: 'ている', to: 'て', name: 'progressive' },
  { from: 'でいる', to: 'で', name: 'progressive' },
  { from: 'ておく', to: 'て', name: '〜ておく' },
  { from: 'てある', to: 'て', name: '〜てある' },
  { from: 'ていく', to: 'て', name: '〜ていく' },
  { from: 'てくる', to: 'て', name: '〜てくる' },
  { from: 'てみる', to: 'て', name: '〜てみる' },

  // te-form and past, per verb class.
  { from: 'して', to: 'す', name: 'te-form' },
  { from: 'いて', to: 'く', name: 'te-form' },
  { from: 'いで', to: 'ぐ', name: 'te-form' },
  { from: 'んで', to: 'む', name: 'te-form' },
  { from: 'んで', to: 'ぶ', name: 'te-form' },
  { from: 'んで', to: 'ぬ', name: 'te-form' },
  { from: 'って', to: 'う', name: 'te-form' },
  { from: 'って', to: 'つ', name: 'te-form' },
  { from: 'って', to: 'る', name: 'te-form' },
  { from: 'した', to: 'す', name: 'past' },
  { from: 'いた', to: 'く', name: 'past' },
  { from: 'いだ', to: 'ぐ', name: 'past' },
  { from: 'んだ', to: 'む', name: 'past' },
  { from: 'んだ', to: 'ぶ', name: 'past' },
  { from: 'んだ', to: 'ぬ', name: 'past' },
  { from: 'った', to: 'う', name: 'past' },
  { from: 'った', to: 'つ', name: 'past' },
  { from: 'った', to: 'る', name: 'past' },
  // Ichidan: 食べて → 食べる, 食べた → 食べる
  { from: 'て', to: 'る', name: 'te-form' },
  { from: 'た', to: 'る', name: 'past' },

  // Negatives.
  { from: 'なかった', to: 'る', name: 'past negative' },
  { from: 'ない', to: 'る', name: 'negative' },
  { from: 'わない', to: 'う', name: 'negative' },
  { from: 'かない', to: 'く', name: 'negative' },
  { from: 'がない', to: 'ぐ', name: 'negative' },
  { from: 'さない', to: 'す', name: 'negative' },
  { from: 'たない', to: 'つ', name: 'negative' },
  { from: 'まない', to: 'む', name: 'negative' },
  { from: 'ばない', to: 'ぶ', name: 'negative' },
  { from: 'らない', to: 'る', name: 'negative' },

  // Potential / passive / causative, reduced to the plain form.
  { from: 'られる', to: 'る', name: 'potential' },
  { from: 'させる', to: 'する', name: 'causative' },
  { from: 'える', to: 'う', name: 'potential' },
  { from: 'ける', to: 'く', name: 'potential' },
  { from: 'げる', to: 'ぐ', name: 'potential' },
  { from: 'せる', to: 'す', name: 'potential' },
  { from: 'てる', to: 'つ', name: 'potential' },
  { from: 'める', to: 'む', name: 'potential' },
  { from: 'べる', to: 'ぶ', name: 'potential' },
  { from: 'れる', to: 'る', name: 'potential' },

  // Desiderative and conditionals.
  { from: 'たい', to: 'る', name: '〜たい' },
  { from: 'たら', to: 'る', name: '〜たら' },
  { from: 'えば', to: 'う', name: '〜ば' },
  { from: 'ければ', to: 'い', name: '〜ば' },

  // i-adjectives.
  { from: 'かった', to: 'い', name: 'past' },
  { from: 'くない', to: 'い', name: 'negative' },
  { from: 'くて', to: 'い', name: 'te-form' },
  { from: 'く', to: 'い', name: 'adverbial' },
  { from: 'さ', to: 'い', name: 'nominalised' },

  // する compounds.
  { from: 'します', to: 'する', name: 'polite' },
  { from: 'しました', to: 'する', name: 'polite past' },
  { from: 'された', to: 'する', name: 'passive past' },
  { from: 'される', to: 'する', name: 'passive' },

  // Last: the generated grid over-generates heavily by design — any word
  // ending in り yields a candidate ending in る. That costs nothing, because
  // a candidate that isn't a real word simply fails the dictionary lookup.
  ...godanRules,
  ...ichidanRules,
]

const MAX_DEPTH = 4

/**
 * Every plausible dictionary form of `surface`, best first. Always includes
 * the surface itself, since most lookups need no deinflection at all.
 */
export function deinflect(surface: string): { form: string; via: string[] }[] {
  const seen = new Map<string, string[]>([[surface, []]])
  const queue: { form: string; via: string[] }[] = [{ form: surface, via: [] }]

  for (let head = 0; head < queue.length; head++) {
    const { form, via } = queue[head]
    if (via.length >= MAX_DEPTH) continue

    for (const rule of RULES) {
      if (!form.endsWith(rule.from)) continue
      const stem = form.slice(0, form.length - rule.from.length)
      // Refuse to strip a word down to nothing or to a bare okurigana.
      if (!stem && !rule.to) continue
      const next = stem + rule.to
      if (!next || next === form || seen.has(next)) continue
      const chain = [...via, rule.name]
      seen.set(next, chain)
      queue.push({ form: next, via: chain })
    }
  }

  return [...seen].map(([form, via]) => ({ form, via }))
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Where the matched form sits in the entry's own list of writings/readings.
 * 0 means it is the entry's primary form.
 */
function formRank(word: DictWord, form: string): number {
  const k = word.k.indexOf(form)
  const r = word.r.indexOf(form)
  const ranks = [k, r].filter((i) => i >= 0)
  return ranks.length ? Math.min(...ranks) : 0
}

function score(hit: Omit<WordHit, 'score'>): number {
  return (
    // The user's own deck is the authority on words it contains.
    (hit.deck ? 1000 : 0) +
    (hit.word.c ? 100 : 0) -
    // Matching an entry's *primary* form beats matching an obscure alternate.
    // この is 此の's first reading but 九's fourth, which is the only thing
    // separating "este" from "nueve (en documentos legales)".
    formRank(hit.word, hit.base) * 20 -
    // A form JMdict flags as rare for *this* entry. 彼 is everyday for かれ
    // ("él") and rare for あれ ("aquello"); they otherwise tie exactly.
    (hit.word.rare?.includes(hit.base) ? 60 : 0) -
    // Fewer steps of deinflection is a closer match.
    hit.via.length * 10
  )
}

/** All entries matching a surface form, best match first, deck entries ahead. */
export function lookupWord(surface: string): WordHit[] {
  const partial: Omit<WordHit, 'score'>[] = []
  const usedDeck = new Set<string>()

  for (const { form, via } of deinflect(surface)) {
    for (const { word, entryId } of deckIndex.get(form) ?? []) {
      if (usedDeck.has(entryId)) continue
      usedDeck.add(entryId)
      partial.push({ word, surface, base: form, via, deck: true, entryId })
    }
  }

  if (loaded) {
    const used = new Set<DictWord>()
    for (const { form, via } of deinflect(surface)) {
      for (const i of loaded.index.get(form) ?? []) {
        const word = loaded.words[i]
        if (used.has(word)) continue
        used.add(word)
        partial.push({ word, surface, base: form, via })
      }
    }
  }

  return partial
    .map((h) => ({ ...h, score: score(h) }))
    .sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

export interface Token {
  text: string
  /** Index in the original string. */
  at: number
  /** The best dictionary hit, if this token is a known word. */
  hit: WordHit | null
  /** Other readings this surface could be, best first. Capped for the UI. */
  alternatives: WordHit[]
}

const MAX_ALTERNATIVES = 3

const PUNCT = /[\s、。，．・「」『』（）()！？!?〜～ー…]/

/**
 * Longest-match segmentation, left to right.
 *
 * Not a morphological analyser — it just finds the longest span at each
 * position that resolves to a dictionary word (after deinflection). That is
 * plenty for hover lookup and for placing furigana; the failure mode is an
 * over-long or over-short span, not a wrong reading, because the reading
 * always comes from the matched entry itself.
 */
export function segment(text: string): Token[] {
  const out: Token[] = []
  if (!loaded) return [{ text, at: 0, hit: null, alternatives: [] }]

  const limit = Math.min(loaded.maxKeyLength, 12)
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (PUNCT.test(ch)) {
      out.push({ text: ch, at: i, hit: null, alternatives: [] })
      i++
      continue
    }

    let best: { hits: WordHit[]; length: number } | null = null
    const maxLen = Math.min(limit, text.length - i)
    for (let len = maxLen; len >= 1; len--) {
      const hits = lookupWord(text.slice(i, i + len))
      if (hits.length) {
        best = { hits, length: len }
        break
      }
    }

    if (best) {
      out.push({
        text: text.slice(i, i + best.length),
        at: i,
        hit: best.hits[0],
        alternatives: best.hits.slice(1, 1 + MAX_ALTERNATIVES),
      })
      i += best.length
    } else {
      out.push({ text: ch, at: i, hit: null, alternatives: [] })
      i++
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// What is worth explaining
// ---------------------------------------------------------------------------

/** Parts of speech that carry grammar rather than meaning. */
const FUNCTION_POS = new Set([
  'prt',
  'cop',
  'aux',
  'aux-v',
  'aux-adj',
  'conj',
  'int',
  'pn',
  'pref',
  'suf',
  'ctr',
])

/**
 * True when a token deserves a tooltip.
 *
 * Not everything with a dictionary hit is worth explaining. Glossing every
 * particle buries the one word on the card the user actually didn't know, and
 * explaining the card's own grammar point is circular.
 *
 * Part of speech alone is not enough: the Spanish JMdict subset has no
 * particle entry for は or が, so longest-match resolves them to the nouns 羽
 * ("pluma") and 画 ("pintura") — nonsense on a card, and tagged `n`. Hence the
 * single-kana rule, which is the reliable signal: a lone kana in running text
 * is a particle essentially without exception.
 *
 * @param taught Text the card is already teaching — its pattern or headword.
 *               Tokens appearing inside it are skipped.
 */
export function isWorthExplaining(
  token: Token,
  taught = '',
  /** The full token list, so neighbours can be inspected. */
  siblings?: Token[],
): boolean {
  const hit = token.hit
  if (!hit) return false

  const text = token.text

  // A lone kanji flanked by more kanji is almost always a compound the
  // dictionary doesn't carry. 出汁 (だし) is absent from the Spanish JMdict
  // subset, so it segments to 出|汁 and glosses them "flujo" and "jugo" —
  // both individually true and together nonsense.
  if (text.length === 1 && /[㐀-鿿]/.test(text) && siblings && !hit.deck) {
    const i = siblings.indexOf(token)
    const before = siblings[i - 1]?.text.at(-1) ?? ''
    const after = siblings[i + 1]?.text[0] ?? ''
    if (/[㐀-鿿]/.test(before) || /[㐀-鿿]/.test(after)) return false
  }

  // Kanji, or a word the user actually has. Nothing else.
  //
  // This is the load-bearing rule. Longest-match against 34,000 entries means
  // almost any two-kana run resolves to *something*: ものがいい segments as
  // もの|がい|と and glosses がい as 害 "daño"; 健康のために yields のた as 乗る.
  // They are not words, they are particles glued to fragments, and each one
  // got a confident tooltip. Requiring kanji removes the entire class, while
  // the deck index keeps genuinely kana words (もったいない, にんにく) working.
  if (!/[㐀-鿿]/.test(text) && !hit.deck) return false

  if (FUNCTION_POS.has(hit.word.s[0].p)) return false

  // The card is teaching this; a tooltip would explain it back to the user.
  if (taught && (taught.includes(text) || taught.includes(hit.base))) return false

  return true
}

/**
 * Words whose readings are not variants of one another but genuinely
 * different words, distinguishable only by context. Printing either one is a
 * coin flip, so these get no furigana at all.
 */
const AMBIGUOUS_READINGS = new Set([
  '一日', // ついたち (the 1st) vs いちにち (one day)
  '十分', // じゅうぶん (enough) vs じっぷん (ten minutes)
  '人気', // にんき (popularity) vs ひとけ (sign of life)
  '上手', // じょうず (skilled) vs うわて (upper hand)
  '下手', // へた (unskilled) vs したて (humble)
  '大人', // おとな (adult) vs だいにん
  '今日', // きょう (today) vs こんにち (nowadays)
  '一人', // ひとり vs いちにん
])

/**
 * The reading of a matched token, for furigana over a sentence.
 * Returns null when the token is kana already or has no reliable reading.
 */
export function readingOf(token: Token): string | null {
  if (!token.hit) return null
  const { word, surface, base } = token.hit

  // Kana needs no furigana. Without this the particle は matches the noun 羽
  // and gets annotated はね — a wrong reading on the commonest character in
  // the language.
  if (!/[㐀-鿿]/.test(surface)) return null

  // A deck entry is authoritative — the teacher's own reading wins outright.
  if (!token.hit.deck) {
    // Genuinely bimodal words, where the two readings are different words with
    // different meanings and only context can choose. Deliberately a short,
    // explicit list: refusing furigana whenever an entry merely *lists* more
    // than one reading killed 魚 (さかな, plus the rare うお/いお/とと/な) and
    // 言う (いう/ゆう), which is most of the sentence.
    if (AMBIGUOUS_READINGS.has(base)) return null

    // Refuse to choose between different *words* only when it is a genuine
    // coin flip — an alternative scoring at least as high, with a different
    // reading. 行った ties 行く (いく) against 行う (おこなう), so it gets none.
    // 降り is also ambiguous (下り, くだり) but 降る wins outright, and
    // suppressing on any disagreement at all left it bare.
    for (const alt of token.alternatives) {
      if (alt.score < token.hit.score) continue
      const altReading = alt.word.r[0]
      if (altReading && toHiragana(altReading) !== toHiragana(word.r[0])) return null
    }
  }

  // Printed as stored, never normalised. Hiragana-ising the whole reading
  // rewrote 赤ピーマン's あかピーマン into あかぴーまん — harmless only because
  // alignment compares case-normalised, and wrong the moment a katakana run
  // lands in a ruby. toHiragana stays for comparisons above; the ordering in
  // the trimmed dictionary already puts the common reading first.
  const reading = word.r[0] ?? ''
  if (!reading) return null

  // The dictionary reading describes the *base* form. If the surface was
  // inflected, only reuse the reading when the base is a prefix of the
  // surface — otherwise the ruby would describe the wrong characters.
  if (surface !== base) {
    if (!word.k.includes(base)) return null
    const stem = base.replace(/[ぁ-ゟ]+$/, '')
    if (!surface.startsWith(stem)) return null
    const tail = surface.slice(stem.length)
    const readingStem = reading.replace(new RegExp(`${base.slice(stem.length)}$`), '')
    return readingStem + tail
  }

  return reading
}
