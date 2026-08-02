// japones_organizado.md -> src/data/seed.json
//
// Run with `npm run import`. Re-runnable: ids are content hashes, so
// re-importing after editing the Markdown preserves the user's SRS progress
// for every entry whose target string didn't change.
//
// Exits non-zero on duplicate ids or empty meanings so a malformed import
// can't quietly ship.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  makeId,
  normalizePattern,
  parseReading,
  splitExample,
  splitVariants,
  stripPlaceholder,
} from '../src/lib/text.ts'
import type { CategoryDef, Dataset, Entry, Example } from '../src/lib/types.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const SRC = resolve(ROOT, 'japones_organizado.md')
const OUT = resolve(ROOT, 'src/data/seed.json')

const CATEGORIES: Record<string, { id: string; label: string }> = {
  'GRAMÁTICA': { id: 'gramatica', label: 'Gramática' },
  'VERBOS': { id: 'verbos', label: 'Verbos' },
  'VOCABULARIO': { id: 'vocabulario', label: 'Vocabulario' },
  'EXPRESIONES': { id: 'expresiones', label: 'Expresiones' },
}

/**
 * Same word taught under two categories, where the two spellings don't match
 * literally. Exact-string duplicates are linked automatically; this covers the
 * one case in the source that isn't exact (気になる vs 気になります).
 */
const MANUAL_LINKS: string[][] = [['気になる', '気になります']]

/**
 * The trans/intrans table omits the reading for seven writings that every
 * other table supplies. These are the standard dictionary readings, filled in
 * here so those cards match the kanji・kana format instead of showing bare
 * kanji. Kept as an explicit table — the importer never guesses a reading.
 */
const SUPPLIED_READINGS: Record<string, string> = {
  変わる: 'かわる',
  変える: 'かえる',
  増える: 'ふえる',
  減る: 'へる',
  落ちる: 'おちる',
  回る: 'まわる',
  回す: 'まわす',
}

type TableKind = 'pattern' | 'word' | 'pair'

function headerKind(cells: string[]): TableKind | null {
  const first = cells[0]?.toLowerCase()
  if (first === 'patrón' || first === 'expresión') return 'pattern'
  if (first === 'kanji') return 'word'
  if (first === 'intransitivo') return 'pair'
  return null
}

const isTableRow = (line: string) => line.trim().startsWith('|')
const isSeparator = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim())

function cellsOf(line: string): string[] {
  const t = line.trim()
  return t
    .slice(1, t.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim())
}

function balanced(s: string): boolean {
  let depth = 0
  for (const ch of s) {
    if (ch === '(' || ch === '（') depth++
    else if (ch === ')' || ch === '）') depth--
    if (depth < 0) return false
  }
  return depth === 0
}

/**
 * Split a cell that describes both halves of a transitive/intransitive pair.
 * Requires a spaced separator and balanced parentheses on both sides, so
 * "cambiar (algo cambia/algo se cambia)" is correctly left as one value.
 */
function splitPair(s: string, sep: RegExp): [string, string] | null {
  const parts = s.split(sep).map((p) => p.trim()).filter(Boolean)
  if (parts.length !== 2) return null
  if (!balanced(parts[0]) || !balanced(parts[1])) return null
  return [parts[0], parts[1]]
}

// ---------------------------------------------------------------------------

const lines = readFileSync(SRC, 'utf8').split('\n')

const entries: Entry[] = []
const categories: CategoryDef[] = []
const catIndex = new Map<string, CategoryDef>()
const warnings: string[] = []
const supplements: string[] = []
const tidied: string[] = []

let category: { id: string; label: string } | null = null
let subcategory: string | null = null
let table: TableKind | null = null

function noteCategory(id: string, label: string, sub: string | null) {
  let def = catIndex.get(id)
  if (!def) {
    def = { id, label, subcategories: [] }
    catIndex.set(id, def)
    categories.push(def)
  }
  if (sub && !def.subcategories.includes(sub)) def.subcategories.push(sub)
}

