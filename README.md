# POC-001 — Portkey Demo Branch

This branch is the dedicated **Portkey Gateway** version of the Atto proxy demo.

## Branch Map

| Branch | Mode | Stack |
|---|---|---|
| `demo/cloudflare` | Cloudflare Worker | Next.js + Claude Agent SDK + Cloudflare Worker |
| `demo/portkey` | Portkey Gateway | Next.js + Claude Agent SDK + Portkey |
| `demo/litellm-local` | LiteLLM Local | Streamlit + FastAPI + LiteLLM |

You are currently on `demo/portkey`.

## What This Mode Demonstrates

- the app keeps a Claude-compatible SDK contract
- Portkey acts as the managed gateway instead of a self-hosted worker
- provider routing is controlled through `pk:provider/model` naming
- Portkey virtual keys and gateway observability can be part of the demo story

## Architecture

```text
Browser
  -> Next.js /api/generate
    -> Claude Agent SDK
      -> queryCastari fetch interceptor
        -> local /api/portkey route
          -> Portkey Gateway
            -> Anthropic / OpenAI / Google
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
- `PORTKEY_API_KEY`

Provider credentials used behind Portkey:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`

Demo pin:

- `NEXT_PUBLIC_ATTO_DEMO_MODE=portkey`

## Documentation

- app guide: [castari-proxy/claude-agent-demo/README.md](./castari-proxy/claude-agent-demo/README.md)
- Cloudflare variant: switch to `demo/cloudflare`
- LiteLLM local variant: switch to `demo/litellm-local`

## Validation Notes

This branch linted successfully locally. A full `next build` in this environment is blocked by Google Font fetches from `next/font`, not by the Portkey branch logic itself.
