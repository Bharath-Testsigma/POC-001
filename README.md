# POC-001 — Atto AI Test Case Generator

A proof-of-concept that replicates Testsigma's internal **Atto** system — an AI agent that turns a plain-English request into structured XML test case files.

The key idea demonstrated here: **use Claude's API format as the single interface, but route requests to any AI model** (Claude, Gemini, GPT-4o, Llama, Mistral) through a self-hosted proxy. The app never changes its code to switch models — just a model string in the UI.

---

## How It Works

```
Browser (Next.js UI)
        │
        │  POST /api/generate  { query, model, appType }
        ▼
Next.js API Route  ─── Claude Agent SDK ──► Your Cloudflare Worker (atto-proxy)
                                                    │
                                          reads "x-castari-provider" header
                                                    │
                              ┌─────────────────────┴──────────────────────┐
                              │                                              │
                    model starts with "claude-"               model starts with "or:"
                              │                                              │
                     Anthropic API                               OpenRouter API
                  (Claude Sonnet, Haiku…)            (Gemini, GPT-4o, Llama, Mistral…)
```

The proxy worker translates between Anthropic's message format and OpenRouter's format on the fly — your app always speaks one language.

---

## Project Structure

```
POC-001/
├── castari-proxy/
│   ├── claude-agent-demo/      ← Main application (Next.js + TypeScript)
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── generate/   ← Streaming test-case generation endpoint
│   │   │   │   └── workspace/  ← List & clear generated XML files
│   │   │   ├── components/
│   │   │   │   └── AttoChat.tsx  ← Main UI (3-panel layout)
│   │   │   └── globals.css
│   │   └── lib/
│   │       ├── agent/
│   │       │   ├── atto-session.ts   ← Session builder: system prompt + file tools
│   │       │   └── atto-config.ts    ← Model list, app-type options
│   │       ├── policy/
│   │       │   └── permission.ts     ← Tool allow-list, path jail for Write tool
│   │       └── castariProxy.ts       ← queryCastari() — wraps Claude Agent SDK
│   │
│   ├── src/                    ← queryCastari wrapper (npm package)
│   └── worker/                 ← Cloudflare Worker (your self-hosted proxy)
│       ├── src/
│       │   ├── index.ts        ← Entry point: routes by provider header
│       │   ├── translator.ts   ← Anthropic ↔ OpenRouter format conversion
│       │   └── stream.ts       ← SSE streaming conversion
│       └── wrangler.toml       ← Cloudflare deployment config
│
└── atto-poc/                   ← Original Python POC (kept for reference)
    ├── main.py                 ← FastAPI server
    ├── app/orchestrator.py     ← Agentic loop using LiteLLM
    └── ui.py                   ← Streamlit demo UI
```

---

## Prerequisites

