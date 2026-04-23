# POC-001 — Atto AI Test Case Generator

> Demo branch: `demo/portkey`
>
> This branch is pinned to the Portkey gateway architecture for deployment and walkthroughs. The Cloudflare and LiteLLM demos live on their own branches.

A proof-of-concept for Testsigma's **Atto** system — an AI agent that turns a plain-English request into structured XML test case files.

**The core idea:** use Claude's API format as the single interface, but transparently route requests to _any_ AI model (Claude, GPT-4o, Gemini, Llama, Mistral) through a proxy. The app never changes its code to switch models or providers — just pick a model from the dropdown.

**Two proxy modes are supported**, toggled from the UI:

| Mode | Gateway | Models |
|---|---|---|
| **Mode 1 — Cloudflare** | Your own Cloudflare Worker | Claude (direct), OpenRouter models, Google Gemini (direct), OpenAI (direct), Ollama (local) |
| **Mode 2 — Portkey** | Portkey managed gateway | Claude, GPT-4o, Gemini via Portkey's unified API |

---

## How It Works

### Mode 1 — Cloudflare + OpenRouter

```
Browser
  │  POST /api/generate { query, model }
  ▼
Next.js API Route
  │  Claude Agent SDK  (queryCastari intercepts fetch)
  ▼
Cloudflare Worker  (atto-proxy — your self-hosted)
  │
  │  reads x-castari-provider header
  │
  ├── model = "claude-*"         → Anthropic API (pass-through)
  ├── model = "or:vendor/model"  → OpenRouter (translates Anthropic ↔ OpenAI format)
  ├── model = "g:gemini-*"       → Google Gemini API (translates format)
  └── model = "o:gpt-*"         → OpenAI API (translates format)
```

The Cloudflare Worker handles all format translation between Anthropic's message schema and each provider's API — tool calls, streaming events, stop reasons, image content, everything.

### Mode 2 — Portkey

```
Browser
  │  POST /api/generate { query, model }
  ▼
Next.js API Route
  │  Claude Agent SDK  (queryCastari intercepts fetch)
  ▼
Portkey Gateway  (managed service — api.portkey.ai)
  │
  │  reads x-portkey-provider header
  │
  ├── model = "pk:anthropic/..."  → Anthropic
  ├── model = "pk:openai/..."     → OpenAI
  └── model = "pk:google/..."     → Google
```

Portkey exposes an Anthropic-compatible endpoint. The Claude Agent SDK sees no difference — it still talks the same language. Portkey handles translation internally and gives you a dashboard showing usage, cost, and latency across providers.

### The fetch interceptor (the key mechanism)

The Claude Agent SDK is designed to talk exclusively to `api.anthropic.com`. To support other providers, `queryCastari.ts` patches `globalThis.fetch` once per process:

```
SDK calls fetch("https://<proxy>/v1/messages", body)
         ↓
Interceptor fires (URL matches /v1/messages)
         ↓
Injects routing headers (provider, model, credentials)
         ↓
Request forwarded to proxy (Cloudflare Worker or Portkey)
         ↓
Proxy routes to actual provider, translates response
         ↓
SDK receives Anthropic-format response — it never knew the difference
```

The app model prefix determines which proxy path is taken:

| Prefix | Provider | Gateway |
|--------|----------|---------|
| `claude-` | Anthropic | Cloudflare (pass-through) |
| `or:vendor/model` | OpenRouter | Cloudflare |
| `g:gemini-*` | Google Gemini | Cloudflare |
| `o:gpt-*` | OpenAI | Cloudflare |
| `ollama:model` | Local Ollama | Local proxy route |
| `pk:provider/model` | Portkey gateway | Portkey |

---

## Project Structure

