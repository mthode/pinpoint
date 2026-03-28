import { Router, Request, Response } from 'express';
import { AIProvider, AIMessage } from '../services/ai-provider';
import { OllamaProvider } from '../services/ollama-provider';
import { OllamaNetworkProvider } from '../services/ollama-network-provider';
import { CopilotCliProvider } from '../services/copilot-cli-provider';
import {
  getActionByName,
  getActionsForTrigger,
  getAutoActionsForBubbleType,
  getBrainstormConfigSummary,
} from '../services/brainstorm-config';
import { executeBrainstormAction, ExecutionContextInput } from '../services/brainstorm-engine';
import {
  appendBubblesToGraph,
  createGraph,
  exportGraph,
  getGraphHistoryStatus,
  getGraph,
  getOrCreateGraph,
  importGraph,
  listGraphSummaries,
  redoGraph,
  setSelectedNode,
  undoGraph,
  updateGraphMetadata,
  updateNodePosition,
} from '../services/brainstorm-graph-store';

const router = Router();

const providers: AIProvider[] = [
  new OllamaProvider(),
  new OllamaNetworkProvider(),
  new CopilotCliProvider(),
];

function getProvider(name: string): AIProvider | undefined {
  return providers.find((p) => p.name === name);
}

interface GraphLikeNode {
  id: string;
  type: string;
  content: string;
}

interface GraphLikeEdge {
  from: string;
  to: string;
}

function collectAncestorChain(nodes: GraphLikeNode[], edges: GraphLikeEdge[], nodeId: string): GraphLikeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (!parentOf.has(edge.to)) {
      parentOf.set(edge.to, edge.from);
    }
  }

  const result: GraphLikeNode[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = nodeId;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node = byId.get(cursor);
    if (!node) {
      break;
    }
    result.push(node);
    cursor = parentOf.get(cursor);
  }

  return result.reverse();
}

function buildExecutionContextFromGraph(
  graph: { nodes: GraphLikeNode[]; edges: GraphLikeEdge[] },
  parentNodeId: string,
): ExecutionContextInput {
  const parent = graph.nodes.find((node) => node.id === parentNodeId);
  const chain = collectAncestorChain(graph.nodes, graph.edges, parentNodeId);

  const branchPath = chain.map((node) => `${node.type}: ${node.content}`).join('\n');
  const contexts = chain.filter((node) => node.type === 'context').map((node) => node.content);
  const constraints = chain.filter((node) => node.type === 'constraint').map((node) => node.content);
  const assumptions = chain.filter((node) => node.type === 'assumption').map((node) => node.content);
  const criteria = chain.filter((node) => node.type === 'criterion').map((node) => node.content);

  return {
    parent: { content: parent?.content ?? '(none)' },
    branch: {
      path: branchPath || '(none)',
      summary: chain.length
        ? `Branch depth ${chain.length} ending at ${parent?.type ?? 'unknown'}`
        : 'Branch is empty',
    },
    ancestors: {
      context: contexts,
      constraints,
      assumptions,
      criteria,
    },
    siblings: { content: [] },
    selected: { content: [] },
    comparison: { content: '' },
  };
}

router.get('/providers', async (_req: Request, res: Response) => {
  const results = await Promise.all(
    providers.map(async (p) => ({
      name: p.name,
      available: await p.isAvailable(),
    }))
  );
  res.json(results);
});

