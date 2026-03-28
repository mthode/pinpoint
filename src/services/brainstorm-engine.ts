import { AIMessage, AIProvider } from './ai-provider';
import { ActionDefinition, getAgentByName } from './brainstorm-config';

interface BranchInput {
  path?: string;
  summary?: string;
}

interface AncestorsInput {
  context?: string[];
  constraints?: string[];
  assumptions?: string[];
  criteria?: string[];
}

interface ContentListInput {
  content?: string[];
}

interface ParentInput {
  content?: string;
}

export interface ExecutionContextInput {
  parent?: ParentInput;
  branch?: BranchInput;
  ancestors?: AncestorsInput;
  siblings?: ContentListInput;
  selected?: ContentListInput;
  comparison?: ParentInput;
}

export interface ExecuteActionInput {
  action: ActionDefinition;
  context: ExecutionContextInput;
  userInput?: string;
  providerOverride?: string;
  modelOverride?: string;
}

export interface GeneratedBubble {
  type: string;
  content: string;
}

export interface ExecuteActionResult {
  action: string;
  actor: string;
  provider?: string;
  model?: string;
  renderedPrompt?: string;
  bubbles: GeneratedBubble[];
}

function splitList(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0);
}

function toJoinedText(value?: string[]): string {
  if (!value || value.length === 0) {
    return '(none)';
  }
  return value.join('\n');
}

function resolveTemplateValue(variable: string, context: ExecutionContextInput): string {
  switch (variable) {
    case 'parent.content':
      return context.parent?.content ?? '(none)';
    case 'ancestors.context':
      return toJoinedText(context.ancestors?.context);
    case 'ancestors.constraints':
      return toJoinedText(context.ancestors?.constraints);
    case 'ancestors.assumptions':
      return toJoinedText(context.ancestors?.assumptions);
    case 'ancestors.criteria':
      return toJoinedText(context.ancestors?.criteria);
    case 'branch.path':
      return context.branch?.path ?? '(none)';
    case 'branch.summary':
      return context.branch?.summary ?? '(none)';
    case 'siblings.content':
      return toJoinedText(context.siblings?.content);
    case 'selected.content':
      return toJoinedText(context.selected?.content);
    case 'comparison.content':
      return context.comparison?.content ?? '(none)';
    default:
      return `(unknown variable: ${variable})`;
  }
}

export function renderPromptTemplate(template: string, context: ExecutionContextInput): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => {
    return resolveTemplateValue(key, context);
  });
}

function parseDefaultModel(modelSpec: string): { provider: string; model: string } {
  const [provider, ...modelParts] = modelSpec.split('/');
  if (!provider || modelParts.length === 0) {
    throw new Error(`Invalid default_model format: '${modelSpec}'. Expected '<provider>/<model>'`);
  }
  return {
    provider,
    model: modelParts.join('/'),
  };
}

function buildBubblesFromContent(action: ActionDefinition, content: string): GeneratedBubble[] {
  if (action.output_mode === 'chain' || action.branching === 'fork_multiple') {
    const parts = splitList(content);
    if (parts.length > 0) {
      return parts.map((item) => ({ type: action.output, content: item }));
    }
  }

  return [{ type: action.output, content: content.trim() }];
}

export async function executeBrainstormAction(
  input: ExecuteActionInput,
  providerResolver: (name: string) => AIProvider | undefined,
): Promise<ExecuteActionResult> {
  const { action, context, userInput } = input;

  if (action.actor === 'user') {
    if (!userInput || userInput.trim() === '') {
      throw new Error(`Action '${action.name}' requires user input`);
    }
    return {
      action: action.name,
      actor: 'user',
      bubbles: [{ type: action.output, content: userInput.trim() }],
    };
  }

  const agent = getAgentByName(action.actor);
  if (!agent) {
    throw new Error(`Unknown agent '${action.actor}' for action '${action.name}'`);
  }

  const promptTemplate = action.prompt_template ?? '{{parent.content}}';
  const renderedPrompt = renderPromptTemplate(promptTemplate, context);

  const fallback = parseDefaultModel(agent.default_model);
  const providerName = input.providerOverride || fallback.provider;
  const model = input.modelOverride || fallback.model;

  const provider = providerResolver(providerName);
  if (!provider) {
    throw new Error(`Provider '${providerName}' not found`);
  }

  const messages: AIMessage[] = [
    { role: 'system', content: agent.system_prompt },
    { role: 'user', content: renderedPrompt },
  ];

  const response = await provider.chat(messages, model);

  return {
    action: action.name,
    actor: action.actor,
    provider: response.provider,
    model: response.model,
    renderedPrompt,
    bubbles: buildBubblesFromContent(action, response.content),
  };
}
