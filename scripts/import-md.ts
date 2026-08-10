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

import { installDeck, installDict, readingFor } from '../src/lib/dict.ts'
import {
  hasKanji,
  makeId,
  splitSlashLines,
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

// The Japanese names are ours, not the teacher's — the source has Spanish
// headings only. They live here rather than in the app because which language
// a deck is named in is a property of the dataset, not of the UI.
type CategoryNames = { id: string; label: string; targetLabel: string; targetReading: string }

const CATEGORIES: Record<string, CategoryNames> = {
  'GRAMÁTICA': { id: 'gramatica', label: 'Gramática', targetLabel: '文法', targetReading: 'ぶんぽう' },
  'VERBOS': { id: 'verbos', label: 'Verbos', targetLabel: '動詞', targetReading: 'どうし' },
  'VOCABULARIO': { id: 'vocabulario', label: 'Vocabulario', targetLabel: '語彙', targetReading: 'ごい' },
  'EXPRESIONES': { id: 'expresiones', label: 'Expresiones', targetLabel: '表現', targetReading: 'ひょうげん' },
  // Declared but not yet taught. It has no rows in the source, and the deck it
  // produces is empty on purpose — see the pre-registration below.
  'KANJI': { id: 'kanji', label: 'Kanji', targetLabel: '漢字', targetReading: 'かんじ' },
}

/**
 * Same word taught under two categories, where the two spellings don't match
 * literally. Exact-string duplicates are linked automatically; this covers the
 * one case in the source that isn't exact (気になる vs 気になります).
 */
const MANUAL_LINKS: string[][] = [['気になる', '気になります']]

/**
 * Overrides for the trans/intrans table, whose rows omit the reading.
 *
 * It held seven readings written out by hand; the dictionary now supplies all
 * seven, and the import says so if a row here becomes redundant. What remains
 * is the extension point for a reading the dictionary gets wrong.
 */
const SUPPLIED_READINGS: Record<string, string> = {
  // Empty, and that is the point: all seven readings that used to live here
  // are ones the dictionary now supplies. The table stays as the place to put
  // a reading the dictionary gets wrong.
}

/*
 * Overrides for readings the bundled dictionary gets wrong or declines.
 *
 * These used to be the only source, hand-written one by one. The dictionary is
 * now asked first — it is the same JMdict the app uses for furigana, so a
 * reading it produces here is one the app already trusts elsewhere — and this
 * table exists for the residue.
 *
 * Rules enforced below: an override that the dictionary *agrees* with is
 * reported as redundant, so the table can't silently accumulate rows that no
 * longer earn their place; and a kanji-bearing pattern with neither a
 * dictionary reading nor an override fails the import.
 */
const PATTERN_READINGS: Record<string, string> = {
  // 様態 is a grammar term, not vocabulary; the dictionary declines it.
  '〜そうです（様態）': '〜そうです（ようたい）',
}

/*
 * The same dictionary the app uses for furigana, loaded straight off disk
 * instead of over the network. Asking it here means a reading printed on a
 * card front is one the app would have produced anyway — the two can't drift.
 */
const dictWords = JSON.parse(readFileSync(resolve(ROOT, 'public/dict/words.json'), 'utf8'))
const dictKanji = JSON.parse(readFileSync(resolve(ROOT, 'public/dict/kanji.json'), 'utf8'))
installDict(dictWords.words, dictKanji.kanji)

const fromDict: string[] = []
const redundantOverrides: string[] = []

/**
 * A reading for a phrase: the dictionary's, unless an override says otherwise.
 *
 * An override that merely repeats what the dictionary already says is reported
 * so it can be deleted — otherwise the tables keep every row they ever had and
 * stop meaning "these are the hard ones".
 */
function resolveReading(
  text: string,
  overrides: Record<string, string>,
  where: string,
): string | null {
  const override = overrides[text]
  const derived = readingFor(text)

  if (override && derived) {
    if (override === derived) redundantOverrides.push(`${text} → ${override}`)
    else errors.push(`Reading disagreement for ${text} (${where}): table ${override}, dictionary ${derived}`)
    return override
  }
  if (override) return override
  if (derived) {
    fromDict.push(`${text} → ${derived}`)
    return derived
  }
  return null
}

type TableKind = 'pattern' | 'word' | 'pair' | 'kanji'

function headerKind(cells: string[]): TableKind | null {
  const first = cells[0]?.toLowerCase()
  if (first === 'patrón' || first === 'expresión') return 'pattern'
  if (first === 'kanji') return 'word'
  if (first === 'intransitivo') return 'pair'
  // Deliberately not 漢字: that is the *word* tables' first column, and the two
  // would be indistinguishable from their headers alone.
  if (first === 'carácter' || first === 'caracter') return 'kanji'
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

let category: CategoryNames | null = null
let subcategory: string | null = null
let table: TableKind | null = null

function noteCategory(names: CategoryNames, sub: string | null) {
  const { id, label, targetLabel, targetReading } = names
  let def = catIndex.get(id)
  if (!def) {
    def = { id, label, targetLabel, targetReading, subcategories: [] }
    catIndex.set(id, def)
    categories.push(def)
  }
  if (sub && !def.subcategories.includes(sub)) def.subcategories.push(sub)
}

function push(entry: Entry) {
  entries.push(entry)
}

/*
 * Every declared category exists, in declaration order, whether or not the
 * source has rows for it.
 *
 * Registering them only as entries are met meant a category with nothing in it
 * yet simply didn't exist, and the order depended on which heading the parser
 * happened to reach first. Declaring them up front makes both properties come
 * from the table above, where they are readable.
 */
for (const names of Object.values(CATEGORIES)) noteCategory(names, null)

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

  noteCategory(category, subcategory)
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

  if (table === 'kanji') {
    const [charCell, onCell, kunCell, meaning, vocabCell, example, strokeCell] = cells
    const character = (stripPlaceholder(charCell) ?? '').trim()
    if (!character || !meaning) {
      warnings.push(`Skipped incomplete kanji row at line ${i + 1}`)
      continue
    }
    if ([...character].length !== 1) {
      errors.push(`Kanji row is not a single character: ${character} (line ${i + 1})`)
      continue
    }

    const readings = (cell: string | undefined) =>
      (stripPlaceholder(cell) ?? '')
        .split(/[・､、]/)
        .map((r) => r.trim())
        .filter(Boolean)

    // palabra・lectura・significado, several separated by ／
    const vocabulary = splitSlashLines(stripPlaceholder(vocabCell) ?? '')
      .map((chunk) => chunk.split('・').map((f) => f.trim()))
      .filter((f) => f.length >= 3 && f[0])
      .map(([word, reading, ...rest]) => ({ word, reading, meaning: rest.join('・') }))

    const strokes = Number(stripPlaceholder(strokeCell) ?? '')

    push({
      ...base(),
      kind: 'kanji',
      id: makeId(category.id, character),
      character,
      on: readings(onCell),
      kun: readings(kunCell),
      ...(Number.isFinite(strokes) && strokes > 0 ? { strokes } : {}),
      vocabulary,
      meaning,
      example: splitExample(example),
    })
    continue
  }

  if (table === 'word') {
    const [kanjiCell, kanaCell, meaning, example] = cells
    const writing = stripPlaceholder(kanjiCell)
    const kana = stripPlaceholder(kanaCell) ?? ''
    if (!kana || !meaning) {
      warnings.push(`Skipped incomplete row at line ${i + 1}`)
      continue
    }
    // A writing with no kanji in it is not a kanji spelling, whatever column
    // it arrived in. びっくりする sits in the first column with びっくりする
    // repeated as its reading, and taking that at face value renders the card
    // front as びっくりする・びっくりする.
    const kanji = writing && hasKanji(writing) ? writing : null
    push({
      ...base(),
      kind: 'word',
      // Keyed on the writing, not on what survives the check above, so
      // tightening that check can never renumber an entry and lose its
      // scheduling.
      id: makeId(category.id, writing ?? kana),
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
      const supplied = resolveReading(half.raw, SUPPLIED_READINGS, `line ${i + 1}`)
      if (supplied) reading = { kanji: half.raw, kana: supplied }
      // resolveReading has already recorded why, if it couldn't.
      else warnings.push(`No reading for ${half.raw} (line ${i + 1})`)
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
      kanji: kanji && hasKanji(kanji) ? kanji : null,
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
  const key =
    e.kind === 'pattern' ? e.pattern : e.kind === 'kanji' ? e.character : (e.kanji ?? e.kana)
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
    const show = (x: Entry) =>
      x.kind === 'pattern' ? x.pattern : x.kind === 'kanji' ? x.character : (x.kanji ?? x.kana)
    errors.push(`Duplicate id ${e.id}: "${show(prev)}" and "${show(e)}"`)
  }
  seen.set(e.id, e)
  if (!e.meaning.trim()) errors.push(`Empty meaning for ${e.id}`)
}

/*
 * Readings for patterns, after parsing rather than during it: installDeck
 * biases lookup toward the teacher's own words, and the deck doesn't exist
 * until every row has been read.
 */
installDeck(entries)
for (const e of entries) {
  if (e.kind !== 'pattern' || !hasKanji(e.pattern)) continue
  const reading = resolveReading(e.pattern, PATTERN_READINGS, 'pattern')
  if (reading) e.reading = reading
  // Kanji you can't read is not a degraded card, it is an unusable one.
  else errors.push(`Pattern with kanji and no reading: ${e.pattern}`)
}

const noExample = entries.filter((e) => !e.example).length
const noReading = entries.filter((e) => e.kind === 'word' && !e.kana).length

const dataset: Dataset = {
  id: 'japones-sensei-ai',
  name: 'Japonés de clase',
  subject: { target: '日本語', reading: 'にほんご', native: 'Japonés' },
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

if (fromDict.length) {
  console.log(`\n  ${fromDict.length} reading(s) taken from the bundled dictionary:`)
  for (const r of fromDict) console.log(`    - ${r}`)
}

if (redundantOverrides.length) {
  console.log(
    `\n  ${redundantOverrides.length} override(s) the dictionary already agrees with — delete them:`,
  )
  for (const r of redundantOverrides) console.log(`    - ${r}`)
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
