<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    asyncState,
    graphs,
    refreshGraphSummaries,
    selectGraph,
    statusSummary,
    uiControls,
  } from './lib/stores';

  const title = 'Pinpoint';

  onMount(async () => {
    await refreshGraphSummaries();
    const list = get(graphs);
    if (list.length > 0) {
      await selectGraph(list[0].id);
    }
  });
</script>

<main class="app-shell">
  <header class="shell-header">
    <span class="logo">📍 {title}</span>
    <span class="shell-note">Svelte UI — Phase 2 foundation</span>
  </header>
  <div class="shell-body">
    <section class="panel">
      <h2>Graph metadata</h2>
      {#if $asyncState.isLoading}
        <p>Loading…</p>
      {:else if $asyncState.error}
        <p class="error">Error: {$asyncState.error}</p>
      {:else if $graphs.length === 0}
        <p>No graphs found.</p>
      {:else}
        <ul>
          {#each $graphs as graph}
            <li>
              <button type="button" on:click={() => selectGraph(graph.id)}>
                {graph.name} ({graph.nodeCount} nodes)
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h2>Status summary</h2>
      <p>Graph: {$statusSummary.graphId}</p>
      <p>Nodes: {$statusSummary.nodeCount}</p>
      <p>Edges: {$statusSummary.edgeCount}</p>
      <p>Can undo: {$statusSummary.canUndo ? 'yes' : 'no'}</p>
      <p>Can redo: {$statusSummary.canRedo ? 'yes' : 'no'}</p>
      <p>Zoom: {$uiControls.zoom}</p>
    </section>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .shell-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    background: #1e293b;
    border-bottom: 1px solid #334155;
  }

  .logo {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .shell-note {
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .shell-body {
    flex: 1;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    padding: 2rem;
    color: #94a3b8;
  }

  .panel {
    background: #111827;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .panel h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: #cbd5e1;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  button {
    width: 100%;
    text-align: left;
    border: 1px solid #334155;
    border-radius: 0.35rem;
    background: #1e293b;
    color: #e2e8f0;
    padding: 0.45rem 0.65rem;
    cursor: pointer;
  }

  .error {
    color: #fca5a5;
  }
</style>
