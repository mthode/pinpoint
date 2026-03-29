(function () {
  'use strict';

  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const triggerSelect = document.getElementById('trigger-select');
  const actionList = document.getElementById('action-list');
  const autoActionsToggle = document.getElementById('auto-actions-toggle');
  const brainstormSummary = document.getElementById('brainstorm-summary');
  const refreshActionsButton = document.getElementById('refresh-actions');
  const graphSummary = document.getElementById('graph-summary');
  const graphDetail = document.getElementById('graph-detail');
  const graphListSelect = document.getElementById('graph-list-select');
  const graphListFilter = document.getElementById('graph-list-filter');
  const createGraphButton = document.getElementById('create-graph');
  const graphNameInput = document.getElementById('graph-name-input');
  const graphSearchInput = document.getElementById('graph-search-input');
  const graphSearchNextButton = document.getElementById('graph-search-next');
  const graphSearchStatus = document.getElementById('graph-search-status');
  const zoomOutButton = document.getElementById('zoom-out');
  const zoomInButton = document.getElementById('zoom-in');
  const zoomResetButton = document.getElementById('zoom-reset');
  const zoomLabel = document.getElementById('zoom-label');
  const undoGraphButton = document.getElementById('undo-graph');
  const redoGraphButton = document.getElementById('redo-graph');
  const exportGraphButton = document.getElementById('export-graph');
  const importGraphButton = document.getElementById('import-graph');
  const importGraphFileInput = document.getElementById('import-graph-file');
  const bookmarkGraphButton = document.getElementById('bookmark-graph');
  const graphNodes = document.getElementById('graph-nodes');
  const graphEdges = document.getElementById('graph-edges');
  const graphCanvas = document.getElementById('graph-canvas');
  const nodePopup = document.getElementById('node-popup');
  const refreshGraphButton = document.getElementById('refresh-graph');
  const configGearButton = document.getElementById('config-gear');
  const configDrawer = document.getElementById('config-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const toastContainer = document.getElementById('toast-container');
  /** @type {HTMLElement|null} */
  let mergePanel = null;
  /** @type {string[]} */
  let availableTriggers = [];
  let graphId = 'default';
  let graphName = 'default';
  let graphBookmarked = false;
  let graphHistory = { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 };
  let graphZoom = 1;
  let graphSearchQuery = '';
  /** @type {string[]} */
  let graphSearchMatches = [];
  let graphSearchCursor = -1;
  let pendingFocusNodeId = '';
  let currentGraphSnapshot = null;
  let suppressNodeClickUntil = 0;
  let isCanvasPanning = false;
  /** @type {HTMLElement|null} */
  let activeDraftNode = null;
  let draftResolve = null;
  let selectedNodeId = '';
  let selectedEdgeKey = '';
  const selectedNodeIdsForMerge = new Set();
  const expandedNodeIds = new Set();
  const actionCacheByTrigger = new Map();
  let optimisticRootNodeSequence = 0;
  /** @type {{id: string; type: string; content: string}[]} */
  let graphNodeCache = [];
  /** @type {{from: string; to: string}[]} */
  let graphEdgeCache = [];
  /** @type {Array<{id: string; name: string; bookmarked: boolean; createdAt: string; updatedAt: string; nodeCount: number}>} */
  let graphSummaryCache = [];

  async function loadModels() {
    const provider = providerSelect.value;
    modelSelect.innerHTML = '<option value="">Loading...</option>';
    modelSelect.disabled = true;
    try {
      const res = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load models');
      modelSelect.innerHTML = '';
      if (data.models && data.models.length > 0) {
        data.models.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          modelSelect.appendChild(opt);
        });
      } else {
        modelSelect.innerHTML = '<option value="">No models found</option>';
      }
    } catch (err) {
      modelSelect.innerHTML = '<option value="">Error loading models</option>';
      showError(err.message || 'Could not load models');
    } finally {
      modelSelect.disabled = false;
    }
  }

  async function loadBrainstormConfig() {
    triggerSelect.disabled = true;
    brainstormSummary.textContent = 'Loading brainstorm configuration...';

    try {
      const res = await fetch('/api/brainstorm/config');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load brainstorm config');

      availableTriggers = Array.isArray(data.triggers) ? data.triggers : [];
      renderTriggerOptions();

      const agentCount = Array.isArray(data.agents) ? data.agents.length : 0;
      const actionCount = typeof data.actionCount === 'number' ? data.actionCount : 0;
      const autoState = autoActionsToggle.checked ? 'auto-actions on' : 'auto-actions off';
      brainstormSummary.textContent = `${agentCount} agents · ${actionCount} actions loaded · ${autoState}`;

      await loadActionsForCurrentTrigger();
    } catch (err) {
      brainstormSummary.textContent = 'Could not load brainstorm configuration';
      actionList.innerHTML = '';
      showError(err.message || 'Failed to load brainstorm config');
    } finally {
      triggerSelect.disabled = false;
    }
  }

  function renderTriggerOptions() {
    const preferredOrder = [
      'question',
      'request',
      'clarification',
      'answer',
      'step',
      'response',
      'assumption',
      'constraint',
      'context',
      'criterion',
      'comparison',
      'synthesis',
      'root',
    ];

    const rank = new Map(preferredOrder.map((key, index) => [key, index]));
    const sorted = [...availableTriggers].sort((a, b) => {
      const aRank = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
      const bRank = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.localeCompare(b);
    });

    const previousSelection = triggerSelect.value;
    triggerSelect.innerHTML = '';

    if (sorted.length === 0) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No triggers available';
      triggerSelect.appendChild(empty);
      return;
    }

    sorted.forEach((trigger) => {
      const option = document.createElement('option');
      option.value = trigger;
      option.textContent = trigger;
      triggerSelect.appendChild(option);
    });

    if (sorted.includes(previousSelection)) {
      triggerSelect.value = previousSelection;
    }
  }

  async function loadActionsForCurrentTrigger() {
    const trigger = triggerSelect.value;
    if (!trigger) {
      actionList.innerHTML = '';
      return;
    }

    actionList.innerHTML = '<span class="brainstorm-summary">Loading actions...</span>';

    try {
      const res = await fetch(`/api/brainstorm/actions?trigger=${encodeURIComponent(trigger)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load actions');

      const actions = Array.isArray(data.actions) ? data.actions : [];
      actionCacheByTrigger.set(trigger, actions);
      refreshActionPanelForMode();
    } catch (err) {
      actionList.innerHTML = '';
      showError(err.message || 'Failed to load actions');
    }
  }

  function renderActions(actions) {
    actionList.innerHTML = '';

    if (!actions.length) {
      const empty = document.createElement('div');
      empty.className = 'brainstorm-summary';
      empty.textContent = 'No actions are available for this bubble type.';
      actionList.appendChild(empty);
      return;
    }

    actions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-item';

      const actor = action.actor || 'agent';
      const output = action.output || 'bubble';
      button.textContent = `${action.name} (${actor} -> ${output})`;
      button.title = action.description || action.name;

      button.addEventListener('click', () => {
        executeAction(action).catch((err) => {
          showError(err.message || `Failed to execute action '${action.name}'`);
        });
      });

      actionList.appendChild(button);
    });
  }

  function isMergeCapableAction(action) {
    return action.branching === 'merge' || action.input === 'selected_branches';
  }

  function refreshActionPanelForMode() {
    const trigger = triggerSelect.value;
    const actions = actionCacheByTrigger.get(trigger) || [];
    const mergeMode = selectedNodeIdsForMerge.size >= 2;

    if (!mergeMode) {
      renderActions(actions);
      return;
    }

    const mergeActions = actions.filter(isMergeCapableAction);
    if (!mergeActions.length) {
      actionList.innerHTML = '';
      const info = document.createElement('div');
      info.className = 'brainstorm-summary';
      info.textContent = 'Merge mode active: this bubble type has no merge-capable actions.';
      actionList.appendChild(info);
      return;
    }

    renderActions(mergeActions);
  }

  function buildExecutionContext(options = {}) {
    const asRoot = Boolean(options.asRoot);
    const selectedNode = asRoot
      ? null
      : graphNodeCache.find((n) => n.id === selectedNodeId);
    const selectedContent = asRoot
      ? []
      : graphNodeCache
        .filter((n) => selectedNodeIdsForMerge.has(n.id))
        .map((n) => n.content);
    const parentContent = selectedNode
      ? selectedNode.content
      : '';

    const branchPath = selectedNode
      ? buildPathToNode(
          selectedNode.id,
          graphEdgeCache,
          new Map(graphNodeCache.map((n) => [n.id, n])),
        )
      : [];
    const branchSummary = branchPath.length
      ? branchPath.map((n) => `${n.type}: ${n.content}`).join('\n')
      : '';

    return {
      parent: { content: parentContent },
      branch: {
        path: branchSummary,
        summary: branchPath.length
          ? `Branch has ${branchPath.length} node(s)`
          : 'No branch selected',
      },
      ancestors: {
        context: [],
        constraints: [],
        assumptions: [],
        criteria: [],
      },
      siblings: { content: [] },
      selected: { content: selectedContent },
      comparison: { content: '' },
    };
  }

  function buildHydrationBaseGraph() {
    return currentGraphSnapshot || {
      id: graphId,
      name: graphName,
      bookmarked: graphBookmarked,
      history: graphHistory,
      rootNodeId: currentGraphSnapshot?.rootNodeId || '',
      selectedNodeId,
      nodes: graphNodeCache,
      edges: graphEdgeCache,
    };
  }

  function updateGraphSummary(graph) {
    const nodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
    const edgeCount = Array.isArray(graph?.edges) ? graph.edges.length : 0;
    graphSummary.textContent = `Graph: ${graph?.id || graphId} · Nodes: ${nodeCount} · Edges: ${edgeCount} · Selected: ${selectedNodeId || 'none'}`;
  }

  function applyGraphState(graph) {
    currentGraphSnapshot = graph;
    graphId = graph.id || graphId;
    graphName = graph.name || graphId;
    graphBookmarked = Boolean(graph.bookmarked);
    graphHistory = graph.history || { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 };
    selectedNodeId = graph.selectedNodeId || graph.rootNodeId || selectedNodeId;
    graphNodeCache = Array.isArray(graph.nodes) ? graph.nodes : [];
    graphEdgeCache = Array.isArray(graph.edges) ? graph.edges : [];
    recomputeGraphSearchMatches();
    updateMergeSummary();
    refreshActionPanelForMode();
    graphNameInput.value = graphName;
    bookmarkGraphButton.textContent = graphBookmarked ? 'Unbookmark' : 'Bookmark';
    undoGraphButton.disabled = !graphHistory.canUndo;
    redoGraphButton.disabled = !graphHistory.canRedo;
    zoomLabel.textContent = `${Math.round(graphZoom * 100)}%`;
    updateGraphSummary(graph);
  }

  function applyGraphStateWithoutRender(graph, options = {}) {
    const normalizedGraph = normalizeHydratedGraph(graph, options);
    applyGraphState(normalizedGraph);
    return normalizedGraph;
  }

  function getPendingOptimisticRootNodes() {
    return Array.isArray(graphNodeCache)
      ? graphNodeCache.filter((node) => (
        node
        && isPendingNode(node)
        && typeof node.id === 'string'
        && node.id.startsWith('optimistic-root-')
      ))
      : [];
  }

  function getCurrentLayoutPositions() {
    if (!currentGraphSnapshot || !Array.isArray(currentGraphSnapshot.nodes) || !currentGraphSnapshot.nodes.length) {
      return new Map();
    }

    return new Map(
      buildGraphLayout(currentGraphSnapshot, 1).nodes.map((node) => [
        node.id,
        { x: Math.round(node.baseX), y: Math.round(node.baseY) },
      ]),
    );
  }

  function normalizeHydratedGraph(graph, options = {}) {
    if (!graph || typeof graph !== 'object') {
      return graph;
    }

    const pendingOptimisticRoots = options.preservePendingOptimisticRoots === false
      ? []
      : getPendingOptimisticRootNodes();
    const incomingNodeIds = new Set(
      Array.isArray(graph.nodes)
        ? graph.nodes
          .filter((node) => node && typeof node.id === 'string')
          .map((node) => node.id)
        : [],
    );
    const currentLayoutPositions = getCurrentLayoutPositions();
    const nodes = Array.isArray(graph.nodes)
      ? graph.nodes.map((node) => {
        if (!node || typeof node !== 'object') {
          return node;
        }
        if (typeof node.position?.x === 'number' && typeof node.position?.y === 'number') {
          return node;
        }
        const currentPosition = currentLayoutPositions.get(node.id);
        return currentPosition ? { ...node, position: currentPosition } : node;
      })
      : [];

    pendingOptimisticRoots.forEach((node) => {
      if (!incomingNodeIds.has(node.id)) {
        nodes.push(node);
      }
    });

    const edges = Array.isArray(graph.edges) ? [...graph.edges] : [];

    return {
      ...graph,
      nodes,
      edges,
    };
  }

  function createOptimisticRootNodeId() {
    optimisticRootNodeSequence += 1;
    return `optimistic-root-${Date.now().toString(36)}-${optimisticRootNodeSequence}`;
  }

  function renderOptimisticRootNode(nodeId, type, content, position, options = {}) {
    if (!nodeId || graphNodeCache.some((node) => node.id === nodeId)) {
      return;
    }

    const optimisticNode = {
      id: nodeId,
      type,
      content,
      actor: 'user',
      createdAt: new Date().toISOString(),
      pending: Boolean(options.pending),
      ...(position ? { position: { x: Math.round(position.x), y: Math.round(position.y) } } : {}),
    };
    const baseGraph = buildHydrationBaseGraph();

    if (options.focus !== false) {
      pendingFocusNodeId = nodeId;
    }
    hydrateGraphState({
      ...baseGraph,
      id: graphId,
      name: graphName,
      bookmarked: graphBookmarked,
      history: graphHistory,
      selectedNodeId: nodeId,
      nodes: [...(Array.isArray(baseGraph.nodes) ? baseGraph.nodes : []), optimisticNode],
      edges: Array.isArray(baseGraph.edges) ? [...baseGraph.edges] : [],
    });
  }

  function renderGraphNodeIntoElement(element, node, graph, position) {
    if (!element || !node) {
      return;
    }

    const searchMatchSet = new Set(graphSearchMatches);
    const activeSearchNodeId = graphSearchMatches[graphSearchCursor] || '';
    const inheritedFramingByNode = buildInheritedFramingIndex(graph);
    const framing = inheritedFramingByNode.get(node.id);
    const isPending = isPendingNode(node);
    const isActive = node.id === selectedNodeId;
    const isMultiSelected = selectedNodeIdsForMerge.has(node.id);
    const isSearchMatch = searchMatchSet.has(node.id);
    const isSearchActive = node.id === activeSearchNodeId;
    const isSearchDim = Boolean(graphSearchQuery) && !isSearchMatch;
    const isExpanded = expandedNodeIds.has(node.id);

    element.className = `graph-node${isPending ? ' pending' : ''}${isActive ? ' active' : ''}${isMultiSelected ? ' multi-selected' : ''}${isSearchMatch ? ' search-match' : ''}${isSearchActive ? ' search-active' : ''}${isSearchDim ? ' search-dim' : ''}${isExpanded ? ' expanded' : ''}`;
    element.title = node.content;
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
    element.style.transform = `scale(${graphZoom})`;
    element.style.transformOrigin = 'top left';
    element.innerHTML = '';

    const type = document.createElement('div');
    type.className = 'graph-node-type';
    type.textContent = node.type;

    const content = document.createElement('div');
    content.className = 'graph-node-content';
    content.textContent = node.content;

    const badges = document.createElement('div');
    badges.className = 'graph-node-badges';
    if (framing) {
      const badgeSpecs = [
        { key: 'context', label: 'Ctx', values: framing.context },
        { key: 'constraint', label: 'Con', values: framing.constraint },
        { key: 'assumption', label: 'Asm', values: framing.assumption },
        { key: 'criterion', label: 'Cri', values: framing.criterion },
      ];

      badgeSpecs.forEach((spec) => {
        if (!spec.values.length) {
          return;
        }
        const badge = document.createElement('span');
        badge.className = `graph-badge ${spec.key}`;
        badge.textContent = `${spec.label} ${spec.values.length}`;
        badge.title = spec.values.join('\n');
        badges.appendChild(badge);
      });
    }

    const actionsRow = document.createElement('div');
    actionsRow.className = 'graph-node-actions';

    const openActions = document.createElement('button');
    openActions.type = 'button';
    openActions.className = 'mini-button';
    openActions.textContent = 'Actions';
    openActions.disabled = isPending;
    openActions.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (isPending) {
        return;
      }
      await handleNodeSelection(node, false);
    });

    const multiSelect = document.createElement('button');
    multiSelect.type = 'button';
    multiSelect.className = 'mini-button';
    multiSelect.textContent = isMultiSelected ? 'Unselect' : 'Select';
    multiSelect.disabled = isPending;
    multiSelect.addEventListener('click', (event) => {
      event.stopPropagation();
      if (isPending) {
        return;
      }
      toggleNodeMultiSelection(node.id);
      renderGraph(graph);
    });

    const expandToggle = document.createElement('button');
    expandToggle.type = 'button';
    expandToggle.className = 'mini-button';
    expandToggle.textContent = expandedNodeIds.has(node.id) ? '⤡' : '⤢';
    expandToggle.title = expandedNodeIds.has(node.id) ? 'Collapse' : 'Expand';
    expandToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (expandedNodeIds.has(node.id)) {
        expandedNodeIds.delete(node.id);
      } else {
        expandedNodeIds.add(node.id);
      }
      renderGraph(graph);
    });

    actionsRow.appendChild(expandToggle);
    actionsRow.appendChild(openActions);
    actionsRow.appendChild(multiSelect);

    element.appendChild(type);
    element.appendChild(content);
    if (badges.children.length > 0) {
      element.appendChild(badges);
    }
    element.appendChild(actionsRow);

    element.onclick = async () => {
      if (Date.now() < suppressNodeClickUntil || isPending) {
        return;
      }
      await handleNodeSelection(node, true);
    };

    element.onpointerdown = (event) => {
      beginNodeDrag(event, node);
    };
  }

  function renderDraftRootNodeInPlace(element, node, position) {
    const baseGraph = buildHydrationBaseGraph();
    const nextGraph = {
      ...baseGraph,
      id: graphId,
      name: graphName,
      bookmarked: graphBookmarked,
      history: graphHistory,
      selectedNodeId: node.id,
      nodes: [...(Array.isArray(baseGraph.nodes) ? baseGraph.nodes : []), node],
      edges: Array.isArray(baseGraph.edges) ? [...baseGraph.edges] : [],
    };
    const appliedGraph = applyGraphStateWithoutRender(nextGraph);
    renderGraphNodeIntoElement(element, node, appliedGraph, position);
  }

  function finalizeDraftRootNodeInPlace(element, nodeId, options = {}) {
    if (!nodeId) {
      return null;
    }

    const baseGraph = buildHydrationBaseGraph();
    const nextNodeId = typeof options.nextNodeId === 'string' && options.nextNodeId.trim()
      ? options.nextNodeId.trim()
      : nodeId;
    const nodes = Array.isArray(baseGraph.nodes)
      ? baseGraph.nodes.reduce((acc, node) => {
        if (!node) {
          acc.push(node);
          return acc;
        }
        if (node.id === nextNodeId && nextNodeId !== nodeId) {
          return acc;
        }
        if (node.id !== nodeId) {
          acc.push(node);
          return acc;
        }
        acc.push({
          ...node,
          id: nextNodeId,
          pending: false,
        });
        return acc;
      }, [])
      : [];
    const edges = Array.isArray(baseGraph.edges)
      ? baseGraph.edges.map((edge) => ({
        ...edge,
        from: edge.from === nodeId ? nextNodeId : edge.from,
        to: edge.to === nodeId ? nextNodeId : edge.to,
      }))
      : [];
    const nextSelectedNodeId = typeof options.selectedNodeId === 'string' && options.selectedNodeId.trim()
      ? options.selectedNodeId.trim()
      : nextNodeId;
    const nextGraph = {
      ...baseGraph,
      id: graphId,
      name: graphName,
      bookmarked: graphBookmarked,
      history: options.history || graphHistory,
      selectedNodeId: nextSelectedNodeId,
      nodes,
      edges,
    };
    const appliedGraph = applyGraphStateWithoutRender(nextGraph, { preservePendingOptimisticRoots: false });
    const finalizedNode = Array.isArray(appliedGraph.nodes)
      ? appliedGraph.nodes.find((node) => node && node.id === nextNodeId)
      : null;
    if (element && finalizedNode) {
      const currentLeft = parseInt(element.style.left, 10) || 0;
      const currentTop = parseInt(element.style.top, 10) || 0;
      renderGraphNodeIntoElement(element, finalizedNode, appliedGraph, { x: currentLeft, y: currentTop });
    }
    return finalizedNode;
  }

  function removeOptimisticRootNode(nodeId, fallbackSelectedNodeId) {
    if (!nodeId) {
      return;
    }

    const baseGraph = buildHydrationBaseGraph();
    const nodes = Array.isArray(baseGraph.nodes)
      ? baseGraph.nodes.filter((node) => node.id !== nodeId)
      : [];
    const nextSelectedNodeId = baseGraph.selectedNodeId === nodeId
      ? (fallbackSelectedNodeId || baseGraph.rootNodeId || '')
      : baseGraph.selectedNodeId;

    hydrateGraphState({
      ...baseGraph,
      id: graphId,
      name: graphName,
      bookmarked: graphBookmarked,
      history: graphHistory,
      selectedNodeId: nextSelectedNodeId,
      nodes,
      edges: Array.isArray(baseGraph.edges) ? [...baseGraph.edges] : [],
    }, { preservePendingOptimisticRoots: false });
  }

  function finalizeOptimisticRootNode(nodeId, options = {}) {
    if (!nodeId) {
      return;
    }

    const baseGraph = buildHydrationBaseGraph();
    const nextNodeId = typeof options.nextNodeId === 'string' && options.nextNodeId.trim()
      ? options.nextNodeId.trim()
      : nodeId;
    const nodes = Array.isArray(baseGraph.nodes)
      ? baseGraph.nodes.reduce((acc, node) => {
        if (!node) {
          acc.push(node);
          return acc;
        }
        if (node.id === nextNodeId && nextNodeId !== nodeId) {
          return acc;
        }
        if (node.id !== nodeId) {
          acc.push(node);
          return acc;
        }
        acc.push({
          ...node,
          id: nextNodeId,
          pending: false,
        });
        return acc;
      }, [])
      : [];
    const edges = Array.isArray(baseGraph.edges)
      ? baseGraph.edges.map((edge) => ({
        ...edge,
        from: edge.from === nodeId ? nextNodeId : edge.from,
        to: edge.to === nodeId ? nextNodeId : edge.to,
      }))
      : [];
    const nextSelectedNodeId = typeof options.selectedNodeId === 'string' && options.selectedNodeId.trim()
      ? options.selectedNodeId.trim()
      : nextNodeId;

    hydrateGraphState({
      ...baseGraph,
      id: graphId,
      name: graphName,
      bookmarked: graphBookmarked,
      history: options.history || graphHistory,
      selectedNodeId: nextSelectedNodeId,
      nodes,
      edges,
    }, { preservePendingOptimisticRoots: false });
  }

  function isPendingNode(node) {
    return Boolean(node && node.pending);
  }

  function createDraftNode(canvasX, canvasY, options) {
    removeDraftNode();

    const types = options.types || ['question', 'request', 'context', 'constraint', 'assumption', 'criterion'];
    const defaultType = options.defaultType || types[0];
    const hint = options.hint || 'Enter to confirm · Escape to cancel';
    const parentNodeId = options.parentNodeId || null;

    const el = document.createElement('div');
    el.className = 'graph-node draft';
    el.style.left = `${canvasX}px`;
    el.style.top = `${canvasY}px`;
    el.style.transform = `scale(${graphZoom})`;
    el.style.transformOrigin = 'top left';
    el.dataset.parentNodeId = parentNodeId || '';

    const picker = document.createElement('div');
    picker.className = 'draft-type-picker';
    const typeSelect = document.createElement('select');
    types.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      if (t === defaultType) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    picker.appendChild(typeSelect);

    const textarea = document.createElement('textarea');
    textarea.className = 'draft-textarea';
    textarea.placeholder = options.placeholder || 'Type your thought…';
    textarea.rows = 2;

    const actionsRow = document.createElement('div');
    actionsRow.className = 'draft-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'draft-confirm';
    confirmBtn.textContent = 'Confirm';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'draft-cancel';
    cancelBtn.textContent = 'Cancel';
    actionsRow.appendChild(confirmBtn);
    actionsRow.appendChild(cancelBtn);

    const hintEl = document.createElement('div');
    hintEl.className = 'draft-hint';
    hintEl.textContent = hint;

    el.appendChild(picker);
    el.appendChild(textarea);
    el.appendChild(actionsRow);
    el.appendChild(hintEl);

    // Prevent canvas pan when interacting with draft
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => e.stopPropagation());

    graphNodes.appendChild(el);
    activeDraftNode = el;
    textarea.focus();

    return new Promise((resolve) => {
      draftResolve = resolve;

      const confirm = () => {
        const text = textarea.value.trim();
        if (!text) {
          textarea.focus();
          return;
        }
        activeDraftNode = null;
        draftResolve = null;
        resolve({ text, type: typeSelect.value, parentNodeId, element: el });
      };

      const cancel = () => {
        cleanup();
        resolve(null);
      };

      const cleanup = () => {
        activeDraftNode = null;
        draftResolve = null;
        el.remove();
      };

      confirmBtn.addEventListener('click', confirm);
      cancelBtn.addEventListener('click', cancel);
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          confirm();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
    });
  }

  function removeDraftNode() {
    if (activeDraftNode) {
      activeDraftNode.remove();
      if (draftResolve) {
        draftResolve(null);
      }
      activeDraftNode = null;
      draftResolve = null;
    }
  }

  async function handleCanvasDblClick(event) {
    const target = event.target;
    if (target.closest && (target.closest('.graph-node') || target.closest('.draft'))) {
      return;
    }

    const rect = graphCanvas.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left + graphCanvas.scrollLeft);
    const canvasY = (event.clientY - rect.top + graphCanvas.scrollTop);

    const result = await createDraftNode(canvasX, canvasY, {
      types: ['question', 'request', 'context', 'constraint', 'assumption', 'criterion'],
      defaultType: 'question',
      placeholder: 'What would you like to explore?',
    });

    if (!result) return;

    const actionName = result.type === 'request' ? 'make_request' : 'ask_question';
    const draftNodeElement = result.element;
    const payload = {
      action: actionName,
      userInput: result.text,
      provider: providerSelect.value,
      model: modelSelect.value,
      applyAutoActions: autoActionsToggle.checked,
      graphId,
      createAsRoot: true,
      position: { x: canvasX / graphZoom, y: canvasY / graphZoom },
      clientNodeIds: [],
      context: buildExecutionContext({ asRoot: true }),
    };

    const previousSelectedNodeId = selectedNodeId;
    selectedNodeIdsForMerge.clear();
    dismissNodePopup();
    const optimisticRootNodeId = createOptimisticRootNodeId();
    let optimisticRootRemoved = false;
    const clearOptimisticRootNode = () => {
      if (optimisticRootRemoved) {
        return;
      }
      removeOptimisticRootNode(optimisticRootNodeId, previousSelectedNodeId);
      optimisticRootRemoved = true;
    };
    payload.clientNodeIds = [optimisticRootNodeId];
    renderDraftRootNodeInPlace(
      draftNodeElement,
      {
        id: optimisticRootNodeId,
        type: result.type,
        content: result.text,
        actor: 'user',
        createdAt: new Date().toISOString(),
        pending: true,
        ...(payload.position ? { position: { x: Math.round(payload.position.x), y: Math.round(payload.position.y) } } : {}),
      },
      { x: canvasX, y: canvasY },
    );

    let hasPendingAutoActions = false;
    let createdRootNodeId = '';
    let shouldReloadGraph = false;
    try {
      const res = await fetch('/api/brainstorm/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action execution failed');

      if (data.graphId) graphId = data.graphId;
      if (data.selectedNodeId) selectedNodeId = data.selectedNodeId;
      if (Array.isArray(data.createdNodeIds) && data.createdNodeIds.length > 0) {
        createdRootNodeId = data.createdNodeIds[0];
        finalizeDraftRootNodeInPlace(draftNodeElement, optimisticRootNodeId, {
          nextNodeId: createdRootNodeId,
          selectedNodeId: data.selectedNodeId || createdRootNodeId,
          history: data.history,
        });
        optimisticRootRemoved = true;
      } else {
        clearOptimisticRootNode();
        shouldReloadGraph = true;
      }
      hasPendingAutoActions = Boolean(data.pendingAutoActions);
    } catch (err) {
      clearOptimisticRootNode();
      showError(err.message || 'Failed to create bubble');
    } finally {
      if (shouldReloadGraph) {
        await loadGraph(createdRootNodeId, { skipFocus: true });
      } else {
        await loadGraphList();
      }
    }
    if (hasPendingAutoActions) {
      scheduleAutoActionReload();
    }
  }

  async function executeAction(action) {
    if (isMergeCapableAction(action) && selectedNodeIdsForMerge.size < 2) {
      showError(`Action '${action.name}' requires at least 2 selected nodes.`);
      return;
    }

    const isUserAction = action.actor === 'user';
    let userInput = '';

    if (isUserAction) {
      // Find anchor position for inline editor near the selected node
      const parentEl = selectedNodeId
        ? graphNodes.querySelector(`.graph-node.active`)
        : null;
      let draftX = 40, draftY = 40;
      if (parentEl) {
        draftX = parseInt(parentEl.style.left, 10) + 200 * graphZoom;
        draftY = parseInt(parentEl.style.top, 10);
      }

      const result = await createDraftNode(draftX, draftY, {
        types: [action.output || 'response'],
        defaultType: action.output || 'response',
        placeholder: `Input for '${action.name}'…`,
        hint: 'Enter to confirm · Escape to cancel',
        parentNodeId: selectedNodeId || null,
      });

      if (!result) return;
      userInput = result.text;
      if (!userInput) {
        showError(`Action '${action.name}' requires input.`);
        return;
      }
    }

    const payload = {
      action: action.name,
      userInput,
      provider: providerSelect.value,
      model: modelSelect.value,
      applyAutoActions: autoActionsToggle.checked,
      graphId,
      parentNodeId: selectedNodeId || undefined,
      parentNodeIds:
        action.branching === 'merge' || action.input === 'selected_branches'
          ? Array.from(selectedNodeIdsForMerge)
          : undefined,
      context: buildExecutionContext(),
    };

    let hasPendingAutoActions = false;
    let createdNodeId = '';
    const res = await fetch('/api/brainstorm/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    try {
      if (!res.ok) {
        throw new Error(data.error || 'Action execution failed');
      }

      if (data.graphId) {
        graphId = data.graphId;
      }
      if (data.selectedNodeId) {
        selectedNodeId = data.selectedNodeId;
      }
      if (Array.isArray(data.createdNodeIds) && data.createdNodeIds.length > 0) {
        createdNodeId = data.createdNodeIds[0];
        pendingFocusNodeId = createdNodeId;
      }
      hasPendingAutoActions = Boolean(data.pendingAutoActions);
    } finally {
      await loadGraph(createdNodeId);
    }
    if (hasPendingAutoActions) {
      scheduleAutoActionReload();
    }
  }

  let autoActionReloadTimer = null;
  function scheduleAutoActionReload() {
    if (autoActionReloadTimer) clearTimeout(autoActionReloadTimer);
    autoActionReloadTimer = setTimeout(async () => {
      autoActionReloadTimer = null;
      await loadGraph();
    }, 3000);
  }

  async function ensureGraph() {
    try {
      const getRes = await fetch(`/api/brainstorm/graphs/${encodeURIComponent(graphId)}`);
      if (getRes.ok) {
        const graph = await getRes.json();
        hydrateGraphState(graph);
        await loadGraphList();
        return;
      }

      const createRes = await fetch('/api/brainstorm/graphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphId }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        throw new Error(created.error || 'Failed to create graph');
      }
      hydrateGraphState(created);
      await loadGraphList();
    } catch (err) {
      showError(err.message || 'Failed to initialize graph');
    }
  }

  async function loadGraphList() {
    try {
      const res = await fetch('/api/brainstorm/graphs');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load graph list');
      }

      const graphs = Array.isArray(data.graphs) ? data.graphs : [];
      graphSummaryCache = [...graphs].sort((a, b) => {
        const bookmarkOrder = Number(Boolean(b.bookmarked)) - Number(Boolean(a.bookmarked));
        if (bookmarkOrder !== 0) {
          return bookmarkOrder;
        }
        const aTime = Date.parse(a.updatedAt || a.createdAt || '') || 0;
        const bTime = Date.parse(b.updatedAt || b.createdAt || '') || 0;
        return bTime - aTime;
      });

      renderGraphListOptions();
    } catch (err) {
      showError(err.message || 'Failed to load graph list');
    }
  }

  function renderGraphListOptions() {
    const filter = graphListFilter.value || 'all';
    let filtered = [...graphSummaryCache];

    if (filter === 'bookmarked') {
      filtered = filtered.filter((graph) => graph.bookmarked);
    } else if (filter === 'recent') {
      filtered = filtered.slice(0, 8);
    }

    graphListSelect.innerHTML = '';

    if (!filtered.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = filter === 'bookmarked' ? 'No bookmarked graphs' : 'No graphs';
      graphListSelect.appendChild(option);
      graphListSelect.disabled = true;
      return;
    }

    graphListSelect.disabled = false;
    filtered.forEach((graph) => {
      const option = document.createElement('option');
      option.value = graph.id;
      const bookmarkPrefix = graph.bookmarked ? '★ ' : '';
      const graphLabel = graph.name && graph.name.trim() ? graph.name : graph.id;
      const nodeCount = typeof graph.nodeCount === 'number' ? graph.nodeCount : 0;
      option.textContent = `${bookmarkPrefix}${graphLabel} (${nodeCount})`;
      graphListSelect.appendChild(option);
    });

    if (filtered.some((graph) => graph.id === graphId)) {
      graphListSelect.value = graphId;
    } else if (filtered.length > 0) {
      graphListSelect.value = filtered[0].id;
    }
  }

  async function createNewGraph() {
    const answer = window.prompt('New graph id (letters, numbers, - and _):', `graph-${Date.now().toString(36)}`);
    if (answer === null) {
      return;
    }
    const nextId = answer.trim();
    if (!nextId) {
      showError('Graph id is required');
      return;
    }

    const res = await fetch('/api/brainstorm/graphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graphId: nextId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create graph');
    }

    graphId = data.id || nextId;
    hydrateGraphState(data);
    await loadGraphList();
  }

  function hydrateGraphState(graph, options = {}) {
    const normalizedGraph = normalizeHydratedGraph(graph, options);
    applyGraphState(normalizedGraph);
    renderGraph(normalizedGraph);
  }

  function renderGraph(graph) {
    graphNodes.innerHTML = '';
    graphEdges.innerHTML = '';

    if (!graphNodeCache.length) {
      return;
    }

    const layout = buildGraphLayout(graph, graphZoom);
    const inheritedFramingByNode = buildInheritedFramingIndex(graph);
    const searchMatchSet = new Set(graphSearchMatches);
    const activeSearchNodeId = graphSearchMatches[graphSearchCursor] || '';
    graphNodes.style.width = `${layout.width}px`;
    graphNodes.style.height = `${layout.height}px`;
    graphEdges.style.width = `${layout.width}px`;
    graphEdges.style.height = `${layout.height}px`;
    graphEdges.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);

    layout.edgeLines.forEach((edge) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const midX = (edge.fromX + edge.toX) / 2;
      path.setAttribute(
        'd',
        `M ${edge.fromX} ${edge.fromY} C ${midX} ${edge.fromY}, ${midX} ${edge.toY}, ${edge.toX} ${edge.toY}`,
      );
      const edgeClass = `graph-edge${edge.isMerge ? ' merge' : ''}${selectedEdgeKey === edge.key ? ' active' : ''}`;
      const isSearchDim = graphSearchQuery && !searchMatchSet.has(edge.fromId) && !searchMatchSet.has(edge.toId);
      const edgeClassWithSearch = `${edgeClass}${isSearchDim ? ' search-dim' : ''}`;
      path.setAttribute('class', edgeClassWithSearch);
      path.dataset.key = edge.key;
      path.addEventListener('click', () => {
        selectedEdgeKey = edge.key;
        const detail = describeEdge(edge.fromId, edge.toId);
        graphDetail.textContent = detail;
        renderGraph(graph);
      });
      graphEdges.appendChild(path);
    });

    layout.nodes.forEach((node) => {
      const button = document.createElement('button');
      button.type = 'button';
      const isPending = isPendingNode(node);
      const isActive = node.id === selectedNodeId;
      const isMultiSelected = selectedNodeIdsForMerge.has(node.id);
      const isSearchMatch = searchMatchSet.has(node.id);
      const isSearchActive = node.id === activeSearchNodeId;
      const isSearchDim = Boolean(graphSearchQuery) && !isSearchMatch;
      const isExpanded = expandedNodeIds.has(node.id);
      button.className = `graph-node${isPending ? ' pending' : ''}${isActive ? ' active' : ''}${isMultiSelected ? ' multi-selected' : ''}${isSearchMatch ? ' search-match' : ''}${isSearchActive ? ' search-active' : ''}${isSearchDim ? ' search-dim' : ''}${isExpanded ? ' expanded' : ''}`;
      button.title = node.content;
      button.style.left = `${node.x}px`;
      button.style.top = `${node.y}px`;
      button.style.transform = `scale(${graphZoom})`;
      button.style.transformOrigin = 'top left';

      const type = document.createElement('div');
      type.className = 'graph-node-type';
      type.textContent = node.type;

      const content = document.createElement('div');
      content.className = 'graph-node-content';
      content.textContent = node.content;

      const badges = document.createElement('div');
      badges.className = 'graph-node-badges';

      const framing = inheritedFramingByNode.get(node.id);
      if (framing) {
        const badgeSpecs = [
          { key: 'context', label: 'Ctx', values: framing.context },
          { key: 'constraint', label: 'Con', values: framing.constraint },
          { key: 'assumption', label: 'Asm', values: framing.assumption },
          { key: 'criterion', label: 'Cri', values: framing.criterion },
        ];

        badgeSpecs.forEach((spec) => {
          if (!spec.values.length) {
            return;
          }
          const badge = document.createElement('span');
          badge.className = `graph-badge ${spec.key}`;
          badge.textContent = `${spec.label} ${spec.values.length}`;
          badge.title = spec.values.join('\n');
          badges.appendChild(badge);
        });
      }

      const actionsRow = document.createElement('div');
      actionsRow.className = 'graph-node-actions';

      const openActions = document.createElement('button');
      openActions.type = 'button';
      openActions.className = 'mini-button';
      openActions.textContent = 'Actions';
      openActions.disabled = isPending;
      openActions.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (isPending) {
          return;
        }
        await handleNodeSelection(node, false);
      });

      const multiSelect = document.createElement('button');
      multiSelect.type = 'button';
      multiSelect.className = 'mini-button';
      multiSelect.textContent = isMultiSelected ? 'Unselect' : 'Select';
      multiSelect.disabled = isPending;
      multiSelect.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isPending) {
          return;
        }
        toggleNodeMultiSelection(node.id);
        renderGraph(graph);
      });

      const expandToggle = document.createElement('button');
      expandToggle.type = 'button';
      expandToggle.className = 'mini-button';
      expandToggle.textContent = expandedNodeIds.has(node.id) ? '⤡' : '⤢';
      expandToggle.title = expandedNodeIds.has(node.id) ? 'Collapse' : 'Expand';
      expandToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (expandedNodeIds.has(node.id)) {
          expandedNodeIds.delete(node.id);
        } else {
          expandedNodeIds.add(node.id);
        }
        renderGraph(graph);
      });

      actionsRow.appendChild(expandToggle);
      actionsRow.appendChild(openActions);
      actionsRow.appendChild(multiSelect);

      button.appendChild(type);
      button.appendChild(content);
      if (badges.children.length > 0) {
        button.appendChild(badges);
      }
      button.appendChild(actionsRow);

      button.addEventListener('click', async () => {
        if (Date.now() < suppressNodeClickUntil || isPending) {
          return;
        }
        await handleNodeSelection(node, true);
      });

      button.addEventListener('pointerdown', (event) => {
        beginNodeDrag(event, node);
      });

      graphNodes.appendChild(button);
    });

    if (pendingFocusNodeId) {
      centerOnNode(layout, pendingFocusNodeId);
      pendingFocusNodeId = '';
    } else {
      centerOnNode(layout, selectedNodeId);
    }
  }

  function recomputeGraphSearchMatches() {
    const query = graphSearchQuery.trim().toLowerCase();
    if (!query) {
      graphSearchMatches = [];
      graphSearchCursor = -1;
      updateGraphSearchStatus();
      return;
    }

    graphSearchMatches = graphNodeCache
      .filter((node) => {
        const haystack = `${node.type} ${node.content}`.toLowerCase();
        return haystack.includes(query);
      })
      .map((node) => node.id);

    if (!graphSearchMatches.length) {
      graphSearchCursor = -1;
    } else if (graphSearchCursor < 0 || graphSearchCursor >= graphSearchMatches.length) {
      graphSearchCursor = 0;
    }

    updateGraphSearchStatus();
  }

  function updateGraphSearchStatus() {
    if (!graphSearchQuery.trim()) {
      graphSearchStatus.textContent = 'No search';
      return;
    }

    if (!graphSearchMatches.length) {
      graphSearchStatus.textContent = '0 matches';
      return;
    }

    graphSearchStatus.textContent = `${graphSearchCursor + 1}/${graphSearchMatches.length}`;
  }

  function focusNextSearchMatch() {
    if (!graphSearchMatches.length) {
      updateGraphSearchStatus();
      return;
    }

    graphSearchCursor = (graphSearchCursor + 1) % graphSearchMatches.length;
    pendingFocusNodeId = graphSearchMatches[graphSearchCursor];
    updateGraphSearchStatus();

    if (currentGraphSnapshot) {
      renderGraph(currentGraphSnapshot);
    }
  }

  function buildInheritedFramingIndex(graph) {
    const parentsByChild = new Map();
    graph.edges.forEach((edge) => {
      if (!parentsByChild.has(edge.to)) {
        parentsByChild.set(edge.to, []);
      }
      parentsByChild.get(edge.to).push(edge.from);
    });

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const cache = new Map();

    function collect(nodeId) {
      if (cache.has(nodeId)) {
        return cache.get(nodeId);
      }

      const inherited = {
        context: new Set(),
        constraint: new Set(),
        assumption: new Set(),
        criterion: new Set(),
      };

      const stack = [...(parentsByChild.get(nodeId) || [])];
      const visited = new Set();
      while (stack.length) {
        const currentId = stack.pop();
        if (!currentId || visited.has(currentId)) {
          continue;
        }
        visited.add(currentId);

        const node = byId.get(currentId);
        if (node) {
          if (node.type === 'context') inherited.context.add(node.content);
          if (node.type === 'constraint') inherited.constraint.add(node.content);
          if (node.type === 'assumption') inherited.assumption.add(node.content);
          if (node.type === 'criterion') inherited.criterion.add(node.content);
        }

        const parents = parentsByChild.get(currentId) || [];
        parents.forEach((parent) => stack.push(parent));
      }

      const normalized = {
        context: Array.from(inherited.context),
        constraint: Array.from(inherited.constraint),
        assumption: Array.from(inherited.assumption),
        criterion: Array.from(inherited.criterion),
      };
      cache.set(nodeId, normalized);
      return normalized;
    }

    const result = new Map();
    graph.nodes.forEach((node) => {
      result.set(node.id, collect(node.id));
    });

    return result;
  }

  function describeEdge(fromId, toId) {
    const byId = new Map(graphNodeCache.map((node) => [node.id, node]));
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) {
      return 'Selected edge could not be resolved.';
    }

    const path = buildPathToNode(toId, graphEdgeCache, byId);
    const pathText = path.map((node) => `${node.type}`).join(' -> ');
    return `Edge: ${from.type} -> ${to.type} | Path: ${pathText}`;
  }

  function buildPathToNode(targetId, edges, byId) {
    const parentOf = new Map();
    edges.forEach((edge) => {
      if (!parentOf.has(edge.to)) {
        parentOf.set(edge.to, edge.from);
      }
    });

    const pathIds = [];
    let current = targetId;
    const visited = new Set();
    while (current && !visited.has(current)) {
      visited.add(current);
      pathIds.push(current);
      current = parentOf.get(current);
    }

    return pathIds
      .reverse()
      .map((id) => byId.get(id))
      .filter(Boolean);
  }

  function toggleNodeMultiSelection(nodeId) {
    if (selectedNodeIdsForMerge.has(nodeId)) {
      selectedNodeIdsForMerge.delete(nodeId);
    } else {
      selectedNodeIdsForMerge.add(nodeId);
    }
    updateMergeSummary();
  }

  function updateMergeSummary() {
    refreshActionPanelForMode();
    renderMergePanel();
  }

  function removeMergePanel() {
    if (mergePanel) {
      mergePanel.remove();
      mergePanel = null;
    }
  }

  function renderMergePanel() {
    removeMergePanel();

    const selectedNodes = graphNodeCache.filter((node) => selectedNodeIdsForMerge.has(node.id));
    if (selectedNodes.length < 2) {
      return;
    }

    // Compute centroid of selected nodes on canvas
    const layout = currentGraphSnapshot ? buildGraphLayout(currentGraphSnapshot, graphZoom) : null;
    let cx = 160, cy = 80;
    if (layout) {
      const matchedLayout = layout.nodes.filter((n) => selectedNodeIdsForMerge.has(n.id));
      if (matchedLayout.length) {
        cx = matchedLayout.reduce((s, n) => s + n.x, 0) / matchedLayout.length + 200 * graphZoom;
        cy = matchedLayout.reduce((s, n) => s + n.y, 0) / matchedLayout.length;
      }
    }

    const panel = document.createElement('div');
    panel.className = 'merge-panel';
    panel.style.left = `${cx}px`;
    panel.style.top = `${cy}px`;

    // Prevent canvas interactions
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.addEventListener('click', (e) => e.stopPropagation());

    const header = document.createElement('div');
    header.className = 'merge-panel-header';
    const title = document.createElement('span');
    title.className = 'merge-panel-title';
    title.textContent = `${selectedNodes.length} nodes selected for merge`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'node-popup-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      selectedNodeIdsForMerge.clear();
      updateMergeSummary();
      if (currentGraphSnapshot) renderGraph(currentGraphSnapshot);
    });
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const chips = document.createElement('div');
    chips.className = 'merge-panel-chips';
    selectedNodes.forEach((node) => {
      const chip = document.createElement('div');
      chip.className = 'merge-chip';
      const snippet = node.content.length > 100 ? `${node.content.slice(0, 100)}…` : node.content;
      chip.textContent = `${node.type}: ${snippet}`;
      chips.appendChild(chip);
    });
    panel.appendChild(chips);

    // Load merge-capable actions
    const trigger = triggerSelect.value || selectedNodes[0].type;
    let actions = actionCacheByTrigger.get(trigger) || [];
    const mergeActions = actions.filter(isMergeCapableAction);

    if (mergeActions.length) {
      const label = document.createElement('div');
      label.className = 'node-popup-section-label';
      label.textContent = 'Merge actions';
      panel.appendChild(label);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'merge-panel-actions';
      mergeActions.forEach((action) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'action-item';
        btn.textContent = action.name;
        btn.title = action.description || action.name;
        btn.addEventListener('click', () => {
          executeAction(action).catch((err) => {
            showError(err.message || `Failed to execute '${action.name}'`);
          });
        });
        actionsRow.appendChild(btn);
      });
      panel.appendChild(actionsRow);
    }

    graphNodes.appendChild(panel);
    mergePanel = panel;
  }

  async function handleNodeSelection(node, syncTrigger) {
    if (isPendingNode(node)) {
      return;
    }
    try {
      const res = await fetch(`/api/brainstorm/graphs/${encodeURIComponent(graphId)}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: node.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to select node');

      hydrateGraphState(data);
      if (syncTrigger && availableTriggers.includes(node.type)) {
        triggerSelect.value = node.type;
        await loadActionsForCurrentTrigger();
      }
      showNodePopup(node);
    } catch (err) {
      showError(err.message || 'Failed to select node');
    }
  }

  function dismissNodePopup() {
    nodePopup.classList.add('hidden');
    nodePopup.innerHTML = '';
  }

  async function showNodePopup(node) {
    // Load actions for this node type
    let actions = actionCacheByTrigger.get(node.type);
    if (!actions) {
      try {
        const res = await fetch(`/api/brainstorm/actions?trigger=${encodeURIComponent(node.type)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load node actions');
        actions = Array.isArray(data.actions) ? data.actions : [];
        actionCacheByTrigger.set(node.type, actions);
      } catch (err) {
        showError(err.message || 'Failed to load node actions');
        return;
      }
    }

    // Find node position on canvas
    const layout = currentGraphSnapshot ? buildGraphLayout(currentGraphSnapshot, graphZoom) : null;
    const layoutNode = layout ? layout.nodes.find((n) => n.id === node.id) : null;
    let popupX = 80, popupY = 80;
    if (layoutNode) {
      popupX = layoutNode.x + 270 * graphZoom;
      popupY = layoutNode.y;
    }

    nodePopup.innerHTML = '';
    nodePopup.classList.remove('hidden');
    nodePopup.style.left = `${popupX}px`;
    nodePopup.style.top = `${popupY}px`;

    // Prevent canvas interactions when clicking inside popup
    nodePopup.onpointerdown = (e) => e.stopPropagation();
    nodePopup.onclick = (e) => e.stopPropagation();

    // Header: type badge + close button
    const header = document.createElement('div');
    header.className = 'node-popup-header';
    const typeBadge = document.createElement('span');
    typeBadge.className = 'node-popup-type';
    typeBadge.textContent = node.type;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'node-popup-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', dismissNodePopup);
    header.appendChild(typeBadge);
    header.appendChild(closeBtn);
    nodePopup.appendChild(header);

    // Full content (scrollable)
    const contentEl = document.createElement('div');
    contentEl.className = 'node-popup-content';
    contentEl.textContent = node.content;
    nodePopup.appendChild(contentEl);

    // Merge select/unselect
    const isMultiSelected = selectedNodeIdsForMerge.has(node.id);
    const mergeRow = document.createElement('div');
    mergeRow.className = 'node-popup-merge-row';
    const mergeBtn = document.createElement('button');
    mergeBtn.type = 'button';
    mergeBtn.className = `node-popup-merge-btn${isMultiSelected ? ' active' : ''}`;
    mergeBtn.textContent = isMultiSelected ? '✓ Selected for merge' : 'Select for merge';
    mergeBtn.addEventListener('click', () => {
      toggleNodeMultiSelection(node.id);
      if (currentGraphSnapshot) renderGraph(currentGraphSnapshot);
      // Refresh popup to reflect new state
      showNodePopup(node);
    });
    const mergeStatus = document.createElement('span');
    mergeStatus.className = 'node-popup-merge-status';
    mergeStatus.textContent = selectedNodeIdsForMerge.size >= 2
      ? `${selectedNodeIdsForMerge.size} nodes in merge`
      : '';
    mergeRow.appendChild(mergeBtn);
    mergeRow.appendChild(mergeStatus);
    nodePopup.appendChild(mergeRow);

    // Actions
    const filteredActions = selectedNodeIdsForMerge.size >= 2
      ? actions.filter(isMergeCapableAction)
      : actions;

    if (filteredActions.length) {
      const label = document.createElement('div');
      label.className = 'node-popup-section-label';
      label.textContent = selectedNodeIdsForMerge.size >= 2 ? 'Merge actions' : 'Actions';
      nodePopup.appendChild(label);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'node-popup-actions';
      filteredActions.forEach((action) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'action-item';
        btn.textContent = action.name;
        btn.title = action.description || action.name;
        btn.addEventListener('click', () => {
          dismissNodePopup();
          executeAction(action).catch((err) => {
            showError(err.message || `Failed to execute '${action.name}'`);
          });
        });
        actionsRow.appendChild(btn);
      });
      nodePopup.appendChild(actionsRow);
    } else {
      const empty = document.createElement('div');
      empty.className = 'node-popup-section-label';
      empty.textContent = 'No actions available';
      nodePopup.appendChild(empty);
    }
  }

  function centerOnNode(layout, nodeId) {
    const selected = layout.nodes.find((n) => n.id === nodeId);
    if (!selected) return;

    const viewportWidth = graphCanvas.clientWidth;
    const viewportHeight = graphCanvas.clientHeight;
    const left = Math.max(0, selected.x - viewportWidth / 2 + (layout.nodeWidth * graphZoom) / 2);
    const top = Math.max(0, selected.y - viewportHeight / 2 + (layout.nodeHeight * graphZoom) / 2);

    graphCanvas.scrollTo({ left, top, behavior: 'smooth' });
  }

  function buildGraphLayout(graph, zoom) {
    const nodeWidth = 260;
    const nodeHeight = 110;
    const horizontalGap = 90;
    const verticalGap = 40;
    const padding = 20;

    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
    const childrenByParent = new Map();
    const hasParent = new Set();

    graph.edges.forEach((edge) => {
      if (!childrenByParent.has(edge.from)) {
        childrenByParent.set(edge.from, []);
      }
      childrenByParent.get(edge.from).push(edge.to);
      hasParent.add(edge.to);
    });

    const roots = graph.nodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id);
    const startRoots = roots.length ? roots : [graph.rootNodeId];

    const levels = new Map();
    const queue = startRoots.map((id) => ({ id, depth: 0 }));

    while (queue.length) {
      const current = queue.shift();
      if (!current || levels.has(current.id)) continue;
      levels.set(current.id, current.depth);

      const children = childrenByParent.get(current.id) || [];
      children.forEach((childId) => {
        queue.push({ id: childId, depth: current.depth + 1 });
      });
    }

    graph.nodes.forEach((node) => {
      if (!levels.has(node.id)) {
        levels.set(node.id, 0);
      }
    });

    const columns = new Map();
    levels.forEach((depth, id) => {
      if (!columns.has(depth)) {
        columns.set(depth, []);
      }
      columns.get(depth).push(id);
    });

    const layoutNodes = [];
    let maxRows = 0;
    const sortedDepths = Array.from(columns.keys()).sort((a, b) => a - b);

    sortedDepths.forEach((depth) => {
      const column = columns.get(depth);
      column.sort((a, b) => a.localeCompare(b));
      maxRows = Math.max(maxRows, column.length);

      column.forEach((id, index) => {
        const node = nodesById.get(id);
        if (!node) return;
        const baseX = typeof node.position?.x === 'number'
          ? node.position.x
          : padding + depth * (nodeWidth + horizontalGap);
        const baseY = typeof node.position?.y === 'number'
          ? node.position.y
          : padding + index * (nodeHeight + verticalGap);

        layoutNodes.push({
          id: node.id,
          type: node.type,
          content: node.content,
          pending: Boolean(node.pending),
          baseX,
          baseY,
          x: baseX * zoom,
          y: baseY * zoom,
          centerX: (baseX + nodeWidth / 2) * zoom,
          centerY: (baseY + nodeHeight / 2) * zoom,
        });
      });
    });

    const maxNodeRight = layoutNodes.reduce((m, n) => Math.max(m, n.x + nodeWidth * zoom), 0);
    const maxNodeBottom = layoutNodes.reduce((m, n) => Math.max(m, n.y + nodeHeight * zoom), 0);
    const width = Math.max(
      graphCanvas.clientWidth,
      (padding * 2 + (sortedDepths.length || 1) * nodeWidth + Math.max(0, sortedDepths.length - 1) * horizontalGap) * zoom,
      maxNodeRight + padding * zoom,
    );
    const height = Math.max(
      graphCanvas.clientHeight,
      (padding * 2 + maxRows * nodeHeight + Math.max(0, maxRows - 1) * verticalGap) * zoom,
      maxNodeBottom + padding * zoom,
    );

    const byId = new Map(layoutNodes.map((n) => [n.id, n]));
    const incomingCount = new Map();
    graph.edges.forEach((edge) => {
      incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
    });

    const edgeLines = graph.edges
      .map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        return {
          fromX: from.x + nodeWidth * zoom,
          fromY: from.centerY,
          toX: to.x,
          toY: to.centerY,
          fromId: edge.from,
          toId: edge.to,
          key: `${edge.from}->${edge.to}`,
          isMerge: (incomingCount.get(edge.to) || 0) > 1,
        };
      })
      .filter(Boolean);

    return {
      nodes: layoutNodes,
      edgeLines,
      width,
      height,
      nodeWidth,
      nodeHeight,
    };
  }

  async function loadGraph(expectedNodeId, options = {}) {
    try {
      const maxAttempts = expectedNodeId ? 5 : 1;
      let latestGraph = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const res = await fetch(`/api/brainstorm/graphs/${encodeURIComponent(graphId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load graph');
        latestGraph = data;

        const expectedNodeFound = !expectedNodeId
          || (Array.isArray(data.nodes) && data.nodes.some((node) => node.id === expectedNodeId));
        if (expectedNodeFound) {
          if (expectedNodeId) {
            data.selectedNodeId = expectedNodeId;
            if (!options.skipFocus) {
              pendingFocusNodeId = expectedNodeId;
            }
          }
          hydrateGraphState(data);
          await loadGraphList();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (latestGraph) {
        hydrateGraphState(latestGraph);
      }
      await loadGraphList();
    } catch (err) {
      showError(err.message || 'Failed to load graph');
    }
  }

  async function patchGraphMeta(updates) {
    const res = await fetch(`/api/brainstorm/graphs/${encodeURIComponent(graphId)}/meta`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update graph metadata');
    }
    hydrateGraphState(data);
    await loadGraphList();
  }

  async function patchNodePosition(nodeId, x, y) {
    const res = await fetch(`/api/brainstorm/graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update node position');
    }
    hydrateGraphState(data);
  }

  function beginNodeDrag(event, node) {
    if (event.button !== 0 || isPendingNode(node)) {
      return;
    }
    if (event.target && event.target.closest && event.target.closest('.mini-button')) {
      return;
    }

    const target = event.currentTarget;
    if (!target) {
      return;
    }

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = node.baseX;
    const startY = node.baseY;
    let moved = false;

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startClientX) / graphZoom;
      const dy = (moveEvent.clientY - startClientY) / graphZoom;
      const nextX = Math.max(0, startX + dx);
      const nextY = Math.max(0, startY + dy);
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        moved = true;
      }
      target.style.left = `${nextX * graphZoom}px`;
      target.style.top = `${nextY * graphZoom}px`;
    };

    const onUp = async (upEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      if (!moved) {
        return;
      }

      const dx = (upEvent.clientX - startClientX) / graphZoom;
      const dy = (upEvent.clientY - startClientY) / graphZoom;
      const nextX = Math.max(0, startX + dx);
      const nextY = Math.max(0, startY + dy);
      suppressNodeClickUntil = Date.now() + 250;

      try {
        await patchNodePosition(node.id, nextX, nextY);
      } catch (err) {
        showError(err.message || 'Failed to persist node position');
        if (currentGraphSnapshot) {
          renderGraph(currentGraphSnapshot);
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function adjustZoom(delta) {
    const next = Math.max(0.6, Math.min(2.2, graphZoom + delta));
    graphZoom = Math.round(next * 100) / 100;
    zoomLabel.textContent = `${Math.round(graphZoom * 100)}%`;
    if (currentGraphSnapshot) {
      renderGraph(currentGraphSnapshot);
    }
  }

  function setZoomAtPoint(nextZoom, anchorX, anchorY) {
    const clamped = Math.max(0.6, Math.min(2.2, nextZoom));
    const oldZoom = graphZoom;
    if (Math.abs(clamped - oldZoom) < 0.001) {
      return;
    }

    const contentX = (graphCanvas.scrollLeft + anchorX) / oldZoom;
    const contentY = (graphCanvas.scrollTop + anchorY) / oldZoom;

    graphZoom = Math.round(clamped * 100) / 100;
    zoomLabel.textContent = `${Math.round(graphZoom * 100)}%`;

    if (currentGraphSnapshot) {
      renderGraph(currentGraphSnapshot);
    }

    graphCanvas.scrollLeft = contentX * graphZoom - anchorX;
    graphCanvas.scrollTop = contentY * graphZoom - anchorY;
  }

  function beginCanvasPan(event) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (
      target.closest &&
      (target.closest('.graph-node') || target.closest('.mini-button') || target.closest('.action-item') || target.closest('.draft') || target.closest('.node-popup') || target.closest('.merge-panel'))
    ) {
      return;
    }

    // Click on empty canvas area dismisses popups
    dismissNodePopup();

    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = graphCanvas.scrollLeft;
    const startScrollTop = graphCanvas.scrollTop;

    isCanvasPanning = true;
    graphCanvas.classList.add('panning');

    const onMove = (moveEvent) => {
      if (!isCanvasPanning) {
        return;
      }
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      graphCanvas.scrollLeft = startScrollLeft - dx;
      graphCanvas.scrollTop = startScrollTop - dy;
    };

    const stopPan = () => {
      isCanvasPanning = false;
      graphCanvas.classList.remove('panning');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stopPan);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stopPan);
  }

  async function applyGraphHistoryAction(kind) {
    const res = await fetch(`/api/brainstorm/graphs/${encodeURIComponent(graphId)}/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Failed to ${kind}`);
    }
    hydrateGraphState(data);
  }

  async function exportCurrentGraph() {
    const res = await fetch(`/api/brainstorm/graphs/${encodeURIComponent(graphId)}/export`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to export graph');
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      graph: data.graph,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    const baseName = (graphName || graphId || 'graph').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    link.href = objectUrl;
    link.download = `${baseName || 'graph'}.json`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function importGraphFromFile(file) {
    if (!file) {
      return;
    }

    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Import file is not valid JSON');
    }

    const graphPayload = parsed && parsed.graph ? parsed.graph : parsed;

    const res = await fetch('/api/brainstorm/graphs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph: graphPayload }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to import graph');
    }

    hydrateGraphState(data);
    graphId = data.id || graphId;
    graphSummary.textContent = `Graph imported: ${graphId} · Nodes: ${data.nodes.length} · Edges: ${data.edges.length}`;
    await loadGraphList();
  }

  function showError(message) {
    const el = document.createElement('div');
    el.className = 'toast-message';
    el.textContent = '⚠️ ' + message;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  function isDrawerOpen() {
    return configDrawer.classList.contains('open');
  }

  function openConfigDrawer() {
    configDrawer.classList.add('open');
    drawerBackdrop.classList.add('visible');
  }

  function closeConfigDrawer() {
    configDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('visible');
  }

  function toggleConfigDrawer() {
    if (isDrawerOpen()) {
      closeConfigDrawer();
    } else {
      openConfigDrawer();
    }
  }

  function shouldHandleGlobalShortcut(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return true;
    }

    if (target === graphNameInput || target === graphSearchInput) {
      return false;
    }

    // Don't intercept shortcuts when typing in a draft bubble
    if (target.closest && target.closest('.draft')) {
      return false;
    }

    // Don't intercept shortcuts when interacting inside the config drawer
    if (target.closest && target.closest('.config-drawer')) {
      return false;
    }

    const tag = target.tagName.toLowerCase();
    return tag !== 'input' && tag !== 'textarea' && !target.isContentEditable;
  }

  async function clearGraphSelections() {
    selectedEdgeKey = '';
    selectedNodeIdsForMerge.clear();
    updateMergeSummary();
    dismissNodePopup();
    removeMergePanel();

    if (currentGraphSnapshot) {
      renderGraph(currentGraphSnapshot);
    }
  }

  async function handleGlobalShortcuts(event) {
    if (!shouldHandleGlobalShortcut(event)) {
      return;
    }

    const key = event.key;
    const lower = key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;

    if (key === 'Escape') {
      event.preventDefault();
      if (isDrawerOpen()) {
        closeConfigDrawer();
        return;
      }
      if (activeDraftNode) {
        removeDraftNode();
        return;
      }
      if (!nodePopup.classList.contains('hidden')) {
        dismissNodePopup();
        return;
      }
      await clearGraphSelections();
      return;
    }

    if (!mod) {
      return;
    }

    if (lower === 'f') {
      event.preventDefault();
      graphSearchInput.focus();
      graphSearchInput.select();
      return;
    }

    if (lower === 'z' && event.shiftKey) {
      event.preventDefault();
      if (!redoGraphButton.disabled) {
        try {
          await applyGraphHistoryAction('redo');
        } catch (err) {
          showError(err.message || 'Failed to redo');
        }
      }
      return;
    }

    if (lower === 'z') {
      event.preventDefault();
      if (!undoGraphButton.disabled) {
        try {
          await applyGraphHistoryAction('undo');
        } catch (err) {
          showError(err.message || 'Failed to undo');
        }
      }
      return;
    }

    if (key === '0') {
      event.preventDefault();
      graphZoom = 1;
      zoomLabel.textContent = '100%';
      if (currentGraphSnapshot) {
        renderGraph(currentGraphSnapshot);
      }
      return;
    }

    if (key === '=' || key === '+') {
      event.preventDefault();
      adjustZoom(0.1);
      return;
    }

    if (key === '-') {
      event.preventDefault();
      adjustZoom(-0.1);
    }
  }

  configGearButton.addEventListener('click', toggleConfigDrawer);
  drawerBackdrop.addEventListener('click', closeConfigDrawer);
  providerSelect.addEventListener('change', loadModels);
  triggerSelect.addEventListener('change', loadActionsForCurrentTrigger);
  refreshActionsButton.addEventListener('click', loadBrainstormConfig);
  autoActionsToggle.addEventListener('change', () => {
    const autoState = autoActionsToggle.checked ? 'auto-actions on' : 'auto-actions off';
    if (brainstormSummary.textContent && brainstormSummary.textContent.includes('agents')) {
      const base = brainstormSummary.textContent.split('·').slice(0, 2).join('·').trim();
      brainstormSummary.textContent = `${base} · ${autoState}`;
    }
  });
  refreshGraphButton.addEventListener('click', loadGraph);
  graphListFilter.addEventListener('change', () => {
    renderGraphListOptions();
  });
  graphListSelect.addEventListener('change', async () => {
    const nextId = graphListSelect.value;
    if (!nextId || nextId === graphId) {
      return;
    }
    graphId = nextId;
    await loadGraph();
  });
  createGraphButton.addEventListener('click', async () => {
    try {
      await createNewGraph();
    } catch (err) {
      showError(err.message || 'Failed to create graph');
    }
  });
  zoomOutButton.addEventListener('click', () => adjustZoom(-0.1));
  zoomInButton.addEventListener('click', () => adjustZoom(0.1));
  zoomResetButton.addEventListener('click', () => {
    graphZoom = 1;
    zoomLabel.textContent = '100%';
    if (currentGraphSnapshot) {
      renderGraph(currentGraphSnapshot);
    }
  });
  graphCanvas.addEventListener('pointerdown', beginCanvasPan);
  graphCanvas.addEventListener('dblclick', (event) => {
    handleCanvasDblClick(event).catch((err) => {
      showError(err.message || 'Failed to create draft node');
    });
  });
  graphCanvas.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();

    const rect = graphCanvas.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const zoomDelta = event.deltaY < 0 ? 0.1 : -0.1;
    setZoomAtPoint(graphZoom + zoomDelta, anchorX, anchorY);
  }, { passive: false });
  bookmarkGraphButton.addEventListener('click', async () => {
    try {
      await patchGraphMeta({ bookmarked: !graphBookmarked });
    } catch (err) {
      showError(err.message || 'Failed to toggle bookmark');
    }
  });
  undoGraphButton.addEventListener('click', async () => {
    try {
      await applyGraphHistoryAction('undo');
    } catch (err) {
      showError(err.message || 'Failed to undo');
    }
  });
  redoGraphButton.addEventListener('click', async () => {
    try {
      await applyGraphHistoryAction('redo');
    } catch (err) {
      showError(err.message || 'Failed to redo');
    }
  });
  exportGraphButton.addEventListener('click', async () => {
    try {
      await exportCurrentGraph();
    } catch (err) {
      showError(err.message || 'Failed to export graph');
    }
  });
  importGraphButton.addEventListener('click', () => {
    importGraphFileInput.click();
  });
  importGraphFileInput.addEventListener('change', async () => {
    try {
      const file = importGraphFileInput.files && importGraphFileInput.files[0];
      await importGraphFromFile(file);
    } catch (err) {
      showError(err.message || 'Failed to import graph');
    } finally {
      importGraphFileInput.value = '';
    }
  });
  graphNameInput.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    const nextName = graphNameInput.value.trim();
    if (!nextName || nextName === graphName) return;
    try {
      await patchGraphMeta({ name: nextName });
    } catch (err) {
      showError(err.message || 'Failed to rename graph');
    }
  });
  graphSearchInput.addEventListener('input', () => {
    graphSearchQuery = graphSearchInput.value;
    recomputeGraphSearchMatches();
    if (graphSearchMatches.length) {
      pendingFocusNodeId = graphSearchMatches[graphSearchCursor];
    }
    if (currentGraphSnapshot) {
      renderGraph(currentGraphSnapshot);
    }
  });
  graphSearchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    focusNextSearchMatch();
  });
  graphSearchNextButton.addEventListener('click', () => {
    focusNextSearchMatch();
  });
  window.addEventListener('keydown', (event) => {
    handleGlobalShortcuts(event).catch((err) => {
      showError(err.message || 'Shortcut failed');
    });
  });

  ensureGraph();
  loadModels();
  loadBrainstormConfig();
})();
