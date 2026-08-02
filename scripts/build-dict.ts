// Trims JMdict (Spanish) and KANJIDIC2 into compact lookup files.
//
//   npm run dict            # uses cached downloads if present
//   npm run dict -- --fresh # re-download
//
// Output goes to public/dict/, which is served as a static file and fetched
// lazily on first lookup — NOT bundled into the app JS, and deliberately
// excluded from the service worker's precache list so the first load of the
// app stays small. Once fetched it is runtime-cached and works offline.
//
// Data: JMdict and KANJIDIC2 are property of the Electronic Dictionary
// Research and Development Group, used under CC BY-SA 4.0.
// Packaged via github.com/scriptin/jmdict-simplified.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public/dict')
const CACHE = join(ROOT, '.dict-cache')

const TAG = '3.6.2+20260727141257'
const VERSION = TAG.split('+')[0]
const BASE = `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(TAG)}`

const fresh = process.argv.includes('--fresh')

function fetchDict(name: string): string {
  const json = join(CACHE, `${name}-${VERSION}.json`)
  if (existsSync(json) && !fresh) return json
  mkdirSync(CACHE, { recursive: true })
  const tgz = join(CACHE, `${name}.tgz`)
  console.log(`  downloading ${name}…`)
  execFileSync('curl', ['-sL', '--max-time', '300', '-o', tgz, `${BASE}/${name}-${TAG}.json.tgz`])
  execFileSync('tar', ['xzf', tgz, '-C', CACHE])
  return json
}

const mb = (n: number) => `${(n / 1048576).toFixed(2)} MB`

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** A tooltip shows a few senses, not a dictionary page. */
const MAX_SENSES = 3
const MAX_GLOSSES = 4

interface OutWord {
  /** Kanji writings. */
  k: string[]
  /** Kana readings. */
  r: string[]
  /** Senses: part-of-speech tag plus Spanish glosses. */
  s: { p: string; g: string[] }[]
  /** 1 when JMdict marks the word common — used to rank lookup hits. */
  c?: 1
  /**
   * Forms JMdict flags as rare/irregular/outdated (rK, oK, ok, iK…). 彼 is a
   * rare spelling of あれ but the everyday spelling of かれ; without this the
   * two tie and "aquello" can beat "él".
   */
  rare?: string[]
}

function buildWords(path: string) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const words: OutWord[] = []

  for (const w of raw.words) {
    const senses: OutWord['s'] = []
    for (const sense of w.sense) {
      const glosses: string[] = []
      for (const g of sense.gloss) {
        if (g.lang !== 'spa') continue
        if (!glosses.includes(g.text)) glosses.push(g.text)
        if (glosses.length >= MAX_GLOSSES) break
      }
      if (!glosses.length) continue
      senses.push({ p: sense.partOfSpeech[0] ?? '', g: glosses })
      if (senses.length >= MAX_SENSES) break
    }
    if (!senses.length) continue

    // Common forms first, order otherwise preserved. The lookup treats the
    // first form as the entry's primary one — both for ranking a match and for
    // choosing which reading to print as furigana — so demoting rare and
    // irregular spellings here makes both decisions better.
    const rank = (x: any) =>
      (x.common ? 0 : 2) + (x.tags.includes('rK') || x.tags.includes('rk') || x.tags.includes('ok') ? 1 : 0)
    const byRank = (a: any, b: any) => rank(a) - rank(b)

    const k = w.kanji
      .filter((x: any) => !x.tags.includes('sK'))
      .slice()
      .sort(byRank)
      .map((x: any) => x.text)
    const r = w.kana
      .filter((x: any) => !x.tags.includes('sk'))
      .slice()
      .sort(byRank)
      .map((x: any) => x.text)
    if (!k.length && !r.length) continue

    const common = w.kanji.some((x: any) => x.common) || w.kana.some((x: any) => x.common)

    const RARE_TAGS = ['rK', 'rk', 'oK', 'ok', 'iK', 'ik', 'io']
    const rare = [...w.kanji, ...w.kana]
      .filter((x: any) => x.tags.some((t: string) => RARE_TAGS.includes(t)))
      .map((x: any) => x.text)

    words.push({
      k,
      r,
      s: senses,
      ...(common ? { c: 1 as const } : {}),
      ...(rare.length ? { rare } : {}),
    })
  }

  return words
}

