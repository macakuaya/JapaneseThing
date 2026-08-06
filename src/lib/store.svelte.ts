// Application state. One store instance, runes for reactivity, every mutation
// persisted immediately — a review session that lost its last answers to a
// closed tab would be worse than useless.

import seedJson from '../data/seed.json'
import type {
  CardState,
  Dataset,
  Entry,
  Grade,
  ReviewLogEntry,
  Settings,
} from './types.ts'
import { applyGrade, newCardState } from './srs.ts'
import { installDeck, loadDict } from './dict.ts'
import { type Card, countsFor, enumerateCards } from './session.ts'
import * as storage from './storage.ts'

const seed = seedJson as unknown as Dataset

export type View = 'home' | 'review' | 'practice' | 'deck' | 'add' | 'settings'

/** What the Deck view asks Practice to study. */
export interface PracticeRequest {
  categories: string[]
  subcategories: string[]
  limit: number
  writeThrough: boolean
}

class Store {
  view = $state<View>('home')
  srs = $state<Record<string, CardState>>({})
  settings = $state<Settings>(storage.loadSettings())
  userEntries = $state<Entry[]>([])
  log = $state<ReviewLogEntry[]>([])

  /** Bumped on the minute so due counts don't go stale on an idle Home screen. */
  now = $state(Date.now())

  /**
   * Dictionary state. The files are ~1 MB, so they load in the background
   * after the app is interactive rather than blocking first paint. Everything
   * degrades gracefully while this is 'idle' or 'loading': headword furigana
   * still works (it comes from the entry's own kana), only sentence furigana
   * and lookup wait.
   */
  dict = $state<'idle' | 'loading' | 'ready' | 'error'>('idle')
  dictError = $state<string | null>(null)

  /**
   * The set the Deck view is currently showing, handed over when Drill is
   * pressed. Practice has no picker of its own — what you were looking at is
   * what you study.
   */
  practiceRequest = $state<PracticeRequest | null>(null)

  /**
   * Where leaving a drill goes back to. A drill started from a Home card
   * should return to Home, not dump you in the Deck list you never opened.
   * Kept separate from the request because the request is consumed on arrival.
   */
  practiceReturnTo = $state<View>('deck')

  /**
   * Whether a session is running. The header reads it to stand down to just
   * 語: navigating elsewhere mid-card is not the thing to make easy, and the
   * session's own counter lives on the bottom edge with Home's.
   */
  sessionActive = $state(false)

  /**
   * Which Home card is currently growing into the study view. Only the one
   * being opened may claim the shared view-transition-name — if several
   * elements hold it at once the browser matches none of them.
   */
  morphing = $state<string | null>(null)

  /**
   * Which Home card the running study view grew out of, so leaving can shrink
   * back into it. Unlike `morphing` this survives the whole session — it is
   * remembered on the way in and read on the way out.
   */
  studySource = $state<string | null>(null)

  /**
   * The Deck view's filter, held here rather than in the component so it
   * survives navigating away. Drilling a subcategory and coming back to "All
   * decks" loses your place in a 202-card list.
   */
  deckFilter = $state({
    query: '',
    category: '',
    subcategory: '',
    limit: 20,
    countToward: false,
  })

  startPractice(request: PracticeRequest, returnTo: View = 'deck'): void {
    this.practiceRequest = request
    this.practiceReturnTo = returnTo
    this.view = 'practice'
  }

  async ensureDict(): Promise<void> {
    if (this.dict === 'ready' || this.dict === 'loading') return
    this.dict = 'loading'
    this.dictError = null
    try {
      await loadDict()
      this.dict = 'ready'
    } catch (err) {
      this.dict = 'error'
      this.dictError = err instanceof Error ? err.message : String(err)
    }
  }

  constructor() {
    this.srs = storage.loadSrs()
    this.userEntries = storage.loadUserEntries()
    this.log = storage.loadLog()
    this.syncDeck()
  }

  /**
   * Seed entries, with user edits substituted in place, then genuinely new
   * entries appended.
   *
   * An edit to a bundled entry is stored as a user entry with the *same id*,
   * so concatenating the two lists put that id in the dataset twice. That
   * broke Browse outright (a keyed `{#each}` throws on a duplicate key), made
   * `entryById` return the stale seed copy because `.find` hits it first — so
   * edits silently did nothing — and produced two cards for one word.
   * Substituting rather than appending fixes all three, and keeps edited
   * entries in their original position.
   */
  readonly dataset: Dataset = $derived.by(() => {
    const overrides = new Map(this.userEntries.map((e) => [e.id, e]))
    const merged = seed.entries.map((e) => overrides.get(e.id) ?? e)
    const seedIds = new Set(seed.entries.map((e) => e.id))
    const added = this.userEntries.filter((e) => !seedIds.has(e.id))
    return { ...seed, entries: [...merged, ...added] }
  })

