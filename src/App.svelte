<script lang="ts">
  import { onMount } from 'svelte'
  import Home from './views/Home.svelte'
  import Review from './views/Review.svelte'
  import Practice from './views/Practice.svelte'
  import Browse from './views/Browse.svelte'
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
  <nav>
    <button class="brand" onclick={home}>
      <span class="jp">語</span>
    </button>
    <span class="spacer"></span>
    <!-- Every destination lives here. Home used to repeat these as a second
         row of buttons, which is the same three places twice. -->
    <button
      class="ghost"
      class:on={store.view === 'practice'}
      onclick={() => (store.view = 'practice')}
    >
      Practice
    </button>
    <button class="ghost" class:on={store.view === 'browse'} onclick={() => (store.view = 'browse')}>
      Browse
    </button>
    <button class="ghost" class:on={store.view === 'add'} onclick={() => (store.view = 'add')}>
      Add
    </button>
    <button
      class="ghost"
      class:on={store.view === 'settings'}
      onclick={() => (store.view = 'settings')}
      aria-label="Settings"
    >
      ⚙
    </button>
  </nav>

  <main>
    {#if store.view === 'home'}
      <Home onNavigate={(v: View) => (store.view = v)} />
    {:else if store.view === 'review'}
      <Review onExit={home} />
    {:else if store.view === 'practice'}
      <Practice onExit={home} />
    {:else if store.view === 'browse'}
      <Browse onExit={home} />
    {:else if store.view === 'add'}
      <Add onExit={home} />
    {:else if store.view === 'settings'}
      <SettingsView onExit={home} />
    {/if}
  </main>

  <Tooltip />
</div>

<style>
  .shell {
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 0 1rem env(safe-area-inset-bottom);
  }

  /* Sticky over scrolling content — one of the few places a real division
     exists that fill cannot express, so it keeps its hairline. */
  nav {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 0;
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 10;
    border-bottom: 1px solid var(--divider);
  }

  .brand {
    border: none;
    background: none;
    padding: 0.1rem 0.4rem;
    font-size: 1.4rem;
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
    padding: 1.25rem 0 4rem;
  }
</style>