// ---------------------------------------------------------------------------
// Kanji
// ---------------------------------------------------------------------------

const MAX_KUN = 6
const MAX_ON = 4
const MAX_KANJI_MEANINGS = 4

interface OutKanji {
  /** on'yomi */
  o: string[]
  /** kun'yomi, keeping the . that marks where okurigana starts */
  k: string[]
  /** meanings */
  m: string[]
  /** true when the meanings are English because no Spanish gloss exists */
  en?: 1
  /** school grade, if jōyō */
  g?: number
}

function buildKanji(path: string, needed: Set<string>) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const out: Record<string, OutKanji> = {}
  let englishFallback = 0

  for (const c of raw.characters) {
    const group = c.readingMeaning?.groups?.[0]
    if (!group) continue

    const es = group.meanings.filter((m: any) => m.lang === 'es').map((m: any) => m.value)
    const en = group.meanings.filter((m: any) => m.lang === 'en').map((m: any) => m.value)
    const meanings = es.length ? es : en
    if (!meanings.length) continue

    const grade: number | undefined = c.misc?.grade ?? undefined
    // Keep jōyō/jinmeiyō, anything with a Spanish gloss, and every character
    // that actually appears in the bundled deck.
    const keep = (grade !== undefined && grade <= 8) || es.length > 0 || needed.has(c.literal)
    if (!keep) continue

    if (!es.length) englishFallback++
    out[c.literal] = {
      o: group.readings
        .filter((r: any) => r.type === 'ja_on')
        .map((r: any) => r.value)
        .slice(0, MAX_ON),
      k: group.readings
        .filter((r: any) => r.type === 'ja_kun')
        .map((r: any) => r.value)
        .slice(0, MAX_KUN),
      m: meanings.slice(0, MAX_KANJI_MEANINGS),
      ...(es.length ? {} : { en: 1 as const }),
      ...(grade !== undefined && grade <= 8 ? { g: grade } : {}),
    }
  }

  return { kanji: out, englishFallback }
}

// ---------------------------------------------------------------------------

/** Every kanji used anywhere in the bundled deck, so none is ever missing. */
function deckKanji(): Set<string> {
  const seed = JSON.parse(readFileSync(join(ROOT, 'src/data/seed.json'), 'utf8'))
  const out = new Set<string>()
  const add = (s: string | null | undefined) => {
    for (const ch of s ?? '') if (/[㐀-鿿]/.test(ch)) out.add(ch)
  }
  for (const e of seed.entries) {
    add(e.kanji)
    add(e.pattern)
    add(e.example?.target)
  }
  return out
}

console.log('\nBuilding dictionaries…\n')

const needed = deckKanji()
console.log(`  ${needed.size} distinct kanji used by the bundled deck`)

const words = buildWords(fetchDict('jmdict-spa'))
const { kanji, englishFallback } = buildKanji(fetchDict('kanjidic2-all'), needed)

const missing = [...needed].filter((c) => !(c in kanji))

mkdirSync(OUT_DIR, { recursive: true })

const wordsFile = join(OUT_DIR, 'words.json')
const kanjiFile = join(OUT_DIR, 'kanji.json')
writeFileSync(wordsFile, JSON.stringify({ v: VERSION, words }))
writeFileSync(kanjiFile, JSON.stringify({ v: VERSION, kanji }))

const report = (label: string, file: string, count: number) => {
  const bytes = statSync(file).size
  const gz = gzipSync(readFileSync(file)).length
  console.log(
    `  ${label.padEnd(7)} ${String(count).padStart(6)} entries   ${mb(bytes).padStart(9)}   ${mb(gz).padStart(9)} gzipped`,
  )
}

console.log()
report('words', wordsFile, words.length)
report('kanji', kanjiFile, Object.keys(kanji).length)
console.log(`\n  ${englishFallback} kanji fall back to English meanings (no Spanish gloss)`)
console.log(`  deck kanji missing from KANJIDIC: ${missing.length}${missing.length ? ' → ' + missing.join('') : ''}`)
console.log('\n✓ wrote public/dict/\n')
