# atto-proxy — Cloudflare Worker

This is the self-hosted proxy that sits between the Next.js app and the AI model providers. It receives requests in **Anthropic's message format**, checks a routing header, and forwards to either Anthropic or OpenRouter — translating formats as needed.

You deploy this once to your own Cloudflare account. After that, your app has zero dependency on any third party.

## Why This Exists

The Claude Agent SDK only knows how to call Anthropic's API. To use other models (Gemini, GPT-4o, Llama etc.) without changing the app code, we redirect all API calls to this worker. The worker handles the translation so the SDK never knows the difference.

## How It Routes

Every request from the app includes three headers set by `queryCastari()`:

| Header | Example value | Meaning |
|--------|--------------|---------|
| `x-castari-provider` | `anthropic` or `openrouter` | Which upstream to call |
| `x-castari-model` | `or:google/gemini-2.5-flash` | Original model string |
| `x-castari-wire-model` | `google/gemini-2.5-flash` | Model string for the upstream API |

**If provider = `anthropic`:**
Request is forwarded to `api.anthropic.com/v1/messages` unchanged.

**If provider = `openrouter`:**
Request body is translated from Anthropic format to OpenRouter Chat Completions format, then forwarded to `openrouter.ai/api/v1/chat/completions`. The response is translated back.

The API key used is always the one supplied by the client (`x-api-key` header from the app) — nothing is stored in the worker.

## What Gets Translated

| Aspect | Anthropic format | OpenRouter format |
|--------|-----------------|------------------|
| Endpoint | `/v1/messages` | `/v1/chat/completions` |
| Auth header | `x-api-key` | `Authorization: Bearer` |
| Tool calls | `tool_use` content blocks | `tool_calls` array |
| Tool results | `tool_result` content blocks | `tool` role messages |
| Streaming | `message_start/delta/stop` SSE events | `choices[0].delta` SSE events |
| Stop reason | `end_turn`, `tool_use` | `stop`, `tool_calls` |

## Deploy Your Own Instance

**Prerequisites:** A free [Cloudflare account](https://cloudflare.com).

**Step 1 — Install dependencies**
```bash
npm install
```

**Step 2 — Get your Cloudflare account ID**
Log in to dash.cloudflare.com → Workers & Pages → copy Account ID from the right sidebar.

**Step 3 — Update wrangler.toml**
```toml
name = "atto-proxy"
account_id = "YOUR_ACCOUNT_ID_HERE"
```

**Step 4 — Authenticate**
```bash
npx wrangler login
```

**Step 5 — Deploy**
```bash
npx wrangler deploy
```

Output will show your worker URL:
```
https://atto-proxy.YOUR-SUBDOMAIN.workers.dev
```

Set this as `CASTARI_WORKER_URL` in your app's `.env.local`.

## Configuration (wrangler.toml)

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_TOOLS_MODE` | `emulate` | What to do if OpenRouter request includes server tools. `emulate` tries to handle them; `enforceAnthropic` falls back to Anthropic; `error` rejects the request |
| `UPSTREAM_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Override to use a different Anthropic-compatible endpoint |
| `UPSTREAM_OPENROUTER_BASE_URL` | `https://openrouter.ai/api` | Override to use a different OpenRouter-compatible endpoint |
| `OPENROUTER_DEFAULT_VENDOR` | `openai` | Default vendor prefix for bare model names via OpenRouter |

## Security

- API keys flow through the worker in request headers and are never written to storage
- The worker only responds to `POST /v1/messages` — all other paths return 404
- No request bodies are logged
