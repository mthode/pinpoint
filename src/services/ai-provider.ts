export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
}

export interface AIProvider {
  name: string;
  listModels(): Promise<string[]>;
  chat(messages: AIMessage[], model: string): Promise<AIResponse>;
  isAvailable(): Promise<boolean>;
}