function push(entry: Entry) {
  entries.push(entry)
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  const h2 = line.match(/^##\s+(?:\d+\.\s*)?(.+)$/)
  if (h2 && !line.startsWith('###')) {
    const name = h2[1].split('(')[0].split('/')[0].trim()
    category = CATEGORIES[name] ?? null
    subcategory = null
    table = null
    continue
  }

  const h3 = line.match(/^###\s+(.+)$/)
  if (h3) {
    subcategory = h3[1].replace(/^Nivel\s+/i, '').trim()
    table = null
    continue
  }

  if (!isTableRow(line)) {
    table = null
    continue
  }
  if (!category) continue
  if (isSeparator(line)) continue

  const cells = cellsOf(line)

  if (table === null) {
    table = headerKind(cells)
    if (table === null) warnings.push(`Unrecognised table header at line ${i + 1}: ${line.trim()}`)
    continue
  }

  noteCategory(category.id, category.label, subcategory)
  // A factory, not a shared object: spreading one literal would give every
  // entry from this row the *same* relatedIds array.
  const base = () => ({
    category: category!.id,
    subcategory,
    source: 'seed' as const,
    relatedIds: [] as string[],
  })

  if (table === 'pattern') {
    const [rawPattern, meaning, example] = cells
    if (!rawPattern || !meaning) {
      warnings.push(`Skipped incomplete row at line ${i + 1}`)
      continue
    }
    // Verbo (ます形) ＋ はじめる → Vます＋はじめる
    const pattern = normalizePattern(rawPattern)
    if (pattern !== rawPattern) tidied.push(`${rawPattern} → ${pattern}`)
    push({
      ...base(),
      kind: 'pattern',
      id: makeId(category.id, pattern),
      pattern,
      meaning,
      example: splitExample(example),
      ...(category.id === 'gramatica' && subcategory ? { level: subcategory } : {}),
    })
    continue
  }

  if (table === 'word') {
    const [kanjiCell, kanaCell, meaning, example] = cells
    const kanji = stripPlaceholder(kanjiCell)
    const kana = stripPlaceholder(kanaCell) ?? ''
    if (!kana || !meaning) {
      warnings.push(`Skipped incomplete row at line ${i + 1}`)
      continue
    }
    push({
      ...base(),
      kind: 'word',
      id: makeId(category.id, kanji ?? kana),
      kanji,
      kana,
      variants: kanji ? splitVariants(kanji) : [],
      meaning,
      example: splitExample(example),
    })
    continue
  }

  // Transitive / intransitive pairs: one source row, up to two linked cards.
  const [intranCell, tranCell, meaningCell, exampleCell] = cells
  const intranRaw = stripPlaceholder(intranCell)
  const tranRaw = stripPlaceholder(tranCell)
  if (!intranRaw || !meaningCell) {
    warnings.push(`Skipped incomplete pair row at line ${i + 1}`)
    continue
  }

  const meanings = splitPair(meaningCell, /\s+\/\s+/)
  const example = splitExample(exampleCell)
  const exTargets = example ? splitVariants(example.target) : []
  const exNatives = example ? example.native.split(/\s+\/\s+/).map((s) => s.trim()) : []

  const halves: Array<{ raw: string; role: 'intransitive' | 'transitive'; slot: 0 | 1 }> = [
    { raw: intranRaw, role: 'intransitive', slot: 0 },
  ]
  if (tranRaw) halves.push({ raw: tranRaw, role: 'transitive', slot: 1 })

  const madeIds: string[] = []
  for (const half of halves) {
    let reading = parseReading(half.raw)
    if (!reading) {
      const supplied = SUPPLIED_READINGS[half.raw]
      if (supplied) {
        reading = { kanji: half.raw, kana: supplied }
        supplements.push(`${half.raw} → ${supplied}`)
      } else {
        // Not in the source and not in the table above. Keep the writing and
        // leave the reading empty rather than inventing one.
        warnings.push(`No reading for ${half.raw} (line ${i + 1})`)
      }
    }
    const kanji = reading ? reading.kanji : half.raw
    const kana = reading ? reading.kana : ''

    // Only split the shared cells when both halves exist and the source
    // actually supplied two values; otherwise both cards share the whole thing.
    const useSplit = halves.length === 2
    const meaning = useSplit && meanings ? meanings[half.slot] : meaningCell
    let ex: Example | null = example
    if (useSplit && example && exTargets.length === 2) {
      ex = {
        target: exTargets[half.slot],
        native: exNatives.length === 2 ? exNatives[half.slot] : example.native,
      }
    }

    const id = makeId(category.id, kanji ?? kana, half.role)
    madeIds.push(id)
    push({
      ...base(),
      kind: 'word',
      id,
      kanji: kanji && kanji !== kana ? kanji : null,
      kana: kana || (kanji ?? ''),
      variants: [],
      role: half.role,
      meaning,
      example: ex,
      note: half.role === 'intransitive' ? 'intransitivo' : 'transitivo',
    })
  }
  if (madeIds.length === 2) {
    const [a, b] = madeIds
    entries.find((e) => e.id === a)!.relatedIds.push(b)
    entries.find((e) => e.id === b)!.relatedIds.push(a)
  }
}

// ---------------------------------------------------------------------------
// Cross-category links: the same word taught both as a verb/noun and as an
// expression. Both are kept — they're taught as different things — but linked
// so the session queue can avoid asking for both in one sitting.
// ---------------------------------------------------------------------------

const byTarget = new Map<string, Entry[]>()
for (const e of entries) {
  const key = e.kind === 'pattern' ? e.pattern : (e.kanji ?? e.kana)
  if (!byTarget.has(key)) byTarget.set(key, [])
  byTarget.get(key)!.push(e)
}

const linkedPairs = new Set<string>()

function link(a: Entry, b: Entry) {
  if (a.id === b.id) return
  if (!a.relatedIds.includes(b.id)) a.relatedIds.push(b.id)
  if (!b.relatedIds.includes(a.id)) b.relatedIds.push(a.id)
  linkedPairs.add([a.id, b.id].sort().join('~'))
}

for (const group of byTarget.values()) {
  if (group.length < 2) continue
  for (const a of group) for (const b of group) link(a, b)
}
for (const [x, y] of MANUAL_LINKS) {
  for (const a of byTarget.get(x) ?? []) {
    for (const b of byTarget.get(y) ?? []) link(a, b)
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const errors: string[] = []

const seen = new Map<string, Entry>()
for (const e of entries) {
  const prev = seen.get(e.id)
  if (prev) {
    const show = (x: Entry) => (x.kind === 'pattern' ? x.pattern : (x.kanji ?? x.kana))
    errors.push(`Duplicate id ${e.id}: "${show(prev)}" and "${show(e)}"`)
  }
  seen.set(e.id, e)
  if (!e.meaning.trim()) errors.push(`Empty meaning for ${e.id}`)
}

const noExample = entries.filter((e) => !e.example).length
const noReading = entries.filter((e) => e.kind === 'word' && !e.kana).length

const dataset: Dataset = {
  id: 'japones-sensei-ai',
  name: 'Japonés con 先生Ai',
  nativeLang: 'es',
  targetLang: 'ja',
  categories,
  entries,
}

// ---------------------------------------------------------------------------

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))

console.log(`\nParsed ${entries.length} entries from ${SRC.replace(ROOT + '/', '')}\n`)
for (const cat of categories) {
  const inCat = entries.filter((e) => e.category === cat.id)
  console.log(`  ${pad(cat.label, 14)} ${String(inCat.length).padStart(3)}`)
  for (const sub of cat.subcategories) {
    const n = inCat.filter((e) => e.subcategory === sub).length
    console.log(`      ${pad(sub, 32)} ${String(n).padStart(3)}`)
  }
}

console.log(`\n  cross-category links: ${linkedPairs.size}`)
console.log(`  without example: ${noExample}`)
console.log(`  without reading: ${noReading}`)

if (tidied.length) {
  console.log(`\n  ${tidied.length} pattern(s) reformatted:`)
  for (const t of tidied) console.log(`    - ${t}`)
}

if (supplements.length) {
  console.log(`\n  ${supplements.length} reading(s) supplied from SUPPLIED_READINGS (not in source):`)
  for (const s of supplements) console.log(`    - ${s}`)
}

if (warnings.length) {
  console.log(`\n  ${warnings.length} warning(s):`)
  for (const w of warnings) console.log(`    - ${w}`)
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} error(s):`)
  for (const e of errors) console.error(`    - ${e}`)
  process.exit(1)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(dataset, null, 2) + '\n')
console.log(`\n✓ wrote ${OUT.replace(ROOT + '/', '')}\n`)
