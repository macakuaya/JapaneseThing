// Script detection and cell parsing, shared by the Markdown importer
// (scripts/import-md.ts, run under Node) and the in-app paste parser.
// Keep this module dependency-free apart from type-only imports so Node's
// type stripping can load it directly.

import type { Entry, Example } from './types.ts'

const HIRAGANA = /[ぁ-ゟ]/
const KATAKANA = /[゠-ヿ]/
const KANJI = /[㐀-䶿一-鿿]/
const JAPANESE = /[ぁ-ヿ㐀-䶿一-鿿〜～]/
const LATIN_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/

/** Characters that may appear inside a reading without disqualifying it. */
const KANA_FILLER = /[\s・／/ー〜～]/

export const isKana = (ch: string): boolean => HIRAGANA.test(ch) || KATAKANA.test(ch)
export const hasKanji = (s: string): boolean => KANJI.test(s)
export const hasJapanese = (s: string): boolean => JAPANESE.test(s)

/**
 * A plausible *reading* rather than just any kana string: must contain
 * hiragana. Distinguishes the reading from a katakana synonym, so
 * `品質　ひんしつ　クオリティ` takes ひんしつ as the reading and leaves
 * クオリティ as a note.
 */
export function looksLikeReading(s: string): boolean {
  return isAllKana(s) && HIRAGANA.test(s)
}

/** True when every character is kana or harmless filler (・, ／, ー, spaces). */
export function isAllKana(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  for (const ch of t) {
    if (!isKana(ch) && !KANA_FILLER.test(ch)) return false
  }
  return HIRAGANA.test(t) || KATAKANA.test(t)
}

/**
 * The source Markdown writes "no kanji for this word" as an em dash.
 * Returns null for that and for anything else empty.
 */
export function stripPlaceholder(s: string | undefined | null): string | null {
  const t = (s ?? '').trim()
  if (!t || t === '—' || t === '–' || t === '-' || t === '―') return null
  return t
}

/** Split a cell that packed several writings into one, e.g. 飛ぶ／飛ばす. */
export function splitVariants(s: string): string[] {
  return s
    .split(/[／/]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Example cells are uniformly `日本語の文。(Traducción.)`.
 * The prefix is lazy and the group is anchored to the end, so a sentence
 * containing its own parentheses still splits on the trailing translation.
 */
export function splitExample(cell: string | null | undefined): Example | null {
  const t = stripPlaceholder(cell)
  if (!t) return null
  const m = t.match(/^([\s\S]*?)\s*[（(]\s*([^（）()]*?)\s*[)）]\s*$/)
  if (!m) {
    // No translation supplied — keep the Japanese, leave the gloss empty.
    return hasJapanese(t) ? { target: t, native: '' } : null
  }
  const target = m[1].trim()
  const native = m[2].trim()
  if (!target) return null
  return { target, native }
}

/**
 * Pull an inline reading out of `開く（あく）`, used by the trans/intrans table
 * and by pasted text. Returns the reading only when the parenthesised part is
 * actually kana, so `食べる (comer)` is not mistaken for a reading.
 */
export function parseReading(s: string): { kanji: string | null; kana: string } | null {
  const t = s.trim()
  const m = t.match(/^(.+?)\s*[（(]\s*([^（）()]+?)\s*[)）]\s*$/)
  if (m && isAllKana(m[2])) {
    const head = m[1].trim()
    return hasKanji(head) ? { kanji: head, kana: m[2].trim() } : { kanji: null, kana: head }
  }
  if (isAllKana(t)) return { kanji: null, kana: t }
  return null
}

/** Index of the first Latin letter that starts the native-language portion. */
export function firstLatinIndex(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (LATIN_LETTER.test(s[i])) return i
  }
  return -1
}

/**
 * Like firstLatinIndex, but only at a token boundary — the Latin run must be
 * preceded by whitespace, not glued to the Japanese.
 *
 * Without this, `理解p118　しゅくだい` (a homework reference, not vocabulary)
 * splits into 理解 + "p118 しゅくだい" and produces a nonsense card.
 */
export function firstLatinWordIndex(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (!LATIN_LETTER.test(s[i])) continue
    if (i === 0 || /\s/.test(s[i - 1])) return i
  }
  return -1
}

