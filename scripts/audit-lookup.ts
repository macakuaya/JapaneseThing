// Runs the lookup over every example sentence in the deck and ranks each
// token by how likely it is to be wrong.
//
//   npm run audit            # the ranked report
//   npm run audit -- --all   # include low-severity notes
//   npm run audit -- --json  # machine-readable, for the snapshot test
//
// The point is to stop finding these one card at a time while drilling. Every
// signal below is something that was true *before* a wrong tooltip was ever
// shown — a tie, an obscure alternate form, a suspiciously deep deinflection —
// so the machine can surface them in bulk instead of the user tripping over
// them.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type Token,
  installDeck,
  installDict,
  isWorthExplaining,
  readingOf,
  segment,
} from '../src/lib/dict.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'))

const dict = read('public/dict/words.json')
const kanji = read('public/dict/kanji.json')
const seed = read('src/data/seed.json')

installDict(dict.words, kanji.kanji)
installDeck(seed.entries)

const KANJI = /[㐀-鿿]/

type Severity = 'high' | 'medium' | 'low'

interface Finding {
  severity: Severity
  kind: string
  sentence: string
  token: string
  detail: string
}

const findings: Finding[] = []

function inspect(sentence: string, taught: string, token: Token, index: number, all: Token[]) {
  const add = (severity: Severity, kind: string, detail: string) =>
    findings.push({ severity, kind, sentence, token: token.text, detail })

  const hit = token.hit

  // A kanji-bearing token that resolved to nothing at all is a coverage hole:
  // the sentence contains a word the app cannot explain.
  if (!hit) {
    if (KANJI.test(token.text)) add('medium', 'no-match', 'no dictionary entry')
    return
  }

  // Ask exactly what the app asks, siblings included — otherwise the audit
  // reports tokens the UI already suppresses.
  if (!isWorthExplaining(token, taught, all)) return

  const best = hit

  // 1. A competing sense that says something genuinely different. Two senses
  //    of the same word (家 "casa" vs 家 "casa") are not ambiguity.
  const competing = token.alternatives.filter(
    (a) => a.score >= best.score - 10 && a.word.s[0].g[0] !== best.word.s[0].g[0],
  )
  if (competing.length) {
    const tied = competing.some((a) => a.score >= best.score)
    add(
      // A true tie may be resolved wrongly; a near-miss is just worth knowing.
      // Either way the tooltip now offers both, so this is not silent.
      tied ? 'medium' : 'low',
      'ambiguous',
      `${best.word.k[0] ?? best.word.r[0]} "${best.word.s[0].g[0]}"  vs  ` +
        competing
          .map((a) => `${a.word.k[0] ?? a.word.r[0]} "${a.word.s[0].g[0]}"`)
          .join('  vs  '),
    )
  }

  // 2. Matched an entry's obscure alternate form rather than its primary one.
  //    この matching 九's fourth reading is how "nueve" reached a card.
  const forms = [...best.word.k, ...best.word.r]
  const rank = forms.indexOf(best.base)
  if (rank > 0 && !best.deck) {
    add('medium', 'alternate-form', `matched form #${rank + 1} of ${best.word.k[0] ?? forms[0]}`)
  }

  // 3. A part of speech that should not be glossed as vocabulary in a sentence.
  //    Numbers and counters here almost always mean a bad match.
  if (['num', 'ctr', 'pref', 'suf'].includes(best.word.s[0].p) && !best.deck) {
    add('high', 'odd-pos', `tagged ${best.word.s[0].p}: "${best.word.s[0].g[0]}"`)
  }

  // 4. A deep chain built only from ordinary polite/aspect steps is normal
  //    Japanese (働いています), not a suspicious parse. Only flag chains that
  //    also had to change the verb's class or voice to land somewhere.
  const ROUTINE = new Set(['polite', 'polite past', 'progressive', 'te-form', 'past', 'stem'])
  if (best.via.length >= 3 && best.via.some((v) => !ROUTINE.has(v))) {
    add('medium', 'deep-deinflection', `${best.surface} → ${best.base} via ${best.via.join(' · ')}`)
  }

  // 6. Informational: where furigana is being withheld.
  if (KANJI.test(token.text) && readingOf(token) === null) {
    add('low', 'no-furigana', 'reading suppressed as unsafe')
  }
}

for (const entry of seed.entries) {
  const sentence: string | undefined = entry.example?.target
  if (!sentence) continue
  const taught = entry.kind === 'pattern' ? entry.pattern : `${entry.kanji ?? ''}${entry.kana}`
  const tokens = segment(sentence)
  tokens.forEach((t, i) => inspect(sentence, taught, t, i, tokens))
}

// ---------------------------------------------------------------------------

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2))
  process.exit(0)
}

const showAll = process.argv.includes('--all')
const shown = findings.filter((f) => showAll || f.severity !== 'low')

const order: Severity[] = ['high', 'medium', 'low']
shown.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))

const byKind = new Map<string, number>()
for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1)

console.log(`\nAudited ${seed.entries.filter((e: any) => e.example).length} example sentences\n`)
for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${kind}`)
}

console.log()
let lastSeverity = ''
for (const f of shown) {
  if (f.severity !== lastSeverity) {
    console.log(`\n─── ${f.severity.toUpperCase()} ───\n`)
    lastSeverity = f.severity
  }
  console.log(`  ${f.token}   (${f.kind})`)
  console.log(`      ${f.detail}`)
  console.log(`      in: ${f.sentence}`)
}

const high = findings.filter((f) => f.severity === 'high').length
console.log(`\n${high} high-severity finding(s)${showAll ? '' : '; --all to include low'}\n`)
