<script lang="ts">
  // Renders Japanese with optional furigana and optional tap/hover lookup.
  //
  // Two very different paths, deliberately:
  //
  //  - `reading` given (a headword): the reading is authoritative deck data,
  //    so furigana is exact and needs no dictionary at all.
  //  - no reading (a sentence): the text is segmented against the dictionary
  //    and each token's reading comes from its own matched entry. Tokens that
  //    don't resolve simply get no furigana — never a guessed one.

  import { alignFurigana } from '../lib/furigana.ts'
  import { type Token, isWorthExplaining, readingOf, segment } from '../lib/dict.ts'
  import { store } from '../lib/store.svelte.ts'
  import { tooltip } from '../lib/tooltip.svelte.ts'

  interface Props {
    text: string
    /** Known reading, for a deck headword. Enables exact furigana offline. */
    reading?: string | null
    /** Whether furigana may show here at all (the caller applies the setting). */
    furigana?: boolean
    /** Whether words respond to hover/tap. */
    interactive?: boolean
    /** Category to file a looked-up word under if it's added to the deck. */
    categoryHint?: string | null
    /** What this card already teaches; those words get no tooltip. */
    taught?: string
  }

  const {
    text,
    reading = null,
    furigana = false,
    interactive = false,
    categoryHint = null,
    taught = '',
  }: Props = $props()

  const dictReady = $derived(store.dict === 'ready')

  /**
   * One entry per word, each holding its own ruby segments.
   *
   * Grouping matters: 涼しいです aligns to 涼[すず] + しいです, and rendering
   * those as two hover targets gave a single word two competing highlight
   * regions that flickered as the pointer crossed between them. The word is
   * one target; the segments are only how it's typeset.
   */
  interface Piece {
    token: Token | null
    segments: { text: string; ruby: string }[]
  }

  /** Kept separate so neighbour-aware checks can see the whole sentence. */
  const tokens = $derived(reading || !dictReady ? [] : segment(text))

  const pieces = $derived.by((): Piece[] => {
    // Headword: exact alignment from the deck's own kana.
    if (reading) {
      return [{ token: null, segments: alignFurigana(text, reading) }]
    }

    // Sentence: needs the dictionary. Until it loads, render plain text.
    if (!dictReady) return [{ token: null, segments: [{ text, ruby: '' }] }]

    return tokens.map((token) => {
      const tokenReading = furigana ? readingOf(token) : null
      return {
        token,
        segments: tokenReading
          ? alignFurigana(token.text, tokenReading)
          : [{ text: token.text, ruby: '' }],
      }
    })
  })

  function surfaceOf(piece: Piece): string | null {
    if (!interactive || !dictReady) return null
    const surface = piece.token?.text
    return surface && /[぀-ヿ㐀-鿿]/.test(surface) ? surface : null
  }

  // Hover only for an actual mouse. Touch fires pointerenter too, which would
  // open the tooltip on the way to a tap and then immediately toggle it shut.
  function onEnter(event: PointerEvent, piece: Piece) {
    if (event.pointerType !== 'mouse') return
    const surface = surfaceOf(piece)
    if (surface) tooltip.requestShow(event.currentTarget as Element, surface, categoryHint)
  }

  function onLeave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    tooltip.requestHide()
  }

  function onActivate(event: Event, piece: Piece) {
    const surface = surfaceOf(piece)
    if (!surface) return
    event.stopPropagation()
    tooltip.toggle(event.currentTarget as Element, surface, categoryHint)
  }
</script><!--
  No whitespace between the pieces below: Japanese has no word spacing, and a
  newline in the markup would render as a gap mid-sentence.
--><span class="jp-text">{#each pieces as piece, i (i)}{#if interactive && piece.token && isWorthExplaining(piece.token, taught, tokens)}<span
        class="word"
        class:active={tooltip.open && tooltip.target !== null && tooltip.surface === piece.token.text}
        role="button"
        tabindex="0"
        onpointerenter={(e) => onEnter(e, piece)}
        onpointerleave={onLeave}
        onclick={(e) => onActivate(e, piece)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onActivate(e, piece)
        }}
        >{#each piece.segments as seg, j (j)}{#if seg.ruby}<ruby
            >{seg.text}<rt>{seg.ruby}</rt></ruby
          >{:else}{seg.text}{/if}{/each}</span
      >{:else}{#each piece.segments as seg, j (j)}{#if seg.ruby}<ruby
          >{seg.text}<rt>{seg.ruby}</rt></ruby
        >{:else}{seg.text}{/if}{/each}{/if}{/each}</span>

<style>
  .jp-text {
    font-family:
      'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', 'Meiryo',
      sans-serif;
    line-height: 1.4;
  }

  ruby {
    ruby-align: center;
  }

  rt {
    font-size: 0.5em;
    color: var(--muted);
    font-weight: 400;
    /* Chrome and Safari disagree on default ruby spacing; pin it so the line
       height doesn't jump when furigana is toggled on. */
    line-height: 1.1;
    user-select: none;
  }

  .word {
    cursor: help;
    border-radius: 3px;
    transition: background 0.1s ease;
  }

  /* The hover tint is instant feedback that a word is lookupable; `.active`
     keeps it lit while its tooltip is open, including after the pointer has
     travelled off the word and onto the panel. */
  .word:hover,
  .word:focus-visible,
  .word.active {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    outline: none;
  }
</style>
