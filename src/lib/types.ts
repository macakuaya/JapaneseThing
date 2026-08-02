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
  /** Grammar only: 'N5' | 'N4' | ... */
  level?: string
}

export type Entry = WordEntry | PatternEntry

export interface Dataset {
  id: string
  name: string
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
