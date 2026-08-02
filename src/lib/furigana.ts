// Aligning a written form with its reading, so furigana sits over the right
// characters instead of over the whole word.
//
// The alignment is purely structural: kana in the writing must match the same
// kana in the reading, and whatever is left over belongs to the kanji between
// them. That is enough for 慣れる/なれる and 落ち着く/おちつく. It cannot split
// 進歩/しんぽ — nothing in the strings says where しん ends — so that case
// falls back to one ruby over the whole kanji run, which is still correct,
// just less precise.

import { isKana } from './text.ts'

export interface RubySegment {
  text: string
  /** Reading to print above `text`; empty for kana that reads as itself. */
  ruby: string
}

/** Hiragana and katakana are interchangeable for matching purposes. */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

const kanaEq = (a: string, b: string): boolean => toHiragana(a) === toHiragana(b)

/**
 * Split a writing into runs of kanji and runs of kana.
 * 落ち着く → ['落', 'ち', '着', 'く']  (as runs, not characters)
 */
function runs(word: string): { text: string; kana: boolean }[] {
  const out: { text: string; kana: boolean }[] = []
  for (const ch of word) {
    const kana = isKana(ch) || ch === 'ー'
    const last = out[out.length - 1]
    if (last && last.kana === kana) last.text += ch
    else out.push({ text: ch, kana })
  }
  return out
}

/**
 * Align `word` with `reading`.
 *
 * Returns one segment per run. A run of kanji gets the slice of the reading
 * that falls between its neighbouring kana anchors; kana runs get no ruby.
 * If the two strings can't be reconciled, returns a single segment covering
 * the whole word — never a wrong alignment.
 */
export function alignFurigana(word: string, reading: string): RubySegment[] {
  if (!word) return []
  if (!reading || kanaEq(word, reading)) return [{ text: word, ruby: '' }]

  const parts = runs(word)
  const out: RubySegment[] = []
  let at = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part.kana) {
      // The reading must contain this kana run here; if it doesn't, the two
      // strings disagree and we bail rather than guess.
      if (!kanaEq(reading.slice(at, at + part.text.length), part.text)) {
        return [{ text: word, ruby: reading }]
      }
      out.push({ text: part.text, ruby: '' })
      at += part.text.length
      continue
    }

    const next = parts[i + 1]
    if (!next) {
      // Trailing kanji run takes the rest of the reading.
      const rest = reading.slice(at)
      if (!rest) return [{ text: word, ruby: reading }]
      out.push({ text: part.text, ruby: rest })
      at = reading.length
      continue
    }

    // Find where the following kana run starts in the reading. Search forward
    // so that a kana that also occurs inside the kanji's reading doesn't
    // truncate it early — 話し合う/はなしあう must not stop at the first し.
    let found = -1
    for (let j = at + 1; j <= reading.length - next.text.length; j++) {
      if (kanaEq(reading.slice(j, j + next.text.length), next.text)) {
        found = j
        break
      }
    }
    if (found <= at) return [{ text: word, ruby: reading }]

    out.push({ text: part.text, ruby: reading.slice(at, found) })
    at = found
  }

  // Every character of the reading must have been consumed.
  if (at !== reading.length) return [{ text: word, ruby: reading }]
  return out
}

/**
 * True when the alignment actually told us something a single ruby wouldn't —
 * used by tests and by the importer report, not by rendering.
 */
export function isSplit(segments: RubySegment[]): boolean {
  return segments.filter((s) => s.ruby).length > 0 && segments.length > 1
}
