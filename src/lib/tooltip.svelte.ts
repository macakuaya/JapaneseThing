// A single shared tooltip. One instance lives at the top of the app and every
// Japanese word asks it to open — cheaper than mounting a popover per token,
// and it guarantees only one can ever be visible.
//
// Opening and closing is deliberately timer-based. An earlier version showed
// on the word's mouseenter and hid on a full-viewport scrim's mouseenter,
// which flickered forever: opening put the scrim under the cursor, the scrim
// closed the tooltip, the word was hovered again, and round it went. Hover
// intent with a shared grace period fixes that and also lets the pointer
// travel from the word into the panel without it vanishing on the way.

import { type KanjiInfo, type WordHit, kanjiInfo, lookupWord } from './dict.ts'

export interface KanjiEntry {
  char: string
  info: KanjiInfo
}

/** Long enough not to fire while sweeping the cursor across a sentence. */
const SHOW_DELAY = 130
/** Long enough to move the pointer from the word onto the panel. */
const HIDE_DELAY = 180

class TooltipState {
  open = $state(false)
  /** Viewport rect of the word that opened it. */
  anchor = $state({ x: 0, top: 0, bottom: 0 })
  surface = $state('')
  hit = $state<WordHit | null>(null)
  /**
   * Other readings this surface could be. Shown when they score as highly as
   * the winner: 扇風機をつけます is 点ける ("encender"), but つける ("ponerse
   * accesorios") is also in the deck and ties exactly. Nothing available can
   * break that, so both are offered rather than one being picked silently.
   */
  alternatives = $state<WordHit[]>([])
  kanji = $state<KanjiEntry[]>([])
  /** Category to file the word under if the user adds it to the deck. */
  categoryHint = $state<string | null>(null)
  /** Set after the user adds it, so the button can confirm. */
  added = $state(false)
  /** The element currently described, so the caller can style it as active. */
  target = $state<Element | null>(null)

  #showTimer: ReturnType<typeof setTimeout> | null = null
  #hideTimer: ReturnType<typeof setTimeout> | null = null

  #clearTimers() {
    if (this.#showTimer) clearTimeout(this.#showTimer)
    if (this.#hideTimer) clearTimeout(this.#hideTimer)
    this.#showTimer = null
    this.#hideTimer = null
  }

  /** Open after a short delay, unless this word is already the one shown. */
  requestShow(target: Element, surface: string, categoryHint: string | null): void {
    if (this.open && this.target === target) {
      // Already describing this word — just cancel any pending close.
      this.#clearTimers()
      return
    }
    this.#clearTimers()
    this.#showTimer = setTimeout(() => this.showNow(target, surface, categoryHint), SHOW_DELAY)
  }

  /** Open immediately. Used for taps and clicks, which need no hover intent. */
  showNow(target: Element, surface: string, categoryHint: string | null): void {
    this.#clearTimers()
    this.categoryHint = categoryHint

    const rect = target.getBoundingClientRect()
    this.anchor = { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom }
    const hits = lookupWord(surface)
    this.surface = surface
    this.hit = hits[0] ?? null
    // Only genuinely competitive alternatives, and only when they say
    // something different — listing five senses of the same word is noise.
    const winner = hits[0]
    this.alternatives = winner
      ? hits
          .slice(1, 4)
          .filter((h) => h.score >= winner.score - 10)
          .filter((h) => h.word.s[0].g[0] !== winner.word.s[0].g[0])
      : []

    const chars: KanjiEntry[] = []
    const seen = new Set<string>()
    for (const ch of surface) {
      if (!/[㐀-鿿]/.test(ch) || seen.has(ch)) continue
      const info = kanjiInfo(ch)
      if (info) {
        chars.push({ char: ch, info })
        seen.add(ch)
      }
    }
    this.kanji = chars
    this.added = false
    this.target = target
    this.open = this.hit !== null || chars.length > 0
  }

  /** Close after a grace period, so the pointer can reach the panel. */
  requestHide(): void {
    this.#clearTimers()
    this.#hideTimer = setTimeout(() => this.hide(), HIDE_DELAY)
  }

  /** The pointer entered the panel — keep it open. */
  keepOpen(): void {
    this.#clearTimers()
  }

  hide(): void {
    this.#clearTimers()
    this.open = false
    this.target = null
  }

  /** Tap behaviour: a second tap on the same word closes it again. */
  toggle(target: Element, surface: string, categoryHint: string | null): void {
    if (this.open && this.target === target) this.hide()
    else this.showNow(target, surface, categoryHint)
  }
}

export const tooltip = new TooltipState()
