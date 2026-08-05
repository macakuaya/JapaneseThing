<script lang="ts">
  // Review is Session with the scheduler in charge: the queue is whatever is
  // due, and every answer is written back.
  import Session from './Session.svelte'
  import { reviewConfig } from '../lib/session.ts'
  import { store } from '../lib/store.svelte.ts'

  interface Props {
    onExit: () => void
  }

  const { onExit }: Props = $props()
</script>

<Session
  config={reviewConfig(store.settings)}
  mode="review"
  log={store.log}
  {onExit}
/>
