<script lang="ts">
  import { Check } from '@lucide/svelte'
  import { tooltip } from '../lib/tooltip.svelte.ts'
  import { store } from '../lib/store.svelte.ts'
  import { makeId } from '../lib/text.ts'
  import type { Entry } from '../lib/types.ts'

  const hit = $derived(tooltip.hit)
  const word = $derived(hit?.word ?? null)

  const headword = $derived(word ? (word.k[0] ?? word.r[0]) : tooltip.surface)
  const readings = $derived(word ? word.r.slice(0, 2).join('、') : '')

  /** True when this word is already in the deck, so we don't offer to re-add. */
  const alreadyInDeck = $derived.by(() => {
    if (!word) return false
    const forms = new Set([...word.k, ...word.r])
    return store.dataset.entries.some(
      (e) => e.kind === 'word' && (forms.has(e.kanji ?? '') || forms.has(e.kana)),
    )
  })

  /**
   * Placement never measures the panel.
   *
   * Deriving `top` from `panel.offsetHeight` meant the first render used a
   * guessed height and the second — once `bind:this` had landed — moved the
   * panel. If it slid out from under the cursor, no pointerleave fired (the
   * pointer hadn't moved, the element had) and the tooltip was orphaned open.
   *
   * Instead: width comes from the same expression as the CSS, and flipping
   * above is done with a transform, which needs no height at all.
   */
  const FLIP_MARGIN = 220

  const placement = $derived.by(() => {
    const { x, top, bottom } = tooltip.anchor
    const width = Math.min(320, window.innerWidth - 16)
    const flip = window.innerHeight - bottom < FLIP_MARGIN && top > FLIP_MARGIN
    return {
      left: Math.min(Math.max(x - width / 2, 8), window.innerWidth - width - 8),
      top: flip ? top - 10 : bottom + 10,
      flip,
    }
  })

  function addToDeck() {
    if (!word) return
    const kanji = word.k[0] ?? null
    const kana = word.r[0] ?? word.k[0] ?? ''
    const category = tooltip.categoryHint ?? store.dataset.categories[0]?.id ?? 'vocabulario'
    const entry: Entry = {
      id: makeId(category, kanji ?? kana),
      kind: 'word',
      category,
      subcategory: null,
      kanji,
      kana,
      variants: [],
      meaning: word.s[0].g.join(', '),
      example: null,
      source: 'user',
      relatedIds: [],
      note: 'del diccionario',
    }
    store.addEntries([entry])
    tooltip.added = true
  }
</script>

<!--
  Dismissal is handled by listeners rather than a covering element. A
  full-viewport scrim would sit under the cursor the instant the tooltip
  opened, and would also block hovering any other word.
-->
<svelte:window
  onkeydown={(e) => e.key === 'Escape' && tooltip.hide()}
  onscroll={() => tooltip.hide()}
  onblur={() => tooltip.hide()}
  onpointerdown={(e) => {
    const el = e.target as Element | null
    if (!el?.closest?.('.panel') && !el?.closest?.('.word')) tooltip.hide()
  }}
  onpointermove={(e) => {
    // Self-healing safety net. pointerleave is not reliable on its own — it
    // never fires if the panel moves out from under a stationary cursor, if
    // the element is removed mid-gesture, or if the pointer exits the window.
    // Any actual mouse movement outside both the word and the panel closes it.
    if (!tooltip.open) return
    const el = e.target as Element | null
    if (!el?.closest?.('.panel') && !el?.closest?.('.word')) tooltip.requestHide()
  }}
/>

<svelte:document onpointerleave={() => tooltip.hide()} />