/**
 * Split a line on its field separators: the ideographic space the teacher
 * types between a word and its reading, a tab, or a run of two or more
 * ordinary spaces. A single ASCII space is NOT a separator — it appears
 * inside Spanish glosses.
 */
export function splitFields(s: string): string[] {
  return s
    .split(/[　\t]+| {2,}/)
    .map((f) => f.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------

/**
 * Tidies how a grammar pattern names a verb form.
 *
 *   Verbo (ます形) ＋ はじめる  →  Vます＋はじめる
 *   動詞（て形）＋ ください      →  Vて＋ください
 *
 * Two changes: the spelled-out "Verbo (Xform)" collapses to the compact `VX`
 * a textbook would use, and the spacing around a fullwidth ＋ is removed —
 * fullwidth characters already carry their own visual padding, so the extra
 * spaces just make the line sprawl.
 */
export function normalizePattern(s: string): string {
  return s
    .replace(/(?:Verbo|verbo|VERBO|動詞)\s*[（(]\s*([^（）()]+?)\s*[)）]/g, (whole, form: string) =>
      // Only rewrite when the bracket really holds a Japanese verb form.
      // "el verbo (en pasado)" is prose and must survive untouched.
      isAllKana(form.replace(/形$/, '')) ? `V${form.replace(/形$/, '')}` : whole,
    )
    .replace(/\s*＋\s*/g, '＋')
    .trim()
}

/**
 * A separator slash means "or, alternatively", and reads far better as a line
 * break than as a wrapped run-on:
 *
 *   〜と〜とどちらが〜ですか／〜のほうが〜です
 *   →  〜と〜とどちらが〜ですか
 *      〜のほうが〜です
 *
 * Only a fullwidth ／ or a *spaced* ASCII slash counts. A tight a/b slash is
 * left alone, because the Spanish glosses use it for gender agreement —
 * "el/la menor" and "veterinario/a" must not be broken apart.
 */
export function splitSlashLines(s: string): string[] {
  const parts = s
    .split(/\s*／\s*|\s+\/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length ? parts : [s]
}

/**
 * The front of a card, in the user's own Anki format: `進歩・しんぽ`.
 *
 * Kana-only words render without the interpunct. When one source cell held
 * several writings the variants are zipped with their readings pairwise
 * (飛ぶ・とぶ ／ 飛ばす・とばす); if the counts don't line up — 入れる／淹れる
 * share the single reading いれる — the writings are joined and the reading
 * appended once.
 */
export function cardFront(entry: Entry): string {
  if (entry.kind === 'pattern') {
    return entry.reading && entry.reading !== entry.pattern
      ? `${entry.pattern}・${entry.reading}`
      : entry.pattern
  }

  const kana = entry.kana
  if (!entry.kanji) return kana
  // Belt and braces for the importer's rule: a writing identical to its
  // reading is one word, not two, and must never render as `X・X`.
  if (entry.kanji === kana) return kana

  const writings = entry.variants.length > 1 ? entry.variants : [entry.kanji]
  const readings = splitVariants(kana)

  if (writings.length > 1 && writings.length === readings.length) {
    return writings.map((w, i) => `${w}・${readings[i]}`).join(' ／ ')
  }
  return `${writings.join('／')}・${kana}`
}

/** The target-language string a card asks the user to produce. */
export function cardTarget(entry: Entry): string {
  return entry.kind === 'pattern' ? entry.pattern : (entry.kanji ?? entry.kana)
}

// ---------------------------------------------------------------------------
// Stable ids
// ---------------------------------------------------------------------------

/**
 * FNV-1a over category + the primary target string.
 *
 * Content-addressed rather than positional: seed data is bundled into the
 * build, so an id derived from row order would silently reset the user's
 * scheduling every time the deck is re-imported. The importer asserts that no
 * two entries collide.
 */
export function makeId(category: string, primary: string, role?: string): string {
  const input = `${category}\0${primary}\0${role ?? ''}`
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).padStart(7, '0')
}
