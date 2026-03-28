import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface AgentDefinition {
  description: string;
  default_model: string;
  system_prompt: string;
}

export interface ActionDefinition {
  name: string;
  description: string;
  trigger: string[];
  actor: string;
  output: string;
  prompt_template?: string;
  branching?: 'pause' | 'linear' | 'fork' | 'fork_multiple' | 'merge';
  input?: string;
  output_mode?: 'chain';
}

export interface BrainstormConfig {
  agents: Record<string, AgentDefinition>;
  actions: ActionDefinition[];
  auto_actions?: Record<string, string[]>;
}

export interface ConfigAgentSummary {
  name: string;
  description: string;
  defaultModel: string;
}

export interface ConfigSummary {
  agents: ConfigAgentSummary[];
  actionCount: number;
  triggers: string[];
  outputs: string[];
  autoActions: Record<string, string[]>;
}

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'bubble-actions.yaml');

let cachedConfig: BrainstormConfig | null = null;
let cachedMtimeMs = 0;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseConfig(raw: unknown): BrainstormConfig {
  if (!isObject(raw)) {
    throw new Error('Invalid brainstorm config: expected a YAML object at root');
  }

  const agents = raw.agents;
  const actions = raw.actions;

  if (!isObject(agents)) {
    throw new Error('Invalid brainstorm config: "agents" must be an object');
  }

  if (!Array.isArray(actions)) {
    throw new Error('Invalid brainstorm config: "actions" must be an array');
  }

  const normalizedActions: ActionDefinition[] = actions.map((action, index) => {
    if (!isObject(action)) {
      throw new Error(`Invalid action at index ${index}: expected object`);
    }
    if (typeof action.name !== 'string' || action.name.trim() === '') {
      throw new Error(`Invalid action at index ${index}: "name" is required`);
    }
    if (!Array.isArray(action.trigger) || action.trigger.some((t) => typeof t !== 'string')) {
      throw new Error(`Invalid action "${action.name}": "trigger" must be a string array`);
    }
    if (typeof action.actor !== 'string' || action.actor.trim() === '') {
      throw new Error(`Invalid action "${action.name}": "actor" is required`);
    }
    if (typeof action.output !== 'string' || action.output.trim() === '') {
      throw new Error(`Invalid action "${action.name}": "output" is required`);
    }

    return {
      name: action.name,
      description: typeof action.description === 'string' ? action.description : '',
      trigger: action.trigger,
      actor: action.actor,
      output: action.output,
      prompt_template: typeof action.prompt_template === 'string' ? action.prompt_template : undefined,
      branching: action.branching as ActionDefinition['branching'],
      input: typeof action.input === 'string' ? action.input : undefined,
      output_mode: action.output_mode as ActionDefinition['output_mode'],
    };
  });

  const normalizedAgents: Record<string, AgentDefinition> = {};
  for (const [name, value] of Object.entries(agents)) {
    if (!isObject(value)) {
      throw new Error(`Invalid agent "${name}": expected object`);
    }
    if (typeof value.description !== 'string' || value.description.trim() === '') {
      throw new Error(`Invalid agent "${name}": "description" is required`);
    }
    if (typeof value.default_model !== 'string' || value.default_model.trim() === '') {
      throw new Error(`Invalid agent "${name}": "default_model" is required`);
    }
    if (typeof value.system_prompt !== 'string' || value.system_prompt.trim() === '') {
      throw new Error(`Invalid agent "${name}": "system_prompt" is required`);
    }

    normalizedAgents[name] = {
      description: value.description,
      default_model: value.default_model,
      system_prompt: value.system_prompt,
    };
  }

  const autoActionsRaw = raw.auto_actions;
  const autoActions: Record<string, string[]> = {};
  if (isObject(autoActionsRaw)) {
    for (const [key, value] of Object.entries(autoActionsRaw)) {
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        autoActions[key] = value;
      }
    }
  }

  return {
    agents: normalizedAgents,
    actions: normalizedActions,
    auto_actions: autoActions,
  };
}

export function loadBrainstormConfig(configPath = DEFAULT_CONFIG_PATH): BrainstormConfig {
  const stat = fs.statSync(configPath);
  if (cachedConfig && stat.mtimeMs === cachedMtimeMs) {
    return cachedConfig;
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const parsed = yaml.load(content);
  const config = parseConfig(parsed);

  cachedConfig = config;
  cachedMtimeMs = stat.mtimeMs;

  return config;
}

export function getBrainstormConfigSummary(configPath = DEFAULT_CONFIG_PATH): ConfigSummary {
  const config = loadBrainstormConfig(configPath);
  const triggers = new Set<string>();
  const outputs = new Set<string>();

  for (const action of config.actions) {
    action.trigger.forEach((t) => triggers.add(t));
    outputs.add(action.output);
  }

  return {
    agents: Object.entries(config.agents).map(([name, agent]) => ({
      name,
      description: agent.description,
      defaultModel: agent.default_model,
    })),
    actionCount: config.actions.length,
    triggers: Array.from(triggers).sort(),
    outputs: Array.from(outputs).sort(),
    autoActions: config.auto_actions ?? {},
  };
}

export function getActionsForTrigger(trigger: string, configPath = DEFAULT_CONFIG_PATH): ActionDefinition[] {
  const config = loadBrainstormConfig(configPath);
  return config.actions.filter((action) => action.trigger.includes(trigger));
}

export function getActionByName(name: string, configPath = DEFAULT_CONFIG_PATH): ActionDefinition | undefined {
  const config = loadBrainstormConfig(configPath);
  return config.actions.find((action) => action.name === name);
}

export function getAgentByName(name: string, configPath = DEFAULT_CONFIG_PATH): AgentDefinition | undefined {
  const config = loadBrainstormConfig(configPath);
  return config.agents[name];
}

export function getAutoActionsForBubbleType(
  bubbleType: string,
  configPath = DEFAULT_CONFIG_PATH,
): ActionDefinition[] {
  const config = loadBrainstormConfig(configPath);
  const actionNames = config.auto_actions?.[bubbleType] ?? [];
  const byName = new Map(config.actions.map((action) => [action.name, action]));

  return actionNames
    .map((name) => byName.get(name))
    .filter((action): action is ActionDefinition => Boolean(action));
}
