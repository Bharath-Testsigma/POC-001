# POC-001 — Atto AI Test Case Generator

> Default demo branch target: `helicone`

This repository demonstrates the same test-case-generation workflow behind three different proxy strategies:

| Branch | Mode | Stack | Best for |
|---|---|---|---|
| `demo/cloudflare` | Cloudflare Worker | Next.js + Claude Agent SDK + Cloudflare Worker | showing a self-hosted translation gateway |
| `demo/portkey` | Portkey Gateway | Next.js + Claude Agent SDK + Portkey | showing managed routing, virtual keys, and gateway observability |
| `helicone` | Helicone OSS | Streamlit + FastAPI + self-hosted Helicone AI Gateway | showing a local open-source proxy layer with unified provider routing |

You are currently on the **Helicone OSS** branch. This branch is the most self-contained local demo for showing a self-hosted open-source gateway without depending on Cloudflare or Portkey infrastructure.

## Helicone OSS Architecture

```text
Streamlit UI
  -> FastAPI orchestrator
    -> Helicone AI Gateway on localhost:8080/ai
      -> Anthropic / Google / OpenAI
```

What this branch proves:

- the orchestration loop stays the same while models change
- the UI talks to your own backend, not directly to providers
- Helicone acts as the proxy layer and provider router
- provider failure can fall back to another model

## Quick Start

```bash
git clone https://github.com/Bharath-Testsigma/POC-001.git
cd POC-001/atto-poc
cp .env.example .env
docker compose up -d
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
.venv/bin/streamlit run ui.py
```

Open:

- Streamlit UI: `http://localhost:8501`
- FastAPI API: `http://localhost:8000`
- Helicone models endpoint: `http://localhost:8080/ai/models`

## Documentation

- Helicone local guide: [atto-poc/README.md](./atto-poc/README.md)
- Helicone local env template: [atto-poc/.env.example](./atto-poc/.env.example)
- Cloudflare demo app guide: [castari-proxy/claude-agent-demo/README.md](./castari-proxy/claude-agent-demo/README.md)

## Other Demo Branches

### `demo/cloudflare`

- fixed to Cloudflare Worker mode
- intended for a hosted demo with your own worker URL
- supports Anthropic, OpenRouter, direct Gemini, direct OpenAI, and Ollama routes

### `demo/portkey`

- fixed to Portkey mode
- intended for a hosted demo using Portkey virtual keys
- supports Anthropic, OpenAI, and Google through Portkey's managed gateway

## Validation Notes

This branch should be smoke-tested locally with:

- healthy Helicone gateway on `localhost:8080`
- live FastAPI API on `localhost:8000`
- successful `/generate` request producing XML test cases
- successful fallback from the primary model to `gpt-4o-mini`

## Using the App

### Proxy mode toggle

The sidebar shows two buttons at the top:

- **☁ Cloudflare** — routes through your self-hosted Cloudflare Worker. Shows all available models: Claude, OpenRouter (Gemini, GPT-4o, Llama, Mistral), direct Google/OpenAI, and local Ollama.
- **🔑 Portkey** — routes through Portkey's managed gateway. Shows Claude, GPT-4o family, and Gemini via Portkey. Requires `PORTKEY_API_KEY` in `.env.local`.

Switching modes automatically resets the model to the first available in that list.

### The three-panel layout

**Left — Controls**
- Proxy mode toggle (Cloudflare / Portkey)
- Model selector (grouped by provider)
- Model capability badges: tool use reliability, thinking support
- App type selector (Web / Mobile / API / Desktop)
- Extended thinking toggle + budget slider (Claude models only)
- Token usage + cost after each run

**Centre — Conversation**
- Type your request, press Enter to send
- Watch the agent work in real time: file reads, file writes, and reasoning appear as they happen
- Thinking blocks show the model's step-by-step reasoning before it acts
- Session is maintained across turns — you can edit previously generated files

**Right — Generated Test Cases**
- Every XML file the agent writes appears here live
- Click any file to view it
- Copy button on each file

### Example prompts

```
Generate login test cases — happy path and invalid credentials
Generate an e-commerce checkout flow with 3 steps
Generate password reset flow test cases with edge cases
Edit the login test to add a "remember me" checkbox step
```

---

## Available Models

### Mode 1 — Cloudflare

| Model value | Label | Provider | Tool use |
|---|---|---|---|
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic (direct) | Full |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 | Anthropic (direct) | Full |
| `g:gemini-2.5-flash` | Gemini 2.5 Flash | Google (direct) | Full |
| `g:gemini-2.5-pro` | Gemini 2.5 Pro | Google (direct) | Full |
| `o:gpt-4.1` | GPT-4.1 | OpenAI (direct) | Full |
| `o:gpt-4.1-mini` | GPT-4.1 Mini | OpenAI (direct) | Full |
| `o:gpt-4o` | GPT-4o | OpenAI (direct) | Full |
| `o:gpt-4o-mini` | GPT-4o Mini | OpenAI (direct) | Full |
| `or:meta-llama/llama-3.3-70b-instruct` | Llama 3.3 70B | Meta via OpenRouter | Full |
| `or:openai/gpt-oss-20b:free` | GPT-OSS 20B | OpenAI via OpenRouter (free) | Limited |
| `ollama:llama3.1:8b` | Llama 3.1 8B | Local Ollama | Limited |

### Mode 2 — Portkey

