// Heuristic parser for text pasted out of WhatsApp.
//
// The teacher's messages have no fixed format, so this guesses and reports how
// confident it is per line. Nothing it produces is saved without the user
// seeing it first — the Add view shows every draft in an editable table.

import type { Entry } from './types.ts'
import {
  firstLatinWordIndex,
  hasJapanese,
  hasKanji,
  isAllKana,
  looksLikeReading,
  makeId,
  normalizePattern,
  splitFields,
  splitVariants,
  stripPlaceholder,
} from './text.ts'

export type Confidence = 'high' | 'medium' | 'low'

export interface Draft {
  /** Row is included in the save unless the user unticks it. */
  include: boolean
  kind: 'word' | 'pattern'
  kanji: string
  kana: string
  pattern: string
  meaning: string
  /** Extra Japanese the teacher appended: です, する, a katakana synonym. */
  note: string
  exampleTarget: string
  exampleNative: string
  category: string
  subcategory: string
  confidence: Confidence
  /** The original line, shown on hover so the user can check the guess. */
  raw: string
  issues: string[]
}

export interface ParseDefaults {
  category: string
  subcategory: string
}

/** Separators the teacher actually uses between a word and its gloss. */
const SEPARATOR = /\s*(?:=|＝|：|:|→|⇒|—|–|\s-\s)\s*/

/**
 * A Japanese sentence plus a parenthesised translation, at end of line.
 * The sentence may only contain Japanese characters and Japanese punctuation —
 * otherwise `酢（す）vinagre 酢を入れます。(…)` matches from the reading onward
 * and swallows the meaning into the example.
 */
const TRAILING_EXAMPLE =
  /([ぁ-ヿ㐀-䶿一-鿿々〆〜～、。，．・「」『』…ー\d\s]*[。！？])\s*[（(]\s*([^（）()]*?)\s*[)）]\s*$/

/** A parenthesised reading immediately after the writing. */
const INLINE_READING = /^(.+?)\s*[（(]\s*([^（）()]+?)\s*[)）]\s*(.*)$/

const isSkippable = (line: string): boolean =>
  !line.trim() ||
  /^#{1,6}\s/.test(line) ||
  /^[-–—*_]{3,}$/.test(line.trim()) ||
  /^\|[\s:|-]+\|$/.test(line.trim()) ||
  /^\d{1,2}:\d{2}$/.test(line.trim())

function emptyDraft(raw: string, defaults: ParseDefaults): Draft {
  return {
    include: true,
    kind: 'word',
    kanji: '',
    kana: '',
    pattern: '',
    meaning: '',
    note: '',
    exampleTarget: '',
    exampleNative: '',
    category: defaults.category,
    subcategory: defaults.subcategory,
    confidence: 'low',
    raw,
    issues: [],
  }
}

/**
 * A full WhatsApp export line: `[10/10/2026, 13:54:24] せんせい: 奇抜　きばつ`.
 * The bracketed timestamp makes the sender unambiguous, so the name is safe to
 * strip even when it is itself Japanese — which せんせい is.
 */
const WHATSAPP_LINE = /^\[[^\]]{6,40}\]\s*[^:：]{1,40}[:：]\s*/

