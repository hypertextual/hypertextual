<script lang="ts">
  import { greeting } from './lib/greeting'

  const message = greeting('')
</script>

<svelte:head>
  <title>hypertextual-svelte</title>
</svelte:head>

<main aria-labelledby="app-title">
  <p class="eyebrow">Svelte + Vite</p>
  <h1 id="app-title">{message}</h1>
  <p>A client-only static application ready to build into <code>dist/</code>.</p>
</main>