{#if tooltip.open}
  <div
    class="panel card-surface"
    class:flip={placement.flip}
    style:left="{placement.left}px"
    style:top="{placement.top}px"
    role="dialog"
    tabindex="-1"
    aria-label="Dictionary entry for {headword}"
    onpointerenter={() => tooltip.keepOpen()}
    onpointerleave={() => tooltip.requestHide()}
  >
    {#if word}
      <div class="head">
        <span class="jp term">{headword}</span>
        {#if readings && readings !== headword}
          <span class="jp reading">・{readings}</span>
        {/if}
      </div>

      {#if hit && hit.via.length}
        <p class="via faint">{hit.surface} → {hit.base} · {hit.via.join(' · ')}</p>
      {/if}

      {#each word.s as sense, i (i)}
        <p class="sense">
          {#if sense.p}<span class="pos faint">{sense.p === 'deck' ? 'tu mazo' : sense.p}</span>{/if}
          {sense.g.join(', ')}
        </p>
      {/each}

      {#if tooltip.alternatives.length}
        <!-- Shown only when an alternative scores as highly as the winner, so
             a genuine ambiguity is visible instead of silently resolved. -->
        <div class="alts">
          <span class="alts-label faint">o quizá</span>
          {#each tooltip.alternatives as alt (alt.word.k[0] ?? alt.word.r[0])}
            <p class="alt">
              <span class="jp">{alt.word.k[0] ?? alt.word.r[0]}</span>
              {#if alt.word.r[0] && alt.word.k[0]}<span class="faint">・{alt.word.r[0]}</span>{/if}
              <span class="muted">{alt.word.s[0].g[0]}</span>
              {#if alt.deck}<span class="faint">· tu mazo</span>{/if}
            </p>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="head"><span class="jp term">{tooltip.surface}</span></div>
      <p class="sense faint">No hay entrada de diccionario.</p>
    {/if}

    {#if tooltip.kanji.length}
      <div class="kanji-list">
        {#each tooltip.kanji as k (k.char)}
          <div class="kanji">
            <span class="jp char">{k.char}</span>
            <div class="kbody">
              <div class="jp kreadings">
                {[...k.info.o, ...k.info.k].slice(0, 5).join(' · ')}
              </div>
              <div class="kmeaning">
                {k.info.m.join(', ')}
                {#if k.info.en}<span class="faint"> (en)</span>{/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if word}
      <div class="actions">
        {#if alreadyInDeck}
          <span class="faint small">Ya está en tu mazo</span>
        {:else if tooltip.added}
          <span class="added small"><Check size={12} /> Añadido</span>
        {:else}
          <button class="add" onclick={addToDeck}>+ Añadir al mazo</button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    z-index: 50;
    width: min(320px, calc(100vw - 16px));
    padding: 0.8rem 0.9rem;
    text-align: left;
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.28),
      0 12px 32px rgba(0, 0, 0, 0.32);
  }

  /* Sits above the word instead of below it — done with a transform so the
     panel's height never has to be measured, and so it never jumps. */
  .panel.flip {
    transform: translateY(-100%);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 0.1rem;
    flex-wrap: wrap;
  }

  .term {
    font-size: 1.3rem;
  }

  .reading {
    font-size: 0.95rem;
    color: var(--muted);
  }

  .via {
    margin: 0.15rem 0 0;
    font-size: 0.7rem;
  }

  .sense {
    margin: 0.4rem 0 0;
    font-size: 0.9rem;
  }

  .pos {
    font-size: 0.7rem;
    margin-right: 0.35rem;
  }

  .alts {
    margin-top: 0.5rem;
  }

  .alts-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .alt {
    margin: 0.15rem 0 0;
    font-size: 0.82rem;
  }

  .kanji-list {
    margin-top: 0.7rem;
    padding-top: 0.6rem;
    /* One of the sanctioned dividers: separates two different kinds of
       information (the word, then its characters) on the same surface. */
    border-top: 1px solid var(--divider);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .kanji {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
  }

  .char {
    font-size: 1.5rem;
    line-height: 1;
    min-width: 1.3em;
    text-align: center;
  }

  .kbody {
    min-width: 0;
  }

  .kreadings {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .kmeaning {
    font-size: 0.8rem;
  }

  .actions {
    margin-top: 0.7rem;
  }

  .add {
    width: 100%;
    padding: 0.4rem;
    font-size: 0.82rem;
  }

  .small {
    font-size: 0.78rem;
  }

  .added {
    color: var(--good);
  }
</style>