```
POC-001/
├── castari-proxy/
│   ├── claude-agent-demo/          ← Main application (Next.js + TypeScript)
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── generate/       ← Streaming test-case generation endpoint
│   │   │   │   ├── workspace/      ← List & clear generated XML files
│   │   │   │   └── ollama/         ← Local Ollama proxy route
│   │   │   ├── components/
│   │   │   │   └── AttoChat.tsx    ← Main UI (3-panel layout + mode toggle)
│   │   │   └── globals.css
│   │   └── lib/
│   │       ├── agent/
│   │       │   ├── atto-session.ts ← Session builder: prompt, tools, env, base URL
│   │       │   └── atto-config.ts  ← Model lists (Cloudflare + Portkey), app-type options
│   │       ├── policy/
│   │       │   └── permission.ts   ← Tool allow-list, Write path jail
│   │       ├── env.ts              ← Zod-validated env schema
│   │       └── castariProxy.ts     ← Re-exports queryCastari from the package
│   │
│   ├── src/                        ← queryCastari package source
│   │   └── queryCastari.ts         ← Fetch interceptor + provider/model routing logic
│   │
│   └── worker/                     ← Cloudflare Worker (Mode 1 proxy)
│       ├── src/
│       │   ├── index.ts            ← Entry: reads headers, routes to provider
│       │   ├── translator.ts       ← Anthropic ↔ OpenAI format conversion
│       │   ├── stream.ts           ← SSE streaming conversion
│       │   ├── provider.ts         ← Provider detection, server-tool handling
│       │   └── config.ts           ← Worker environment config
│       └── wrangler.toml           ← Cloudflare deployment config
│
└── atto-poc/                       ← Original Python POC (kept for reference)
    ├── main.py                     ← FastAPI server
    ├── app/orchestrator.py         ← Agentic loop using LiteLLM
    └── ui.py                       ← Streamlit demo UI
```

---

## Prerequisites

- **Node.js 18+**
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com) *(always required — the Agent SDK runs on Claude)*

**For Mode 1 (Cloudflare):**
- **Cloudflare account** — [cloudflare.com](https://cloudflare.com) *(free tier is enough)*
- **OpenRouter API key** — [openrouter.ai/keys](https://openrouter.ai/keys) *(for Gemini, GPT-4o, Llama, Mistral via OpenRouter)*
- **Google Gemini API key** *(optional — for direct Gemini routing, bypassing OpenRouter)*
- **OpenAI API key** *(optional — for direct OpenAI routing)*

**For Mode 2 (Portkey):**
- **Portkey API key** — [app.portkey.ai](https://app.portkey.ai) → API Keys
- **Provider API keys** — same Anthropic / OpenAI / Gemini keys you already have

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Bharath-Testsigma/POC-001.git
cd POC-001/castari-proxy/claude-agent-demo
npm install
```

### 2. Configure environment

Create `.env.local` in `castari-proxy/claude-agent-demo/`:

```env
# Always required
ANTHROPIC_API_KEY=sk-ant-...

# Mode 1 — Cloudflare Worker URL (deploy steps below)
CASTARI_WORKER_URL=https://atto-proxy.YOUR-SUBDOMAIN.workers.dev

# Mode 1 — additional provider keys (optional, enables those model groups)
OPENROUTER_API_KEY=sk-or-v1-...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...

# Mode 2 — Portkey (enables the Portkey mode toggle in UI)
PORTKEY_API_KEY=pk-...
```

### 3. Deploy your Cloudflare Worker (Mode 1 only)

The Cloudflare Worker is the translation proxy for Mode 1. You deploy it to your own Cloudflare account — no third-party service.

```bash
cd ../worker
npm install
npx wrangler login          # opens browser — sign in to Cloudflare
```

Edit `wrangler.toml` and replace the `account_id` with yours (find it in Cloudflare dashboard → Workers & Pages, right sidebar):

```toml
name = "atto-proxy"
account_id = "YOUR_CLOUDFLARE_ACCOUNT_ID"
```

Deploy:

```bash
npx wrangler deploy
# Deployed: https://atto-proxy.YOUR-SUBDOMAIN.workers.dev  ← paste into CASTARI_WORKER_URL
```

### 4. Start the app

```bash
cd ../claude-agent-demo
npm run dev
```

Open **http://localhost:3000**

> **Note:** `npm run dev` automatically runs `scripts/sync-castari-proxy.mjs` first, which copies the `queryCastari` source from `castari-proxy/src/` into `node_modules/castari-proxy`. This keeps the local package in sync without a publish step.

---

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

`atto-poc/` contains the original Python implementation using FastAPI + LiteLLM + Streamlit. It's kept for reference to show the same multi-model idea in a simpler form. The TypeScript version here supersedes it by using the Claude Agent SDK for native tool streaming, session resumption, extended thinking, and MCP support.
