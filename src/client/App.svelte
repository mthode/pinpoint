<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { GraphWithHistory } from './lib/api';
  import type { GraphNode } from '../shared/graph';
  import {
    availableModels,
    asyncState,
    availableActions,
    brainstormConfig,
    chooseModel,
    chooseProvider,
    clearMergeSelection,
    composerInput,
    createRootNodeAtPosition,
    createGraphAndSelect,
    deleteNodeAndChildren,
    executeActionByName,
    graphs,
    initializeClientState,
    loadActionsForTrigger,
    mergeNodeIds,
    modelProviders,
    persistNodePosition,
    redoSelectedGraph,
    renameSelectedGraph,
    resetZoom,
    selectedGraph,
    selectedModel,
    selectedNode,
    selectedProvider,
    selectedTrigger,
    setNodePositionLocally,
    selectGraph,
    selectNodeInGraph,
    setAutoActionsEnabled,
    setComposerInput,
    setSearchQuery,
    toggleBookmarkForSelectedGraph,
    uiControls,
    undoSelectedGraph,
    updateSelectedTrigger,
    setZoom,
  } from './lib/stores';

  const title = 'Pinpoint Workbench';
  let graphNameDraft = '';
  let createGraphName = '';
  let lastSyncGraphId = '';
  let lastNodeType = '';
  let transientPositions: Record<string, { x: number; y: number }> = {};
  let suppressNodeClickUntil = 0;
  let graphCanvasEl: HTMLDivElement | null = null;
  let isCanvasPanning = false;
  let leftPanelWidth = 320;
  let isResizingLeftPanel = false;
  let contextMenuOpen = false;
  let contextMenuMode: 'canvas' | 'node' | null = null;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuNodeId: string | null = null;
  let rootCreatePosition: { x: number; y: number } | null = null;
  let rootDialogOpen = false;
  let selectedRootType = 'question';
  let rootDialogContent = '';

  type PositionedNode = GraphNode & { x: number; y: number };

  interface RenderNode extends PositionedNode {
    isPending?: boolean;
  }

  function buildLayout(graph: GraphWithHistory | null): RenderNode[] {
    if (!graph) {
      return [];
    }

    const childrenByParent = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const list = childrenByParent.get(edge.from) ?? [];
      list.push(edge.to);
      childrenByParent.set(edge.from, list);
    }

    const levelByNode = new Map<string, number>();
    const queue: string[] = [];
    const rootId = graph.rootNodeId || graph.nodes[0]?.id;

    if (rootId) {
      levelByNode.set(rootId, 0);
      queue.push(rootId);
    }

    while (queue.length > 0) {
      const current = queue.shift() as string;
      const nextLevel = (levelByNode.get(current) ?? 0) + 1;
      const children = childrenByParent.get(current) ?? [];
      for (const childId of children) {
        if (!levelByNode.has(childId)) {
          levelByNode.set(childId, nextLevel);
          queue.push(childId);
        }
      }
    }

    const levels = new Map<number, GraphNode[]>();
    for (const node of graph.nodes) {
      const level = levelByNode.get(node.id) ?? 0;
      const list = levels.get(level) ?? [];
      list.push(node);
      levels.set(level, list);
    }

    const positioned: RenderNode[] = [];
    const sortedLevels = Array.from(levels.entries()).sort((a, b) => a[0] - b[0]);
    for (const [level, nodes] of sortedLevels) {
      nodes.forEach((node, index) => {
        const fallbackX = 60 + level * 260;
        const fallbackY = 40 + index * 150;
        positioned.push({
          ...node,
          x: node.position?.x ?? fallbackX,
          y: node.position?.y ?? fallbackY,
        });
      });
    }

    return positioned;
  }

  function preview(content: string): string {
    const compact = content.replace(/\s+/g, ' ').trim();
    if (compact.length <= 90) {
      return compact;
    }
    return `${compact.slice(0, 87)}...`;
  }

  async function runAction(actionName: string): Promise<void> {
    try {
      await executeActionByName(actionName);
    } catch {
      // Error state is handled by stores.
    }
  }

  async function saveGraphName(): Promise<void> {
    await renameSelectedGraph(graphNameDraft);
  }

  async function createGraph(): Promise<void> {
    const value = createGraphName.trim();
    await createGraphAndSelect(value || undefined);
    createGraphName = '';
  }

  function closeContextMenu(): void {
    contextMenuOpen = false;
    contextMenuMode = null;
    contextMenuNodeId = null;
  }

  function onCanvasContextMenu(event: MouseEvent): void {
    if (!graphCanvasEl) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.node') || target?.closest('button') || target?.closest('input') || target?.closest('textarea') || target?.closest('select')) {
      return;
    }

    event.preventDefault();

    const rect = graphCanvasEl.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;

    rootCreatePosition = {
      x: (graphCanvasEl.scrollLeft + anchorX) / $uiControls.zoom,
      y: (graphCanvasEl.scrollTop + anchorY) / $uiControls.zoom,
    };

    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuMode = 'canvas';
    contextMenuNodeId = null;
    contextMenuOpen = true;
  }

  function onNodeContextMenu(event: MouseEvent, nodeId: string): void {
    event.preventDefault();
    event.stopPropagation();
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuMode = 'node';
    contextMenuNodeId = nodeId;
    contextMenuOpen = true;
  }

  function openRootDialog(type: string): void {
    selectedRootType = type;
    rootDialogContent = '';
    contextMenuOpen = false;
    rootDialogOpen = true;
  }

  async function deleteNodeFromMenu(): Promise<void> {
    if (!contextMenuNodeId) {
      return;
    }

    const nodeId = contextMenuNodeId;
    closeContextMenu();
    try {
      await deleteNodeAndChildren(nodeId);
    } catch {
      // error surfaced by store
    }
  }

  function closeRootDialog(): void {
    rootDialogOpen = false;
  }

  async function submitRootDialog(): Promise<void> {
    const content = rootDialogContent.trim();
    if (!rootCreatePosition || !content) {
      return;
    }

    try {
      await createRootNodeAtPosition({
        type: selectedRootType,
        content,
        x: rootCreatePosition.x,
        y: rootCreatePosition.y,
      });
      rootDialogOpen = false;
    } catch {
      // error is surfaced by store
    }
  }

  async function onNodeClick(event: MouseEvent, nodeId: string): Promise<void> {
    if (Date.now() < suppressNodeClickUntil) {
      return;
    }
    const additive = event.metaKey || event.ctrlKey;
    await selectNodeInGraph(nodeId, additive);
  }

  function onSearchInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    setSearchQuery(target.value);
  }

  function onTriggerChange(event: Event): void {
    const target = event.currentTarget as HTMLSelectElement;
    const value = target.value;
    updateSelectedTrigger(value);
    loadActionsForTrigger(value);
  }

  async function onProviderChange(event: Event): Promise<void> {
    const target = event.currentTarget as HTMLSelectElement;
    await chooseProvider(target.value);
  }

  function onModelChange(event: Event): void {
    const target = event.currentTarget as HTMLSelectElement;
    chooseModel(target.value);
  }

  function onComposerInput(event: Event): void {
    const target = event.currentTarget as HTMLTextAreaElement;
    setComposerInput(target.value);
  }

  function onAutoActionsChange(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    setAutoActionsEnabled(target.checked);
  }

  function adjustZoom(delta: number): void {
    const next = Math.max(0.6, Math.min(2.2, $uiControls.zoom + delta));
    setZoom(Math.round(next * 100) / 100);
  }

  function resetZoomToDefault(): void {
    setZoom(1);
  }

  async function setZoomAtPoint(nextZoom: number, anchorX: number, anchorY: number): Promise<void> {
    if (!graphCanvasEl) {
      return;
    }

    const clamped = Math.max(0.6, Math.min(2.2, nextZoom));
    const oldZoom = $uiControls.zoom;
    if (Math.abs(clamped - oldZoom) < 0.001) {
      return;
    }

    const contentX = (graphCanvasEl.scrollLeft + anchorX) / oldZoom;
    const contentY = (graphCanvasEl.scrollTop + anchorY) / oldZoom;

    setZoom(Math.round(clamped * 100) / 100);
    await tick();

    if (!graphCanvasEl) {
      return;
    }
    graphCanvasEl.scrollLeft = contentX * $uiControls.zoom - anchorX;
    graphCanvasEl.scrollTop = contentY * $uiControls.zoom - anchorY;
  }

  function onCanvasWheel(event: WheelEvent): void {
    if (!graphCanvasEl) {
      return;
    }

    event.preventDefault();
    const rect = graphCanvasEl.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const zoomDelta = event.deltaY < 0 ? 0.1 : -0.1;
    void setZoomAtPoint($uiControls.zoom + zoomDelta, anchorX, anchorY);
  }

  function beginCanvasPan(event: PointerEvent): void {
    if (event.button !== 0 || !graphCanvasEl) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target?.closest &&
      (target.closest('.node') ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('textarea'))
    ) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = graphCanvasEl.scrollLeft;
    const startScrollTop = graphCanvasEl.scrollTop;

    isCanvasPanning = true;

    const onMove = (moveEvent: PointerEvent) => {
      if (!isCanvasPanning || !graphCanvasEl) {
        return;
      }
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      graphCanvasEl.scrollLeft = startScrollLeft - dx;
      graphCanvasEl.scrollTop = startScrollTop - dy;
    };

    const stopPan = () => {
      isCanvasPanning = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stopPan);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stopPan);
  }

  function beginLeftPanelResize(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const startX = event.clientX;
    const startWidth = leftPanelWidth;
    isResizingLeftPanel = true;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = Math.max(260, Math.min(680, startWidth + delta));
      leftPanelWidth = Math.round(next);
    };

    const onUp = () => {
      isResizingLeftPanel = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function beginNodeDrag(event: PointerEvent, nodeId: string): void {
    if (event.button !== 0) {
      return;
    }

    const baseNode = nodeById.get(nodeId);
    if (!baseNode) {
      return;
    }

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = baseNode.x;
    const startY = baseNode.y;
    const zoom = $uiControls.zoom || 1;
    let moved = false;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startClientX) / zoom;
      const dy = (moveEvent.clientY - startClientY) / zoom;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        moved = true;
      }

      const nextX = Math.max(0, startX + dx);
      const nextY = Math.max(0, startY + dy);
      transientPositions = {
        ...transientPositions,
        [nodeId]: { x: nextX, y: nextY },
      };
    };

    const onUp = async (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const dx = (upEvent.clientX - startClientX) / zoom;
      const dy = (upEvent.clientY - startClientY) / zoom;
      const finalX = Math.max(0, startX + dx);
      const finalY = Math.max(0, startY + dy);

      if (moved) {
        suppressNodeClickUntil = Date.now() + 180;
        transientPositions = {
          ...transientPositions,
          [nodeId]: { x: finalX, y: finalY },
        };
        if (baseNode.isPending) {
          setNodePositionLocally(nodeId, finalX, finalY);
        } else {
          await persistNodePosition(nodeId, finalX, finalY);
        }
      }

      transientPositions = Object.fromEntries(
        Object.entries(transientPositions).filter(([id]) => id !== nodeId),
      );
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  $: positionedNodes = buildLayout($selectedGraph);
  $: renderedNodes = positionedNodes.map((node) => ({
    ...node,
    isPending: node.actor === 'pending',
    x: transientPositions[node.id]?.x ?? node.x,
    y: transientPositions[node.id]?.y ?? node.y,
  }));
  $: nodeById = new Map(renderedNodes.map((node) => [node.id, node]));
  $: edgeLines = ($selectedGraph?.edges ?? [])
    .map((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) {
        return null;
      }
      return {
        key: `${edge.from}->${edge.to}`,
        x1: from.x + 105,
        y1: from.y + 56,
        x2: to.x + 105,
        y2: to.y + 56,
      };
    })
    .filter((line): line is { key: string; x1: number; y1: number; x2: number; y2: number } => Boolean(line));

  $: normalizedSearch = $uiControls.search.trim().toLowerCase();
  $: matchedNodeIds = new Set(
    positionedNodes
      .filter(
        (node) =>
          !normalizedSearch ||
          node.content.toLowerCase().includes(normalizedSearch) ||
          node.type.toLowerCase().includes(normalizedSearch),
      )
      .map((node) => node.id),
  );

  $: mergeSelection = new Set($mergeNodeIds);
  $: mergeMode = mergeSelection.size >= 2;
  $: filteredActions = mergeMode
    ? $availableActions.filter((action) => action.branching === 'merge' || action.input === 'selected_branches')
    : $availableActions;
  $: rootNodeTypes = ($brainstormConfig?.outputs ?? ['question', 'request', 'context', 'constraint', 'assumption', 'criterion'])
    .filter((type) => type !== 'root');

  $: if ($selectedGraph && lastSyncGraphId !== $selectedGraph.id) {
    graphNameDraft = $selectedGraph.name;
    lastSyncGraphId = $selectedGraph.id;
  }

  $: if ($selectedNode && $brainstormConfig) {
    const nextType = $selectedNode.type;
    if (nextType !== lastNodeType && $brainstormConfig.triggers.includes(nextType)) {
      lastNodeType = nextType;
      updateSelectedTrigger(nextType);
      loadActionsForTrigger(nextType);
    }
  }

  onMount(async () => {
    await initializeClientState();
  });