| Model value | Label | Provider | Tool use |
|---|---|---|---|
| `pk:anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 | Anthropic via Portkey | Full |
| `pk:anthropic/claude-haiku-4-5-20251001` | Claude Haiku 4.5 | Anthropic via Portkey | Full |
| `pk:openai/gpt-4o` | GPT-4o | OpenAI via Portkey | Full |
| `pk:openai/gpt-4o-mini` | GPT-4o Mini | OpenAI via Portkey | Full |
| `pk:openai/gpt-4.1` | GPT-4.1 | OpenAI via Portkey | Full |
| `pk:openai/gpt-4.1-mini` | GPT-4.1 Mini | OpenAI via Portkey | Full |
| `pk:google/gemini-2.5-flash` | Gemini 2.5 Flash | Google via Portkey | Full |
| `pk:google/gemini-2.5-pro` | Gemini 2.5 Pro | Google via Portkey | Full |

---

## Architecture Deep-Dive

### Why a proxy at all?

The Claude Agent SDK intercepts `globalThis.fetch` and redirects all `/v1/messages` calls to `ANTHROPIC_BASE_URL`. It cannot be directed per-call to a different provider natively — it only speaks Anthropic's API format.

To support other providers, we need something that:
1. Accepts Anthropic-format requests
2. Translates them to the target provider's format
3. Returns Anthropic-format responses

That is exactly what both the Cloudflare Worker and Portkey do — they are an Anthropic-compatible facade over any model.

### Mode 1 vs Mode 2 in detail

**Mode 1 (Cloudflare Worker)** — self-hosted, full control:
- You own and deploy the Worker — no data passes through third-party services
- The translation logic (`translator.ts`, `stream.ts`) handles: message format, tool call schemas, tool result encoding, streaming SSE events, stop reason mapping, image content
- Routing is header-based: `queryCastari` injects `x-castari-provider` and `x-castari-wire-model` on every request
- Supports server-tool enforcement (forces Anthropic routing when server-side tools are used), MCP bridge mode, reasoning injection via `metadata.castari`

**Mode 2 (Portkey)** — managed gateway, simpler:
- Portkey's endpoint (`api.portkey.ai/v1`) is Anthropic-compatible — the SDK sees no difference
- Routing is header-based: `queryCastari` injects `x-portkey-api-key`, `x-portkey-provider`, and `Authorization: Bearer <provider-key>`
- Portkey handles all translation internally
- Built-in dashboard: per-request cost, latency, model usage, error rates
- Provider API keys are passed per-request — no pre-configuration needed in the Portkey dashboard

### queryCastari.ts — the interceptor

`castari-proxy/src/queryCastari.ts` is the single piece of code that makes the whole thing work. It:

1. **Parses the model string** to detect provider and wire model:
   - `claude-sonnet-4-6` → provider=`anthropic`, wireModel=`claude-sonnet-4-6`
   - `or:meta-llama/llama-3.3-70b-instruct` → provider=`openrouter`, wireModel=`meta-llama/llama-3.3-70b-instruct`
   - `pk:openai/gpt-4o` → provider=`portkey`, portkey_sub_provider=`openai`, wireModel=`gpt-4o`

2. **Selects the correct base URL**:
   - Cloudflare models → `CASTARI_WORKER_URL`
   - Portkey models → `https://api.portkey.ai/v1`
   - Ollama models → `http://localhost:3000/api/ollama`

3. **Patches `globalThis.fetch`** (once per process) and intercepts all `POST /v1/messages` calls that match the registered base origin

4. **Injects headers** depending on mode:
   - Cloudflare: `x-castari-provider`, `x-castari-model`, `x-castari-wire-model`
   - Portkey: `x-portkey-api-key`, `x-portkey-provider`, `Authorization: Bearer <key>`

5. **Selects the right API key** for the target provider and sets it as `ANTHROPIC_API_KEY` in the subprocess env — the SDK uses this for the `x-api-key` header

### The Write tool path jail

The agent is given Read, Write, Glob, and Grep tools. Write is restricted by `lib/policy/permission.ts` — any path outside `.data/workspace/` is silently rewritten to be inside it. This prevents the model from writing anywhere on your filesystem regardless of what it decides.

---

## Why This Matters for Testsigma

The production Atto system (`alpha` + `atto-browser-agent-v2`) already routes through an internal gateway. This POC shows the same technique can work at the **Claude Agent SDK level**:

- The SDK's tool-calling and decision-making can run on cheaper non-Claude models (Gemini Flash, GPT-4o-mini, Llama 70B) — reducing inference cost significantly
- The code doesn't change — only the model string and proxy URL
- Mode 2 (Portkey) demonstrates that a managed gateway can replace the self-hosted Cloudflare Worker if operational simplicity is preferred over full data control

---

## Security Notes

- API keys are injected per-request in the Node.js subprocess env — they are never stored in the proxy worker or Cloudflare
- In Portkey mode, provider keys are passed via `Authorization` headers — Portkey forwards them to the provider and does not store them
- The Write tool is path-jailed to `.data/workspace/` — verified server-side, not just in the system prompt
- `Bash` and `KillBash` tools are blocked unconditionally

---

## Legacy Python POC

`atto-poc/` contains the local Python implementation using FastAPI + Streamlit with a self-hosted Helicone gateway. It's kept as the simplest end-to-end local demo, while the TypeScript version supersedes it for Claude Agent SDK features such as native tool streaming, session resumption, extended thinking, and MCP support.
