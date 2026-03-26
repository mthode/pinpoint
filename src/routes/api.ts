import { Router, Request, Response } from 'express';
import { AIProvider, AIMessage } from '../services/ai-provider';
import { OllamaProvider } from '../services/ollama-provider';

const router = Router();

const providers: AIProvider[] = [new OllamaProvider()];

function getProvider(name: string): AIProvider | undefined {
  return providers.find((p) => p.name === name);
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

export default router;