</script>

<main class="app-shell">
  <header class="shell-header">
    <h1 class="logo">{title}</h1>
    <p class="shell-note">Phase 3-5 rollout: interactive graph, action workflows, and parity controls</p>
  </header>

  <div class="shell-body">
    <aside class="panel sidebar" style={`width: ${leftPanelWidth}px; flex-basis: ${leftPanelWidth}px;`}>
      <h2>Graphs</h2>
      <div class="graph-create-row">
        <input
          type="text"
          bind:value={createGraphName}
          placeholder="new-graph-id"
          aria-label="New graph id"
        />
        <button type="button" on:click={createGraph}>Create</button>
      </div>

      {#if $graphs.length === 0}
        <p class="muted">No graphs found yet.</p>
      {:else}
        <ul class="graph-list">
          {#each $graphs as graph}
            <li>
              <button
                type="button"
                class:selected={$selectedGraph?.id === graph.id}
                on:click={() => selectGraph(graph.id)}
              >
                <span>{graph.name}</span>
                <small>{graph.nodeCount} nodes</small>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if $selectedGraph}
        <div class="graph-meta">
          <label>
            Name
            <input type="text" bind:value={graphNameDraft} />
          </label>
          <div class="graph-meta-actions">
            <button type="button" on:click={saveGraphName}>Save</button>
            <button type="button" on:click={toggleBookmarkForSelectedGraph}>
              {$selectedGraph.bookmarked ? 'Unbookmark' : 'Bookmark'}
            </button>
          </div>
        </div>
      {/if}

      <section class="side-section">
        <h2>Actions</h2>
      <label>
        Model source
        <select value={$selectedProvider} on:change={onProviderChange}>
          {#each $modelProviders as provider}
            <option value={provider.name}>
              {provider.name}{provider.available ? '' : ' (unavailable)'}
            </option>
          {/each}
        </select>
      </label>

      <label>
        Model
        <select value={$selectedModel} on:change={onModelChange}>
          {#if $availableModels.length === 0}
            <option value="">No models found</option>
          {:else}
            {#each $availableModels as model}
              <option value={model}>{model}</option>
            {/each}
          {/if}
        </select>
      </label>

      <label>
        Trigger
        <select
          value={$selectedTrigger}
          on:change={onTriggerChange}
        >
          {#each $brainstormConfig?.triggers ?? [] as trigger}
            <option value={trigger}>{trigger}</option>
          {/each}
        </select>
      </label>

      <label>
        Prompt input
        <textarea
          rows="3"
          value={$composerInput}
          placeholder="Optional user input for user actions"
          on:input={onComposerInput}
        ></textarea>
      </label>

      <label class="toggle-row">
        <input
          type="checkbox"
          checked={$uiControls.autoActionsEnabled}
          on:change={onAutoActionsChange}
        />
        <span>Apply auto-actions</span>
      </label>

      <div class="action-list">
        {#if filteredActions.length === 0}
          <p class="muted">No actions available for this trigger and mode.</p>
        {:else}
          {#each filteredActions as action}
            <button type="button" class="action" on:click={() => runAction(action.name)}>
              <strong>{action.name}</strong>
              <span>{action.actor} -> {action.output}</span>
            </button>
          {/each}
        {/if}
      </div>
      </section>
    </aside>

    <button
      type="button"
      class="panel-resizer"
      class:active={isResizingLeftPanel}
      aria-label="Resize left panel"
      title="Drag to resize"
      on:pointerdown={beginLeftPanelResize}
    ></button>

    <section class="panel canvas-panel">
      <div class="canvas-toolbar">
        <div class="toolbar-group">
          <button type="button" on:click={() => adjustZoom(-0.1)}>-</button>
          <button type="button" on:click={resetZoomToDefault}>100%</button>
          <button type="button" on:click={() => adjustZoom(0.1)}>+</button>
          <span class="muted">Zoom {$uiControls.zoom.toFixed(2)}x</span>
        </div>

        <div class="toolbar-group">
          <input
            type="search"
            value={$uiControls.search}
            placeholder="Search nodes"
            on:input={onSearchInput}
          />
          <button type="button" on:click={undoSelectedGraph} disabled={!$selectedGraph?.history.canUndo}>Undo</button>
          <button type="button" on:click={redoSelectedGraph} disabled={!$selectedGraph?.history.canRedo}>Redo</button>
        </div>
      </div>

      <div
        class="canvas-wrap"
        class:panning={isCanvasPanning}
        role="region"
        aria-label="Graph canvas"
        bind:this={graphCanvasEl}
        on:pointerdown={beginCanvasPan}
        on:contextmenu={onCanvasContextMenu}
        on:wheel|nonpassive={onCanvasWheel}
      >
        {#if !$selectedGraph}
          <p class="muted">Select a graph to begin.</p>
        {:else}
          <div class="canvas" style={`transform: scale(${$uiControls.zoom}); transform-origin: top left;`}>
            <svg class="edge-layer" aria-hidden="true">
              {#each edgeLines as line}
                <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
              {/each}
            </svg>

            {#each renderedNodes as node}
              <button
                type="button"
                class="node"
                class:active={$selectedNode?.id === node.id}
                class:match={matchedNodeIds.has(node.id)}
                class:merge={mergeSelection.has(node.id)}
                class:pending={node.isPending}
                style={`left: ${node.x}px; top: ${node.y}px;`}
                on:pointerdown={(event) => beginNodeDrag(event, node.id)}
                on:click={(event) => {
                  if (!node.isPending) {
                    void onNodeClick(event, node.id);
                  }
                }}
                on:contextmenu={(event) => {
                  if (!node.isPending) {
                    onNodeContextMenu(event, node.id);
                  }
                }}
              >
                <strong>{node.type}</strong>
                {#if node.isPending}
                  <span class="node-loading">
                    <span class="spinner" aria-hidden="true"></span>
                    <em>Processing...</em>
                  </span>
                {:else}
                  <span>{preview(node.content)}</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if contextMenuOpen}
        <button
          type="button"
          class="context-menu-backdrop"
          aria-label="Close menu"
          on:click={closeContextMenu}
        ></button>
        <div class="context-menu" style={`left: ${contextMenuX}px; top: ${contextMenuY}px;`}>
          {#if contextMenuMode === 'canvas'}
            <div class="context-menu-title">Create root node</div>
            {#each rootNodeTypes as nodeType}
              <button type="button" class="context-item" on:click={() => openRootDialog(nodeType)}>
                {nodeType}
              </button>
            {/each}
          {:else if contextMenuMode === 'node'}
            <div class="context-menu-title">Node actions</div>
            <button type="button" class="context-item danger" on:click={deleteNodeFromMenu}>
              Delete node and children
            </button>
          {/if}
        </div>
      {/if}

      {#if mergeMode}
        <div class="merge-banner">
          Merge mode active with {mergeSelection.size} selected nodes.
          <button type="button" on:click={clearMergeSelection}>Clear</button>
        </div>
      {/if}
    </section>
  </div>

  {#if $asyncState.error}
    <div class="status error">{$asyncState.error}</div>
  {/if}

  {#if $asyncState.toast}
    <div class="status toast">{$asyncState.toast}</div>
  {/if}

  {#if rootDialogOpen}
    <button
      type="button"
      class="dialog-backdrop"
      aria-label="Close dialog"
      on:click={closeRootDialog}
    ></button>
    <div class="dialog" role="dialog" aria-label="Create root node" aria-modal="true">
      <h3>Create {selectedRootType}</h3>
      <textarea
        rows="4"
        bind:value={rootDialogContent}
        placeholder="Enter node content"
      ></textarea>
      <div class="dialog-actions">
        <button type="button" on:click={closeRootDialog}>Cancel</button>
        <button type="button" on:click={submitRootDialog} disabled={!rootDialogContent.trim()}>Create</button>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    overflow: hidden;
    font-family: "DM Sans", "Segoe UI", sans-serif;
    background:
      radial-gradient(1200px 520px at 20% 0%, rgba(226, 232, 240, 0.08), transparent 60%),
      linear-gradient(140deg, #0f172a, #111827 45%, #1f2937);
    color: #f8fafc;
  }

  :global(#app) {
    height: 100%;
    overflow: hidden;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .shell-header {
    display: flex;
    align-items: baseline;
    gap: 1.25rem;
    padding: 1rem 1.25rem;
    background: rgba(15, 23, 42, 0.8);
    border-bottom: 1px solid rgba(148, 163, 184, 0.35);
    backdrop-filter: blur(8px);
  }

  .logo {
    margin: 0;
    font-size: 1.25rem;
    letter-spacing: 0.02em;
  }

  .shell-note {
    margin: 0;
    font-size: 0.88rem;
    color: #cbd5e1;
  }

  .shell-body {
    flex: 1;
    display: flex;
    gap: 0;
    padding: 0.9rem 0.9rem 0.9rem 0.9rem;
    min-height: 0;
    overflow: hidden;
  }

  .panel {
    background: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 0.75rem;
    padding: 1rem;
    min-height: 0;
    overflow: auto;
  }

  .sidebar {
    width: 320px;
    flex: 0 0 320px;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 0.85rem;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .side-section {
    margin-top: 1rem;
    padding-top: 0.85rem;
    border-top: 1px solid rgba(148, 163, 184, 0.24);
  }

  .panel-resizer {
    flex: 0 0 10px;
    width: 10px;
    align-self: stretch;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    cursor: col-resize;
    background: transparent;
    position: relative;
  }

  .panel-resizer::before {
    content: "";
    position: absolute;
    top: 12px;
    bottom: 12px;
    left: 4px;
    width: 2px;
    background: rgba(148, 163, 184, 0.45);
    border-radius: 999px;
  }

  .panel-resizer.active::before,
  .panel-resizer:hover::before {
    background: rgba(56, 189, 248, 0.8);
  }

  .canvas-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    margin-left: 0;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    overflow: hidden;
  }

  h2 {
    margin: 0 0 0.65rem;
    font-size: 1rem;
    color: #e2e8f0;
  }

  .graph-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  input,
  textarea,
  select {
    width: 100%;
    box-sizing: border-box;
    margin-top: 0.3rem;
    margin-bottom: 0.55rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 0.45rem;
    background: rgba(2, 6, 23, 0.75);
    color: #e2e8f0;
    padding: 0.45rem 0.6rem;
  }

  button {
    border: 1px solid rgba(148, 163, 184, 0.45);
    border-radius: 0.45rem;
    background: rgba(30, 41, 59, 0.85);
    color: #e2e8f0;
    padding: 0.42rem 0.6rem;
    cursor: pointer;
  }

  .graph-list button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .graph-list button.selected {
    border-color: #38bdf8;
    background: rgba(14, 116, 144, 0.28);
  }

  .graph-list small {
    color: #94a3b8;
  }

  .graph-create-row {
    display: flex;
    gap: 0.5rem;
  }

  .graph-create-row input {
    margin: 0;
  }

  .graph-meta-actions {
    display: flex;
    gap: 0.5rem;
  }

  .canvas-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .toolbar-group input {
    min-width: 220px;
    margin: 0;
  }

  .canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 0.6rem;
    background:
      radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.25) 1px, transparent 0);
    background-size: 20px 20px;
    min-height: 480px;
    cursor: grab;
  }

  .canvas-wrap.panning {
    cursor: grabbing;
  }

  .context-menu-backdrop,
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .context-menu {
    position: fixed;
    z-index: 31;
    min-width: 180px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.55rem;
    background: rgba(15, 23, 42, 0.98);
    padding: 0.45rem;
    display: grid;
    gap: 0.35rem;
  }

  .context-menu-title {
    font-size: 0.8rem;
    color: #94a3b8;
    padding: 0.15rem 0.35rem;
  }

  .context-item {
    width: 100%;
    text-align: left;
  }

  .context-item.danger {
    border-color: rgba(248, 113, 113, 0.6);
    color: #fecaca;
    background: rgba(127, 29, 29, 0.35);
  }

  .dialog {
    position: fixed;
    z-index: 32;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, calc(100vw - 2rem));
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.7rem;
    background: rgba(15, 23, 42, 0.99);
    padding: 1rem;
    display: grid;
    gap: 0.65rem;
  }

  .dialog h3 {
    margin: 0;
    font-size: 1rem;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .canvas {
    position: relative;
    width: 2200px;
    height: 1200px;
  }

  .edge-layer {
    position: absolute;
    inset: 0;
    width: 2200px;
    height: 1200px;
    pointer-events: none;
  }

  .edge-layer line {
    stroke: rgba(148, 163, 184, 0.65);
    stroke-width: 1.5;
  }

  .node {
    position: absolute;
    width: 210px;
    min-height: 84px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 0.3rem;
    background: rgba(15, 23, 42, 0.96);
    user-select: none;
    touch-action: none;
  }

  .node strong {
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: #7dd3fc;
  }

  .node span {
    color: #dbeafe;
    font-size: 0.82rem;
    line-height: 1.3;
  }

  .node.active {
    border-color: #f97316;
    box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.3);
  }

  .node.match {
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.55);
  }

  .node.merge {
    border-color: #22c55e;
  }

  .node.pending {
    border-color: rgba(56, 189, 248, 0.75);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.45);
  }

  .node-loading {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: #bae6fd;
  }

  .node-loading em {
    font-style: normal;
  }

  .spinner {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 999px;
    border: 2px solid rgba(186, 230, 253, 0.35);
    border-top-color: #38bdf8;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .merge-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.65rem;
    border: 1px solid rgba(34, 197, 94, 0.5);
    border-radius: 0.45rem;
    background: rgba(21, 128, 61, 0.2);
  }

  .action-list {
    display: grid;
    gap: 0.5rem;
  }

  .action {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }

  .action span {
    color: #94a3b8;
    font-size: 0.8rem;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .toggle-row input {
    width: auto;
    margin: 0;
  }

  .muted {
    color: #94a3b8;
  }

  .status {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    max-width: 420px;
    border-radius: 0.5rem;
    padding: 0.65rem 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.45);
    backdrop-filter: blur(6px);
  }

  .status.toast {
    background: rgba(8, 47, 73, 0.86);
  }

  .status.error {
    background: rgba(127, 29, 29, 0.88);
    border-color: rgba(254, 202, 202, 0.6);
    bottom: 4rem;
  }

  @media (max-width: 1200px) {
    .shell-body {
      flex-direction: column;
      gap: 0.8rem;
      overflow: auto;
    }

    .sidebar,
    .canvas-panel {
      width: auto;
      flex: 0 0 auto;
      border-radius: 0.75rem;
    }

    .sidebar {
      max-height: 46vh;
    }

    .panel-resizer {
      display: none;
    }

    .canvas {
      width: 1700px;
      height: 1100px;
    }

    .edge-layer {
      width: 1700px;
      height: 1100px;
    }
  }
</style>