router.get('/models', async (req: Request, res: Response) => {
  const providerName = (req.query.provider as string) || 'ollama';
  const provider = getProvider(providerName);
  if (!provider) {
    res.status(404).json({ error: `Provider '${providerName}' not found` });
    return;
  }
  try {
    const models = await provider.listModels();
    res.json({ provider: providerName, models });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.post('/chat', async (req: Request, res: Response) => {
  const { messages, model, provider: providerName } = req.body as {
    messages: AIMessage[];
    model: string;
    provider: string;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }
  if (!model || typeof model !== 'string') {
    res.status(400).json({ error: 'model is required' });
    return;
  }
  if (!providerName || typeof providerName !== 'string') {
    res.status(400).json({ error: 'provider is required' });
    return;
  }

  const provider = getProvider(providerName);
  if (!provider) {
    res.status(404).json({ error: `Provider '${providerName}' not found` });
    return;
  }

  try {
    const response = await provider.chat(messages, model);
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/brainstorm/config', (_req: Request, res: Response) => {
  try {
    const summary = getBrainstormConfigSummary();
    res.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/brainstorm/actions', (req: Request, res: Response) => {
  const trigger = req.query.trigger as string;

  if (!trigger || typeof trigger !== 'string') {
    res.status(400).json({ error: 'trigger query parameter is required' });
    return;
  }

  try {
    const actions = getActionsForTrigger(trigger);
    res.json({ trigger, actions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/brainstorm/actions/:name', (req: Request, res: Response) => {
  try {
    const action = getActionByName(req.params.name);
    if (!action) {
      res.status(404).json({ error: `Action '${req.params.name}' not found` });
      return;
    }
    res.json(action);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

router.get('/brainstorm/graphs', (_req: Request, res: Response) => {
  res.json({ graphs: listGraphSummaries() });
});

router.post('/brainstorm/graphs', (req: Request, res: Response) => {
  const { graphId } = req.body as { graphId?: string };
  const graph = createGraph(graphId);
  res.status(201).json({
    ...graph,
    history: getGraphHistoryStatus(graph.id),
  });
});

router.get('/brainstorm/graphs/:graphId', (req: Request, res: Response) => {
  const graph = getGraph(req.params.graphId);
  if (!graph) {
    res.status(404).json({ error: `Graph '${req.params.graphId}' not found` });
    return;
  }
  res.json({
    ...graph,
    history: getGraphHistoryStatus(graph.id),
  });
});

router.get('/brainstorm/graphs/:graphId/export', (req: Request, res: Response) => {
  try {
    const graph = exportGraph(req.params.graphId);
    res.json({ graph });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: message });
  }
});

router.post('/brainstorm/graphs/import', (req: Request, res: Response) => {
  const { graph, graphId } = req.body as { graph?: unknown; graphId?: string };

  if (!graph || typeof graph !== 'object') {
    res.status(400).json({ error: 'graph object is required' });
    return;
  }

  try {
    const imported = importGraph(graph as Record<string, unknown>, graphId);
    res.status(201).json({
      ...imported,
      history: getGraphHistoryStatus(imported.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.post('/brainstorm/graphs/:graphId/select', (req: Request, res: Response) => {
  const { nodeId } = req.body as { nodeId?: string };
  if (!nodeId || typeof nodeId !== 'string') {
    res.status(400).json({ error: 'nodeId is required' });
    return;
  }
  try {
    const graph = setSelectedNode(req.params.graphId, nodeId);
    res.json({
      ...graph,
      history: getGraphHistoryStatus(graph.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: message });
  }
});

router.patch('/brainstorm/graphs/:graphId/meta', (req: Request, res: Response) => {
  const { name, bookmarked } = req.body as { name?: string; bookmarked?: boolean };

  if (typeof name === 'undefined' && typeof bookmarked === 'undefined') {
    res.status(400).json({ error: 'name or bookmarked must be provided' });
    return;
  }

  try {
    const graph = updateGraphMetadata(req.params.graphId, { name, bookmarked });
    res.json({
      ...graph,
      history: getGraphHistoryStatus(graph.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: message });
  }
});

router.patch('/brainstorm/graphs/:graphId/nodes/:nodeId/position', (req: Request, res: Response) => {
  const { x, y } = req.body as { x?: number; y?: number };
  if (typeof x !== 'number' || typeof y !== 'number') {
    res.status(400).json({ error: 'x and y numeric coordinates are required' });
    return;
  }

  try {
    const graph = updateNodePosition(req.params.graphId, req.params.nodeId, { x, y });
    res.json({
      ...graph,
      history: getGraphHistoryStatus(graph.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: message });
  }
});

router.post('/brainstorm/graphs/:graphId/undo', (req: Request, res: Response) => {
  try {
    const graph = undoGraph(req.params.graphId);
    res.json({
      ...graph,
      history: getGraphHistoryStatus(graph.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(409).json({ error: message });
  }
});

router.post('/brainstorm/graphs/:graphId/redo', (req: Request, res: Response) => {
  try {
    const graph = redoGraph(req.params.graphId);
    res.json({
      ...graph,
      history: getGraphHistoryStatus(graph.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(409).json({ error: message });
  }
});

router.post('/brainstorm/execute', async (req: Request, res: Response) => {
  const {
    action: actionName,
    context,
    userInput,
    provider,
    model,
    graphId,
    parentNodeId,
    parentNodeIds,
    applyAutoActions,
  } = req.body as {
    action?: string;
    context?: ExecutionContextInput;
    userInput?: string;
    provider?: string;
    model?: string;
    graphId?: string;
    parentNodeId?: string;
    parentNodeIds?: string[];
    applyAutoActions?: boolean;
  };

  if (!actionName || typeof actionName !== 'string') {
    res.status(400).json({ error: 'action is required' });
    return;
  }

  if (!context || typeof context !== 'object') {
    res.status(400).json({ error: 'context object is required' });
    return;
  }

  try {
    const action = getActionByName(actionName);
    if (!action) {
      res.status(404).json({ error: `Action '${actionName}' not found` });
      return;
    }

    const result = await executeBrainstormAction(
      {
        action,
        context,
        userInput,
        providerOverride: provider,
        modelOverride: model,
      },
      getProvider,
    );

    const targetGraphId = graphId && graphId.trim() ? graphId : 'default';
    const graph = getOrCreateGraph(targetGraphId);
    const resolvedParentIds = Array.isArray(parentNodeIds) && parentNodeIds.length > 0
      ? parentNodeIds
      : parentNodeId
        ? [parentNodeId]
        : [graph.selectedNodeId || graph.rootNodeId];

    const graphResult = appendBubblesToGraph({
      graphId: targetGraphId,
      parentNodeIds: resolvedParentIds,
      bubbles: result.bubbles,
      actor: result.actor,
      mode: action.branching,
      outputMode: action.output_mode,
    });

    const autoExecutions: Array<{
      action: string;
      parentNodeId: string;
      createdNodeIds: string[];
      bubbleCount: number;
    }> = [];

    const shouldRunAutoActions = applyAutoActions !== false;
    const maxAutoActions = 8;

    if (shouldRunAutoActions) {
      let autoCount = 0;
      for (let i = 0; i < result.bubbles.length; i += 1) {
        if (autoCount >= maxAutoActions) {
          break;
        }

        const explicitBubble = result.bubbles[i];
        const sourceNodeId = graphResult.createdNodeIds[i];
        if (!sourceNodeId) {
          continue;
        }

        const autoActions = getAutoActionsForBubbleType(explicitBubble.type).filter(
          (autoAction) => autoAction.actor !== 'user',
        );

        for (const autoAction of autoActions) {
          if (autoCount >= maxAutoActions) {
            break;
          }

          const contextFromGraph = buildExecutionContextFromGraph(graphResult.graph, sourceNodeId);
          const autoResult = await executeBrainstormAction(
            {
              action: autoAction,
              context: contextFromGraph,
              providerOverride: provider,
              modelOverride: model,
            },
            getProvider,
          );

          const inserted = appendBubblesToGraph({
            graphId: targetGraphId,
            parentNodeIds: [sourceNodeId],
            bubbles: autoResult.bubbles,
            actor: autoResult.actor,
            mode: autoAction.branching,
            outputMode: autoAction.output_mode,
          });

          autoExecutions.push({
            action: autoAction.name,
            parentNodeId: sourceNodeId,
            createdNodeIds: inserted.createdNodeIds,
            bubbleCount: autoResult.bubbles.length,
          });
          autoCount += 1;
        }
      }
    }

    const finalGraph = getOrCreateGraph(targetGraphId);

    res.json({
      ...result,
      graphId: targetGraphId,
      parentNodeIds: resolvedParentIds,
      createdNodeIds: graphResult.createdNodeIds,
      selectedNodeId: finalGraph.selectedNodeId,
      autoExecutions,
      history: getGraphHistoryStatus(finalGraph.id),
      graphStats: {
        nodeCount: finalGraph.nodes.length,
        edgeCount: finalGraph.edges.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;
