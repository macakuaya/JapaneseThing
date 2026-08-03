<script lang="ts">
  // Practice has no picker any more. The Deck view is the picker: you filter
  // a list, press Drill, and study exactly what you were looking at. This
  // just turns that request into a session.

  import Session from './Session.svelte'
  import { type SessionConfig, EMPTY_FILTER, practiceConfig } from '../lib/session.ts'
  import { store } from '../lib/store.svelte.ts'

  interface Props {
    onExit: () => void
  }

  const { onExit }: Props = $props()

  // Read once. The request is consumed on arrival so a later navigation
  // doesn't silently re-run the previous selection.
  const request = store.practiceRequest
  store.practiceRequest = null

  const config: SessionConfig = {
    ...practiceConfig(
      {
        ...EMPTY_FILTER,
        categories: request?.categories ?? [],
        subcategories: request?.subcategories ?? [],
      },
      request?.limit ?? 20,
    ),
    writeThrough: request?.writeThrough ?? false,
  }
</script>

<Session {config} title="Practice" mode="practice" {onExit} />
