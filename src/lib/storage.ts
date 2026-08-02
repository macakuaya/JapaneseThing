// localStorage persistence and the JSON export/import bridge.
//
// Progress is per-device — localStorage does not sync between the laptop and
// the phone. Export/import is the manual bridge; see the README.

import type { CardState, Entry, ReviewLogEntry, Settings } from './types.ts'
import { DEFAULT_SETTINGS } from './types.ts'

const PREFIX = 'jt.v1.'
const K = {
  srs: PREFIX + 'srs',
  entries: PREFIX + 'entries',
  settings: PREFIX + 'settings',
  log: PREFIX + 'log',
  session: PREFIX + 'session',
} as const

/** Keep the log bounded; it exists for stats, not for audit. */
const MAX_LOG = 20_000

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    console.warn(`[storage] could not read ${key}; using defaults`)
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    // Quota exceeded, or Safari private mode. Losing a write silently would be
    // worse than a console warning the user can report.
    console.error(`[storage] failed to write ${key}`, err)
  }
}

export const loadSrs = (): Record<string, CardState> => read(K.srs, {})
export const saveSrs = (v: Record<string, CardState>): void => write(K.srs, v)

export const loadUserEntries = (): Entry[] => read<Entry[]>(K.entries, [])
export const saveUserEntries = (v: Entry[]): void => write(K.entries, v)

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read(K.settings, {}) })
export const saveSettings = (v: Settings): void => write(K.settings, v)

export const loadLog = (): ReviewLogEntry[] => read<ReviewLogEntry[]>(K.log, [])
export const saveLog = (v: ReviewLogEntry[]): void =>
  write(K.log, v.length > MAX_LOG ? v.slice(-MAX_LOG) : v)

// ---------------------------------------------------------------------------
// The session in progress
// ---------------------------------------------------------------------------

/**
 * Leaving a review must not restart it. Only the queue *order* and the
 * counters are stored — the cards themselves are rehydrated from the dataset
 * and the current scheduling state, so a resumed session always reflects
 * answers given since.
 */
export interface PersistedSession {
  mode: 'review' | 'practice'
  /**
   * Fingerprint of the config that produced this queue. Resuming requires an
   * exact match, so changing the Practice filters and pressing Start gives a
   * fresh deck instead of silently resuming the previous one.
   */
  fingerprint: string
  /** Card keys, in the order they are still to be shown. */
  queue: string[]
  answered: number
  correct: number
  startedWith: number
  /** Study-day this session belongs to; a stale one is discarded. */
  day: number
}

export const loadSession = (): PersistedSession | null =>
  read<PersistedSession | null>(K.session, null)

export const saveSession = (v: PersistedSession): void => write(K.session, v)

export const clearSession = (): void => {
  try {
    localStorage.removeItem(K.session)
  } catch {
    /* nothing useful to do if storage is unavailable */
  }
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export interface Backup {
  format: 'japanese-srs'
  version: 1
  exportedAt: string
  srs: Record<string, CardState>
  entries: Entry[]
  settings: Settings
  log: ReviewLogEntry[]
}

export function exportBackup(): Backup {
  return {
    format: 'japanese-srs',
    version: 1,
    exportedAt: new Date().toISOString(),
    srs: loadSrs(),
    entries: loadUserEntries(),
    settings: loadSettings(),
    log: loadLog(),
  }
}

export function backupFilename(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `japanese-srs-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`
}

/**
 * Validates before writing anything. A partial import that half-overwrote a
 * year of scheduling would be much worse than a rejected file.
 */
export function parseBackup(json: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const b = data as Partial<Backup>
  if (!b || typeof b !== 'object') throw new Error('That file is not a backup.')
  if (b.format !== 'japanese-srs') throw new Error('That JSON is not a Japanese SRS backup.')
  if (b.version !== 1) throw new Error(`Unsupported backup version: ${String(b.version)}`)
  if (!b.srs || typeof b.srs !== 'object') throw new Error('Backup is missing its scheduling data.')
  if (!Array.isArray(b.entries)) throw new Error('Backup is missing its entries list.')
  return {
    format: 'japanese-srs',
    version: 1,
    exportedAt: b.exportedAt ?? '',
    srs: b.srs,
    entries: b.entries,
    settings: { ...DEFAULT_SETTINGS, ...(b.settings ?? {}) },
    log: Array.isArray(b.log) ? b.log : [],
  }
}

export function applyBackup(b: Backup): void {
  saveSrs(b.srs)
  saveUserEntries(b.entries)
  saveSettings(b.settings)
  saveLog(b.log)
}

export function clearAll(): void {
  for (const key of Object.values(K)) localStorage.removeItem(key)
}
