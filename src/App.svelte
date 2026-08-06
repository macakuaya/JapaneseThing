<script lang="ts">
  import { onMount } from 'svelte'
  import { EllipsisVertical, Plus, Search } from '@lucide/svelte'
  import Home from './views/Home.svelte'
  import Review from './views/Review.svelte'
  import Practice from './views/Practice.svelte'
  import Deck from './views/Deck.svelte'
  import Add from './views/Add.svelte'
  import SettingsView from './views/Settings.svelte'
  import Tooltip from './components/Tooltip.svelte'
  import { store, type View } from './lib/store.svelte.ts'

  const home = () => (store.view = 'home')

  // Due counts are time-dependent; without this the Home screen would still
  // claim "all caught up" an hour after a learning step came due.
  onMount(() => {
    const id = setInterval(() => (store.now = Date.now()), 30_000)

    // The dictionary is ~1 MB, so it loads after first paint rather than
    // blocking it. Everything works without it; only sentence furigana and
    // lookup wait, and both appear as soon as it lands.
    if (store.settings.lookup || store.settings.furigana !== 'off') {
      const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 400))
      idle(() => store.ensureDict())
    }

    return () => clearInterval(id)
  })
</script>

<div class="shell">
  <!--
    One header, and it belongs to whatever you are doing.

    While a session runs it carries that session's counter and nothing else:
    navigating elsewhere mid-card is not the thing you want made easy, and 語
    already gets you home. Everywhere else it is navigation.
  -->
  <nav>
    <button class="brand" onclick={home} aria-label="Home" title="Home">
      <span class="jp">語</span>
    </button>
    <span class="spacer"></span>

    {#if store.sessionActive}
      <!--
        The same kebab that sits here everywhere else, so the corner glyph
        never changes between views — only what it opens does. In a session
        the one thing worth reaching for is the card in front of you.
      -->
      <button
        class="ghost icon"
        class:on={store.sessionEditing}
        onclick={() => (store.sessionEditing = !store.sessionEditing)}
        title="Edit this card"
        aria-label="Edit this card"
      >
        <EllipsisVertical size={19} />
      </button>
    {:else}
      <!-- Two destinations: today's work is Home, everything about the cards
           is Deck. Practice is reached by studying, not as a place. -->
      <button
        class="ghost icon"
        class:on={store.view === 'deck'}
        onclick={() => (store.view = 'deck')}
        title="Deck"
        aria-label="Deck"
      >
        <Search size={19} />
      </button>
      <button
        class="ghost icon"
        class:on={store.view === 'add'}
        onclick={() => (store.view = 'add')}
        title="Add"
        aria-label="Add"
      >
        <Plus size={19} />
      </button>
      <button
        class="ghost icon"
        class:on={store.view === 'settings'}
        onclick={() => (store.view = 'settings')}
        title="Settings"
        aria-label="Settings"
      >
        <EllipsisVertical size={19} />
      </button>
    {/if}
  </nav>

  <main>
    {#if store.view === 'home'}
      <Home onNavigate={(v: View) => (store.view = v)} />
    {:else if store.view === 'review'}
      <Review onExit={home} />
    {:else if store.view === 'practice'}
      <!-- Back to wherever the drill was started from. -->
      <Practice onExit={() => (store.view = store.practiceReturnTo)} />
    {:else if store.view === 'deck'}
      <Deck />
    {:else if store.view === 'add'}
      <Add />
    {:else if store.view === 'settings'}
      <SettingsView />
    {/if}
  </main>

  <Tooltip />
</div>

<style>
  /* Full height and a column, so a view can ask to fill what's left and pin
     its own footer to the bottom edge. */
  .shell {
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 0 1rem env(safe-area-inset-bottom);
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  /*
   * Fixed height, not derived from its contents. The session header is a bare
   * span and the navigation is a row of padded buttons, so letting the content
   * size the bar moved everything below it every time you started or left a
   * session.
   */
  /* Top inset equals the shell's side inset, so 語 sits square in the corner
     rather than optically centred in a taller bar. */
  nav {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    height: 3.5rem;
    padding: 1rem 0 0;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
    flex-shrink: 0;
  }

  /* No padding of its own: the glyph starts exactly at the shell's inset, so
     its distance from the left edge matches its distance from the top. */
  .brand {
    display: flex;
    align-items: center;
    border: none;
    background: none;
    padding: 0;
    font-size: 1.4rem;
    line-height: 1;
  }

  .brand:hover {
    background: none;
    color: var(--accent);
  }

  nav button.on {
    color: var(--text);
    background: var(--surface-2);
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.25rem 0 1rem;
  }

</style>
