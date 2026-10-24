<script lang="ts">
  import Shell from './components/Shell.svelte'
  import { workspaceClient } from './clients/workspaceClient'
  import type { AppProps } from './types'

  // Props ---------------------------------------------------------------------
  let { client = workspaceClient }: AppProps = $props()
</script>

<Shell {client} />
