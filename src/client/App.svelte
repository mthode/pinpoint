<script lang="ts">
  const title = 'Pinpoint';
</script>

<main class="app-shell">
  <header class="shell-header">
    <span class="logo">📍 {title}</span>
    <span class="shell-note">Svelte UI — coming soon</span>
  </header>
  <div class="shell-body">
    <p>The new Svelte-based UI is under construction. Please use the legacy UI for now.</p>
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
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: #94a3b8;
  }
</style>
