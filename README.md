# Pinpoint

A graphical TypeScript brainstorming application hosted by Node.js with a Svelte client and AI tools via CLI integrations. The initial AI provider is [Ollama](https://ollama.ai), with an extensible architecture for adding more providers later.

## Features

- 🤖 **AI provider abstraction** — clean interface for plugging in any CLI-based AI tool
- 🦙 **Ollama integration** — chat with locally-hosted LLMs via the `ollama` CLI
- 💬 **Svelte web UI** — client-rendered brainstorming interface served by Express
- 🔌 **REST API** — `/api/providers`, `/api/models`, `/api/chat`
- 🛡️ **Rate limiting** — built-in request throttling

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Ollama](https://ollama.ai) installed and running locally

## Getting Started

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the server
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### Development mode (no build step)

```bash
npm run dev
```

### Client development mode

```bash
# Terminal 1: API/server
npm run dev

# Terminal 2: Svelte client
npm run dev:client
```

## Project Structure

```
src/
├── server.ts                # Express server entry point
├── client/                  # Svelte frontend app
├── routes/
│   └── api.ts               # REST API routes
├── services/
│   ├── ai-provider.ts       # AIProvider interface (extend to add new providers)
│   └── ollama-provider.ts   # Ollama CLI implementation
└── shared/                  # Shared server/client graph types
tests/
├── routes/api.test.ts
└── services/ollama-provider.test.ts
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/providers` | List providers and their availability |
| `GET` | `/api/models?provider=ollama` | List models for a provider |
| `POST` | `/api/chat` | Send a chat message |

### POST /api/chat

```json
{
  "messages": [{ "role": "user", "content": "Hello!" }],
  "model": "llama2:latest",
  "provider": "ollama"
}
```

## Adding a New AI Provider

1. Create `src/services/my-provider.ts` implementing the `AIProvider` interface from `ai-provider.ts`
2. Register it in `src/routes/api.ts` by adding it to the `providers` array

## Running Tests

```bash
npm test
```
