// Core data model.
//
// Nothing here names Spanish or Japanese. A dataset declares its own language
// pair and its own categories, so a deck for any language pair drops in
// unchanged. The bundled seed happens to be es/ja.

export type Direction = 'recognition' | 'production'

/** recognition = target -> native (see 進歩・しんぽ, recall "progreso") */
/** production  = native -> target (see "progreso", recall 進歩) */

export interface CategoryDef {
  id: string
  label: string
  /**
   * The category's name in the dataset's target language, shown alongside the
   * native one. Optional: a dataset that hasn't got them still works, the
   * cards just carry one name.
   */
  targetLabel?: string
  /** Reading for `targetLabel`, shown after it as `文法・ぶんぽう`. */
  targetReading?: string
  /** Ordered. Empty when the category has no subdivisions. */
  subcategories: string[]
}

export interface Example {
  target: string
  native: string
}

interface EntryBase {
  /** Stable content hash — see makeId(). SRS progress is keyed off this. */
  id: string
  category: string
  subcategory: string | null
  /** In the dataset's nativeLang. */
  meaning: string
  example: Example | null
  source: 'seed' | 'user'
  /** Pair partners and cross-category duplicates of the same word. */
  relatedIds: string[]
  /** Free-form, used for the trans/intrans note and anything the user adds. */
  note?: string
}

export interface WordEntry extends EntryBase {
  kind: 'word'
  /** null when the word is normally written in kana only. */
  kanji: string | null
  kana: string
  /** Alternate writings that shared one source cell, e.g. 飛ぶ／飛ばす. */
  variants: string[]
  role?: 'intransitive' | 'transitive'
}

export interface PatternEntry extends EntryBase {
  kind: 'pattern'
  pattern: string
  /**
   * Kana for a pattern that contains kanji, shown after it exactly as a word's
   * reading is: 落ち着く・おちつく. A pattern written entirely in kana has
   * nothing to add and leaves this unset.
   */
  reading?: string
  /** Grammar only: 'N5' | 'N4' | ... */
  level?: string
}

/** One word built from a kanji, shown as 会社・かいしゃ・empresa. */
export interface KanjiVocab {
  word: string
  reading: string
  meaning: string
}

/**
 * A single character, taught as a character.
 *
 * Not a WordEntry with extra fields: a kanji is asked in the other direction —
 * you are shown the shape and have to produce its readings and sense — and it
 * carries several readings rather than one, which a word's single `kana` has
 * nowhere to put.
 */
export interface KanjiEntry extends EntryBase {
  kind: 'kanji'
  character: string
  /** on'yomi, katakana, as KANJIDIC writes them. */
  on: string[]
  /** kun'yomi, hiragana; a `.` marks where okurigana begins. */
  kun: string[]
  strokes?: number
  vocabulary: KanjiVocab[]
}

export type Entry = WordEntry | PatternEntry | KanjiEntry

/** A name in both of the dataset's languages, laid out like a card front. */
export interface BilingualName {
  target: string
  reading?: string
  native: string
}

export interface Dataset {
  id: string
  name: string
  /**
   * What the whole dataset teaches, named the way its categories are. Shown on
   * the card that studies everything due today, which otherwise has no name of
   * its own to use.
   */
  subject?: BilingualName
  /** BCP-47-ish tags, used for `lang` attributes and font selection. */
  nativeLang: string
  targetLang: string
  categories: CategoryDef[]
  entries: Entry[]
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export type Stage = 'new' | 'learning' | 'review' | 'relearning'

/** How well established a card is. Drives Practice filters and Browse badges. */
export type Maturity = 'new' | 'learning' | 'young' | 'mature' | 'leech'

export interface CardState {
  /** `${entryId}:${direction}` */
  key: string
  stage: Stage
  /** Epoch ms. */
  due: number
  /** Days. 0 while in learning/relearning. */
  interval: number
  ease: number
  reps: number
  lapses: number
  /** Index into the learning-steps array. */
  step: number
  lastReviewed: number | null
}

export interface ReviewLogEntry {
  key: string
  grade: Grade
  at: number
  /** Interval in days before this answer, for future FSRS migration. */
  prevInterval: number
}

/**
 * 'revealed' shows furigana only on the answer side, so the question still
 * lets you test yourself on the reading.
 */
export type FuriganaMode = 'off' | 'always' | 'revealed'

export interface Settings {
  newPerDay: number
  reviewsPerDay: number
  /** Local hour a new "day" starts, Anki-style. */
  dayStartHour: number
  /** Category ids with production (native -> target) cards enabled. */
  productionCategories: string[]
  /** Lapses before a card is flagged as a leech. */
  leechThreshold: number
  furigana: FuriganaMode
  /** Tap or hover a word to look it up. Needs the dictionary files. */
  lookup: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  reviewsPerDay: 100,
  dayStartHour: 4,
  productionCategories: [],
  leechThreshold: 5,
  furigana: 'revealed',
  lookup: true,
}