/** Strip WhatsApp furniture: timestamps, sender names, bullets, numbering. */
function clean(line: string): string {
  let out = line.replace(WHATSAPP_LINE, '')
  if (out === line) {
    // No timestamp to disambiguate, so only strip a leading label that is
    // clearly not content — i.e. contains no Japanese.
    out = out.replace(/^[^:：]{0,24}[:：]\s*(?=[^\s])/, (m) => (hasJapanese(m) ? m : ''))
  }
  return out
    .replace(/^[-*•·>\s]+/, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim()
}

function fromCells(cells: string[], defaults: ParseDefaults, raw: string): Draft {
  const d = emptyDraft(raw, defaults)
  d.confidence = 'high'

  if (cells.length >= 4) {
    const kanji = stripPlaceholder(cells[0])
    d.kanji = kanji ?? ''
    d.kana = stripPlaceholder(cells[1]) ?? ''
    d.meaning = cells[2] ?? ''
    applyExample(d, cells[3])
  } else if (cells.length === 3) {
    // Either kanji|kana|meaning or pattern|meaning|example.
    if (isAllKana(cells[1]) && !hasJapanese(cells[2])) {
      d.kanji = stripPlaceholder(cells[0]) ?? ''
      d.kana = cells[1]
      d.meaning = cells[2]
    } else {
      d.kind = 'pattern'
      d.pattern = cells[0]
      d.meaning = cells[1]
      applyExample(d, cells[2])
    }
  } else {
    assignTarget(d, cells[0] ?? '')
    d.meaning = cells[1] ?? ''
  }

  finalise(d)
  return d
}

function applyExample(d: Draft, cell: string | undefined): void {
  const t = stripPlaceholder(cell)
  if (!t) return
  const m = t.match(/^([\s\S]*?)\s*[（(]\s*([^（）()]*?)\s*[)）]\s*$/)
  if (m) {
    d.exampleTarget = m[1].trim()
    d.exampleNative = m[2].trim()
  } else {
    d.exampleTarget = t
  }
}

/**
 * Fill kanji/kana/pattern from a target-language string, handling both the
 * user's own `進歩・しんぽ` shorthand and a bare writing.
 */
function assignTarget(d: Draft, target: string): void {
  const t = target.trim()
  if (!t) return

  if (/[〜～]/.test(t)) {
    d.kind = 'pattern'
    d.pattern = t
    return
  }

  // 進歩・しんぽ — but not katakana words that legitimately contain ・
  const dot = t.split('・')
  if (dot.length === 2 && hasKanji(dot[0]) && isAllKana(dot[1])) {
    d.kanji = dot[0].trim()
    d.kana = dot[1].trim()
    return
  }

  // 風邪 かぜ — writing and reading separated by a space
  const words = t.split(/\s+/)
  if (words.length === 2 && hasKanji(words[0]) && isAllKana(words[1])) {
    d.kanji = words[0]
    d.kana = words[1]
    return
  }

  if (hasKanji(t)) d.kanji = t
  else d.kana = t
}

function finalise(d: Draft): void {
  // A tilde anywhere means this is a grammar pattern, however it arrived.
  if (d.kind === 'word' && /[〜～]/.test(d.kanji + d.kana)) {
    d.kind = 'pattern'
    d.pattern = d.kanji || d.kana
    d.kanji = ''
    d.kana = ''
  }

  // "Verbo (ます形)" is how the textbook writes it; Vます is how it reads best.
  if (d.kind === 'pattern') d.pattern = normalizePattern(d.pattern)

  // A writing with no reading is fine for kana-only words; flag it otherwise.
  if (d.kind === 'word') {
    if (!d.kana && !d.kanji) d.issues.push('no Japanese found')
    if (d.kanji && !d.kana) d.issues.push('no reading')
    if (!d.kanji && d.kana && hasKanji(d.kana)) {
      d.kanji = d.kana
      d.kana = ''
    }
  } else if (!d.pattern) {
    d.issues.push('no pattern found')
  }

  // The teacher's messages frequently carry no translation at all. That is a
  // row to fill in, not a row to throw away — keep it selected so the user can
  // type the meaning straight into the draft table.
  if (!d.meaning.trim()) d.issues.push('needs meaning')
  if (d.exampleTarget && !d.exampleNative) d.issues.push('example not translated')

  // Latin glued into the middle of the Japanese usually means the line is a
  // reference rather than vocabulary — 理解p118　しゅくだい is homework.
  if (/[A-Za-z]/.test(d.kanji + d.kana + d.pattern)) d.issues.push('check — contains letters')

  const fatal = d.issues.some(
    (i) => i.startsWith('no Japanese') || i.startsWith('no pattern') || i.startsWith('check'),
  )
  if (fatal) {
    d.confidence = 'low'
    d.include = false
  } else if (d.issues.length) {
    d.confidence = d.confidence === 'high' ? 'medium' : d.confidence
  }
}

function parseLine(raw: string, defaults: ParseDefaults): Draft | null {
  if (isSkippable(raw)) return null

  const trimmed = raw.trim()

  // Markdown table row
  if (trimmed.startsWith('|')) {
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim())
    if (cells[0]?.toLowerCase() === 'kanji' || cells[0]?.toLowerCase() === 'patrón') return null
    return fromCells(cells, defaults, raw)
  }

  const line = clean(raw)
  if (!line || !hasJapanese(line)) return null

  const d = emptyDraft(raw, defaults)

  // Peel the example off the end before anything else, so its Spanish gloss
  // isn't mistaken for the word's meaning.
  let rest = line
  const ex = rest.match(TRAILING_EXAMPLE)
  if (ex) {
    d.exampleTarget = ex[1].trim()
    d.exampleNative = ex[2].trim()
    rest = rest.slice(0, ex.index).trim()
  }

  // The teacher's dominant format is fields separated by an ideographic space:
  //   奇抜　きばつ　です
  //   品質　ひんしつ　クオリティ
  //   服を試す　ためす
  // Field 0 is the writing, field 1 the reading, and anything after is an
  // aside — a Spanish gloss if it's Latin, otherwise a note (です / する /
  // a katakana synonym).
  const fields = splitFields(rest)
  if (fields.length >= 2 && hasJapanese(fields[0]) && looksLikeReading(fields[1])) {
    if (hasKanji(fields[0])) {
      d.kanji = fields[0]
      d.kana = fields[1]
    } else {
      // Both halves are kana; the first is the word, the second a restatement.
      d.kana = fields[0]
    }
    const extras = fields.slice(2)
    d.meaning = extras.filter((e) => !hasJapanese(e)).join(' ')
    d.note = extras.filter((e) => hasJapanese(e)).join(' ')
    d.confidence = 'high'
    finalise(d)
    return d
  }

  // 慣れる（なれる）acostumbrarse — or 食べる (comer), where the parenthetical
  // is the gloss rather than a reading. Both are common in the teacher's
  // messages, and only the script inside the brackets tells them apart.
  let reading = ''
  let parenMeaning = ''
  const inline = rest.match(INLINE_READING)
  if (inline) {
    if (isAllKana(inline[2])) {
      reading = inline[2].trim()
      rest = `${inline[1].trim()} ${inline[3].trim()}`.trim()
      d.confidence = 'high'
    } else if (!hasJapanese(inline[2])) {
      parenMeaning = inline[2].trim()
      rest = `${inline[1].trim()} ${inline[3].trim()}`.trim()
      d.confidence = 'high'
    }
  }

  // Explicit separator wins over guessing at the script boundary.
  let target = ''
  let meaning = ''
  const sep = rest.split(SEPARATOR)
  if (sep.length >= 2 && hasJapanese(sep[0])) {
    target = sep[0].trim()
    meaning = sep.slice(1).join(' ').trim()
    if (!reading) d.confidence = 'high'
  } else {
    // Only at a token boundary — `理解p118` must not split at the "p".
    const at = firstLatinWordIndex(rest)
    if (at > 0) {
      target = rest.slice(0, at).trim()
      meaning = rest.slice(at).trim()
      if (!reading) d.confidence = 'medium'
    } else {
      target = rest.trim()
      if (!reading) d.confidence = 'low'
    }
  }

  assignTarget(d, target)
  if (reading) {
    // An inline reading always beats whatever assignTarget inferred.
    if (!d.kanji && d.kana) d.kanji = ''
    d.kana = reading
    if (!d.kanji && hasKanji(target)) d.kanji = target.trim()
  }
  d.meaning = (meaning || parenMeaning).replace(/^[,;·]\s*/, '').trim()

  finalise(d)
  return d
}

export function parseBlock(text: string, defaults: ParseDefaults): Draft[] {
  const out: Draft[] = []
  for (const raw of text.split('\n')) {
    const d = parseLine(raw, defaults)
    if (d) out.push(d)
  }
  return out
}

// ---------------------------------------------------------------------------

export function draftToEntry(d: Draft): Entry {
  const base = {
    category: d.category,
    subcategory: d.subcategory || null,
    meaning: d.meaning.trim(),
    example: d.exampleTarget.trim()
      ? { target: d.exampleTarget.trim(), native: d.exampleNative.trim() }
      : null,
    source: 'user' as const,
    relatedIds: [] as string[],
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
  }

  if (d.kind === 'pattern') {
    const pattern = d.pattern.trim()
    return { ...base, kind: 'pattern', id: makeId(d.category, pattern), pattern }
  }

  const kanji = d.kanji.trim() || null
  const kana = d.kana.trim()
  return {
    ...base,
    kind: 'word',
    id: makeId(d.category, kanji ?? kana),
    kanji,
    kana: kana || (kanji ?? ''),
    variants: kanji ? splitVariants(kanji) : [],
  }
}
