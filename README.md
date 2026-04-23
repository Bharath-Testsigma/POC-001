# POC-001 — Cloudflare Demo Branch

This branch is the dedicated **Cloudflare Worker** version of the Atto proxy demo.

## Branch Map

| Branch | Mode | Stack |
|---|---|---|
| `demo/cloudflare` | Cloudflare Worker | Next.js + Claude Agent SDK + Cloudflare Worker |
| `demo/portkey` | Portkey Gateway | Next.js + Claude Agent SDK + Portkey |
| `demo/litellm-local` | LiteLLM Local | Streamlit + FastAPI + LiteLLM |

You are currently on `demo/cloudflare`.

## What This Mode Demonstrates

- the app keeps a Claude-compatible request shape
- `queryCastari` intercepts SDK traffic and routes it to your own worker
- the Cloudflare Worker translates between Anthropic format and provider-specific APIs
- the UI can switch between Claude, OpenRouter, Gemini, OpenAI, and Ollama paths without changing orchestration code

## Architecture

```text
Browser
  -> Next.js /api/generate
    -> Claude Agent SDK
      -> queryCastari fetch interceptor
        -> Cloudflare Worker
          -> Anthropic / OpenRouter / Gemini / OpenAI / Ollama
```

## Quick Start

```bash
git clone https://github.com/Bharath-Testsigma/POC-001.git
cd POC-001/castari-proxy/claude-agent-demo
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Required Configuration

Core values:

- `ANTHROPIC_API_KEY`
- `CASTARI_WORKER_URL`

Optional provider routes:

- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

Demo pin:

- `NEXT_PUBLIC_ATTO_DEMO_MODE=cloudflare`

## Cloudflare Worker Deployment

```bash
cd ../worker
npm install
npx wrangler login
npx wrangler deploy
```

After deploy, put the worker URL into `CASTARI_WORKER_URL`.

## Documentation

- app guide: [castari-proxy/claude-agent-demo/README.md](./castari-proxy/claude-agent-demo/README.md)
- worker source: [castari-proxy/worker](./castari-proxy/worker)
- local LiteLLM variant: switch to `demo/litellm-local`
- Portkey variant: switch to `demo/portkey`

## Validation Notes

This branch linted successfully locally. A full `next build` in this environment is blocked by Google Font fetches from `next/font`, not by the Cloudflare branch logic itself.