- **Node.js 18+**
- An **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com)
- An **OpenRouter API key** — [openrouter.ai/keys](https://openrouter.ai/keys) *(needed for Gemini, GPT-4o, Llama etc.)*
- A **Cloudflare account** — [cloudflare.com](https://cloudflare.com) *(free tier is enough)*

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/Bharath-Testsigma/POC-001.git
cd POC-001/castari-proxy/claude-agent-demo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Deploy your own proxy worker

The app routes all model calls through a Cloudflare Worker that you own and control. No third-party services.

```bash
cd ../worker
npm install
npx wrangler login       # opens browser — sign in to Cloudflare
```

Open `wrangler.toml` and replace the `account_id` with yours (found in Cloudflare dashboard → Workers & Pages, right sidebar):

```toml
name = "atto-proxy"
account_id = "YOUR_CLOUDFLARE_ACCOUNT_ID"
```

Deploy:

```bash
npx wrangler deploy
# Output: https://atto-proxy.YOUR-SUBDOMAIN.workers.dev  ← copy this URL
```

### 4. Configure environment

```bash
cd ../claude-agent-demo
cp .env.example .env.local
```

Edit `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...          # from console.anthropic.com
OPENROUTER_API_KEY=sk-or-v1-...       # from openrouter.ai/keys
CASTARI_WORKER_URL=https://atto-proxy.YOUR-SUBDOMAIN.workers.dev
```

### 5. Start the app

```bash
npm run dev
```

Open **http://localhost:3000**

---

## Using the App

The UI has three panels:

**Left — Controls**
- Pick the AI model (Claude, Gemini, GPT-4o, Llama, Mistral, etc.)
- Pick the application type (Web, Mobile, API, Desktop)
- Toggle extended thinking (for Claude models only)
- Cost display after each run

**Centre — Conversation**
- Type your test case request in the input box
- Watch the agent work in real time — you see every file read/write as it happens
- Thinking blocks (when enabled) show the model's reasoning before it acts

**Right — Generated Test Cases**
- Every XML file the agent writes appears here live
- Click a file to view the XML
- Copy button for each file

**Example prompts to try:**
```
Generate login test cases for a web app — happy path and invalid credentials
Generate an e-commerce checkout flow with 3 steps
Edit the login test to add a "remember me" step
```

---

## Available Models

| Model | Provider | Notes |
|-------|----------|-------|
| `claude-sonnet-4-6` | Anthropic | Best quality, direct |
| `claude-haiku-4-5` | Anthropic | Fastest Claude |
| `or:google/gemini-flash-1.5` | Google via OpenRouter | Very fast, cheap |
| `or:google/gemini-2.5-flash` | Google via OpenRouter | Best Gemini |
| `or:openai/gpt-4o-mini` | OpenAI via OpenRouter | Fast GPT-4 |
| `or:openai/gpt-4o` | OpenAI via OpenRouter | Full GPT-4 |
| `or:meta-llama/llama-3.1-8b-instruct` | Meta via OpenRouter | Open-source, free |
| `or:mistralai/mistral-7b-instruct` | Mistral via OpenRouter | Open-source, free |

Models prefixed with `or:` are routed to OpenRouter. Everything else goes to Anthropic directly.

---

## How the Multi-Model Routing Works

This is the core technique being demonstrated.

The **Claude Agent SDK** is built to talk exclusively to Anthropic's API. To use other models, we intercept outgoing HTTP requests using `queryCastari()` — a thin wrapper that:

1. Reads the `model` string you pass
2. Sets routing headers (`x-castari-provider`, `x-castari-model`) on every fetch request
3. Redirects all `/v1/messages` calls to your Cloudflare Worker instead of `api.anthropic.com`

The **Cloudflare Worker** (`worker/src/`) then:
- Reads the provider header
- If `anthropic` → forwards to `api.anthropic.com` unchanged
- If `openrouter` → translates the Anthropic message format to OpenRouter's Chat Completions format, including tool calls, streaming, and stop reasons

The app code never knows which provider it's using. You swap models by changing one string.

---

## Architecture Decisions

**Why a proxy worker instead of calling OpenRouter directly?**

The Claude Agent SDK patches `globalThis.fetch` and intercepts all calls to `/v1/messages`. It cannot be easily redirected per-call. The proxy is the cleanest way to translate formats without forking the SDK.

**Why Cloudflare Workers?**

- Runs at the edge (low latency)
- No server to manage — it scales automatically
- Free tier handles 100k requests/day
- The translation logic is stateless — perfect for Workers

**Why not just use LiteLLM?**

The original Python POC (`atto-poc/`) used LiteLLM for model switching. This version uses the Claude Agent SDK because it provides native tool streaming, extended thinking support, session resumption, and MCP integration — features LiteLLM doesn't expose. The trade-off is that we need the proxy layer to support non-Anthropic models.

---

## Security Notes

- API keys are passed request-by-request from the Next.js server to the worker. They are never stored in the worker or Cloudflare.
- The Write tool is path-jailed to `.data/workspace/` — the agent cannot write outside this directory regardless of what the model requests.
- `Bash` and `KillBash` tools are always blocked, preventing arbitrary command execution.

---

## Legacy Python POC

The `atto-poc/` directory contains the original Python implementation using FastAPI + LiteLLM + Streamlit. It still works and is kept for reference. See `atto-poc/README.md` (if present) or the root README history for setup instructions.
