# Pinpoint

A graphical TypeScript chat application hosted by Node.js that uses AI tools via CLI integrations. The initial AI provider is [Ollama](https://ollama.ai), with an extensible architecture for adding more providers later.

## Features

- 🤖 **AI provider abstraction** — clean interface for plugging in any CLI-based AI tool
- 🦙 **Ollama integration** — chat with locally-hosted LLMs via the `ollama` CLI
- 💬 **Graphical web UI** — dark-themed chat interface served by Express
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

## Project Structure

```
src/
├── server.ts                # Express server entry point
├── routes/
│   └── api.ts               # REST API routes
├── services/
│   ├── ai-provider.ts       # AIProvider interface (extend to add new providers)
│   └── ollama-provider.ts   # Ollama CLI implementation
└── public/
    ├── index.html           # Chat UI
    ├── styles.css           # Styles
    └── app.js               # Frontend JavaScript
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
