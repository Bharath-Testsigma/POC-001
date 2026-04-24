# POC-001 — Portkey Demo Branch

`demo/portkey` is now a Portkey-only branch. It keeps the Next.js app plus the local `castari-proxy/src` interceptor package, but removes the Cloudflare worker code and Cloudflare-only setup.

## Branch Map

| Branch | Purpose | Stack |
|---|---|---|
| `main` | local/self-hosted demo | Streamlit + FastAPI + LiteLLM |
| `demo/portkey` | managed gateway demo | Next.js + Claude Agent SDK + Portkey |
| `demo/cloudflare` | self-hosted gateway demo | Next.js + Claude Agent SDK + Cloudflare Worker |

## Architecture

```text
Browser
  -> Next.js /api/generate
    -> Claude Agent SDK
      -> queryCastari fetch interceptor
        -> local /api/portkey/v1/messages
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

- `ANTHROPIC_API_KEY`
- `PORTKEY_API_KEY`
- `OPENAI_API_KEY` for OpenAI models through Portkey
- `GEMINI_API_KEY` for Google models through Portkey
- `NEXT_PUBLIC_ATTO_DEMO_MODE=portkey`

## Files Kept On This Branch

- app: [castari-proxy/claude-agent-demo](./castari-proxy/claude-agent-demo)
- interceptor package: [castari-proxy/src](./castari-proxy/src)

## Validation Notes

This branch linted successfully locally. A full `next build` in this environment is blocked by Google Font fetches from `next/font`, not by Portkey routing logic.