  /**
   * Register the deck with the lookup, so the user's own glosses outrank
   * JMdict for any word they already have. That is what keeps a tooltip
   * consistent with the card it appears on — and it is what resolves 行った
   * to 行く ("ir") rather than 行う ("ejecutar"), which nothing in the
   * dictionary alone can decide.
   *
   * Called explicitly rather than from a $derived: a derived is lazy, and an
   * index that only rebuilds if something happens to read it is a bug waiting
   * to happen.
   */
  syncDeck(): void {
    installDeck(this.dataset.entries)
  }

  readonly cards: Card[] = $derived(
    enumerateCards(this.dataset, this.srs, this.settings, this.now),
  )

  readonly counts = $derived(countsFor(this.cards, this.settings, this.now, this.log))

  /** Subcategories actually present, per category id. */
  readonly subcategoriesOf = $derived.by(() => {
    const map = new Map<string, string[]>()
    for (const entry of this.dataset.entries) {
      if (!entry.subcategory) continue
      const list = map.get(entry.category) ?? []
      if (!list.includes(entry.subcategory)) list.push(entry.subcategory)
      map.set(entry.category, list)
    }
    return map
  })

  entryById(id: string): Entry | undefined {
    return this.dataset.entries.find((e) => e.id === id)
  }

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  /**
   * Record an answer. Returns the updated card state so the caller can decide
   * whether to requeue it. When `writeThrough` is false (Practice) nothing is
   * persisted and the state is returned unchanged.
   */
  grade(card: Card, grade: Grade, writeThrough: boolean, now = Date.now()): CardState {
    if (!writeThrough) return card.state
    const next = applyGrade(card.state, grade, now)
    this.srs = { ...this.srs, [card.key]: next }
    this.log = [
      ...this.log,
      { key: card.key, grade, at: now, prevInterval: card.state.interval },
    ]
    storage.saveSrs(this.srs)
    storage.saveLog(this.log)
    return next
  }

  /** Restore a card's prior state and drop its last log line. Used by undo. */
  ungrade(key: string, previous: CardState | null): void {
    const next = { ...this.srs }
    if (previous) next[key] = previous
    else delete next[key]
    this.srs = next

    const lastIndex = this.log.findLastIndex((l) => l.key === key)
    if (lastIndex >= 0) this.log = this.log.toSpliced(lastIndex, 1)

    storage.saveSrs(this.srs)
    storage.saveLog(this.log)
  }

  resetScheduling(): void {
    this.srs = {}
    this.log = []
    storage.saveSrs(this.srs)
    storage.saveLog(this.log)
  }

  // -------------------------------------------------------------------------
  // Entries
  // -------------------------------------------------------------------------

  addEntries(entries: Entry[]): number {
    const known = new Set(this.dataset.entries.map((e) => e.id))
    const fresh = entries.filter((e) => !known.has(e.id))
    if (!fresh.length) return 0
    this.userEntries = [...this.userEntries, ...fresh]
    storage.saveUserEntries(this.userEntries)
    this.syncDeck()
    return fresh.length
  }

  /**
   * Seed entries live in the bundle and can't be edited in place, so an edit
   * to one is stored as a user entry with the same id that shadows it.
   */
  updateEntry(id: string, patch: Partial<Entry>): void {
    const existing = this.entryById(id)
    if (!existing) return
    const merged = { ...existing, ...patch, id } as Entry
    const idx = this.userEntries.findIndex((e) => e.id === id)
    this.userEntries =
      idx >= 0
        ? this.userEntries.toSpliced(idx, 1, merged)
        : [...this.userEntries, merged]
    storage.saveUserEntries(this.userEntries)
    this.syncDeck()
  }

  deleteEntry(id: string): void {
    this.userEntries = this.userEntries.filter((e) => e.id !== id)
    storage.saveUserEntries(this.userEntries)
    this.syncDeck()
    const next = { ...this.srs }
    delete next[`${id}:recognition`]
    delete next[`${id}:production`]
    this.srs = next
    storage.saveSrs(this.srs)
  }

  /** True when a seed entry has been shadowed by a user edit. */
  isOverridden(id: string): boolean {
    return this.userEntries.some((e) => e.id === id)
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch }
    storage.saveSettings(this.settings)
  }

  toggleProduction(categoryId: string): void {
    const on = this.settings.productionCategories.includes(categoryId)
    this.updateSettings({
      productionCategories: on
        ? this.settings.productionCategories.filter((c) => c !== categoryId)
        : [...this.settings.productionCategories, categoryId],
    })
  }

  reloadFromStorage(): void {
    this.srs = storage.loadSrs()
    this.userEntries = storage.loadUserEntries()
    this.settings = storage.loadSettings()
    this.log = storage.loadLog()
    this.syncDeck()
  }
}

export const store = new Store()

/** Materialise a card for an entry that has never been reviewed. */
export const stateFor = (key: string, now = Date.now()): CardState =>
  store.srs[key] ?? newCardState(key, now)
