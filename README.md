# POC-001 — Atto AI Test Case Generator

Atto is a proof-of-concept agent application that turns plain-English requests into structured XML test case files.

The application is built around one specific technical question:

> Can we keep the Claude Agent SDK as the agent runtime, but move model inference behind a proxy so the same agent loop can run on Claude, OpenAI, and Gemini without rewriting the app?

This repository exists to answer that question with working code.

## What This Repository Is Trying To Prove

This POC is not just a demo chat UI. It is an architecture experiment.

It is trying to prove that:

1. The Claude Agent SDK can remain the orchestration layer even when the actual inference model is not Claude.
2. A proxy layer can make non-Anthropic models look Anthropic-compatible enough for the SDK to keep working.
3. Tool use, streaming, file writing, and session continuity can survive that translation layer.
4. Model switching can become a configuration problem instead of an application rewrite.
5. A managed gateway such as Portkey can replace a custom proxy in the common case.

The business relevance is straightforward: if the agent loop remains stable while the model changes, then cost, latency, governance, and vendor choice become operational decisions rather than product rewrites.

---

## Why This Application Exists

Testsigma's Atto concept is an AI agent that receives a request such as:

```text
Generate login test cases for a web app with happy path and invalid password coverage.
```

and produces XML files in a structured, tool-driven workflow.

The Claude Agent SDK is a useful fit for this because it already provides:

- an agent loop
- tool calling
- streaming events
- session continuity
- partial output handling

The constraint is that the SDK is Anthropic-native. Left alone, it expects Anthropic-style requests and responses on `/v1/messages`.

That means this repository needs a translation layer if it wants to run the same agent on non-Claude models.

That translation layer is the entire point of the project.

---

## The Two Modes

The application exposes two routing modes in the UI.

| Mode | Status in this POC | What it is for | Gateway |
|---|---|---|---|
| **Mode 2 — Portkey** | Primary path | Managed proxy, virtual-key-based provider switching, fastest path to proving the concept | Portkey |
| **Mode 1 — Cloudflare** | Optional alternative | Self-hosted translation layer when you want full control or want to inspect the translation logic directly | Cloudflare Worker |

Mode 2 is the path this README focuses on.

Mode 1 still matters because it acts as:

- a fallback when you do not want a managed gateway
- a reference implementation of the translation logic
- a way to inspect and control the provider routing in your own infrastructure

---

## What Mode 2 Is Proving

Mode 2 is the stronger architectural claim.

It is proving that:

- the Claude Agent SDK can still be the agent runtime
- Portkey can act as the Anthropic-compatible proxy layer
- provider switching can happen through Portkey virtual keys
- the app can remain mostly unchanged while the inference provider changes underneath it

In concrete terms:

- `pk:anthropic/...` should infer through Portkey using `PORTKEY_VK_ANTHROPIC`
- `pk:openai/...` should infer through Portkey using `PORTKEY_VK_OPENAI`
- `pk:google/...` should infer through Portkey using `PORTKEY_VK_GOOGLE`

The app should not need separate OpenAI or Gemini direct-inference logic for Mode 2.

That is now the implemented behavior for the actual Mode 2 inference path.

---

## Important Nuance About Anthropic

There is one design detail that matters:

The application still expects an `ANTHROPIC_API_KEY` to be present so the current SDK startup and environment validation path can initialize cleanly.

That does **not** mean Mode 2 inference is directly calling Anthropic.

For `pk:*` models, the inference request is routed to Portkey and the selected provider is determined by the model prefix plus the matching virtual key.

So the accurate statement is:

- `ANTHROPIC_API_KEY` is still part of the current boot-time contract of the app
- actual Mode 2 inference is routed through Portkey and the provider-specific virtual key

That distinction matters because this repository is proving inference routing behavior, not claiming the SDK itself has become provider-agnostic.

---

## Architecture At A Glance

### Mode 2 — Portkey

```text
Browser UI
  -> POST /api/generate { query, model, appType }
  -> Claude Agent SDK
  -> queryCastari fetch interceptor
  -> local /api/portkey/v1/messages route
  -> Portkey /v1/messages
  -> selected provider via Portkey virtual key
  -> Anthropic-compatible response back to SDK
  -> SDK executes tools and streams events to the UI
```

### Mode 1 — Cloudflare

```text
Browser UI
  -> POST /api/generate { query, model, appType }
  -> Claude Agent SDK
  -> queryCastari fetch interceptor
  -> Cloudflare Worker
  -> target provider (Anthropic, OpenRouter, OpenAI, Gemini, Ollama)
  -> translated Anthropic-compatible response back to SDK
  -> SDK executes tools and streams events to the UI
```

---

## How Model Switching Works

This is the core mechanism of the whole POC.

The UI never changes its agent logic when you switch models. Only the model value changes.

Examples:

- `claude-sonnet-4-6`
- `or:meta-llama/llama-3.3-70b-instruct`
- `o:gpt-4o`
- `g:gemini-2.5-pro`
- `pk:openai/gpt-4o`
- `pk:anthropic/claude-haiku-4-5-20251001`

The routing logic uses the model prefix to decide:

1. which gateway to talk to
2. which provider the gateway should target
3. which wire-model name the upstream provider expects

The relevant logic lives in:

- [`castari-proxy/src/queryCastari.ts`](castari-proxy/src/queryCastari.ts)
- [`castari-proxy/claude-agent-demo/lib/agent/atto-session.ts`](castari-proxy/claude-agent-demo/lib/agent/atto-session.ts)
- [`castari-proxy/claude-agent-demo/app/api/portkey/v1/messages/route.ts`](castari-proxy/claude-agent-demo/app/api/portkey/v1/messages/route.ts)

### What happens in Mode 2

When the selected model starts with `pk:`:

1. The app points the SDK to the local Portkey route instead of the Cloudflare worker.
2. `queryCastari` treats the request as a Portkey request.
3. The `pk:` prefix is stripped so the wire model becomes the provider-native model name.
4. The request is forwarded to the local `/api/portkey/v1/messages` route.
5. That local route chooses the correct Portkey virtual key based on the provider in the model name.
6. The local route forwards Anthropic protocol headers plus:
   - `x-portkey-api-key`
   - `x-portkey-virtual-key`
7. Portkey handles the provider-specific translation.
8. The response is normalized back into the format the SDK expects.

### What happens in Mode 1

When the selected model is not `pk:`:

1. The SDK points to the configured Cloudflare worker or local Ollama route.
2. `queryCastari` injects routing headers such as:
   - `x-castari-provider`
   - `x-castari-model`
   - `x-castari-wire-model`
3. The worker decides where the request goes.
4. The worker performs the response translation.

---

## Why A Proxy Is Necessary At All

The Claude Agent SDK wants to speak the Anthropic Messages API.

If the target provider is not Anthropic, something has to bridge the gap.

That bridge has to do more than rename the model.

It must also preserve:

- streaming semantics
- tool call structures
- stop reasons
- message content blocks
- tool result shapes
- compatible request and response envelopes

Without that translation layer, the SDK can start, but the agent loop breaks the moment it expects Anthropic-specific behavior from a non-Anthropic provider.

Mode 1 proves this explicitly with our own worker.

Mode 2 proves that a managed proxy can do the same job well enough for the app to work as an agent, not just as a text completion client.

---

## What The Application Actually Does

The user experience is intentionally simple.

The user enters a plain-English request, for example:

```text
Generate a successful login test case and an invalid password test case for a web application.
```

The agent then:

1. interprets the request
2. decides whether it needs tools
3. writes XML files into a controlled workspace
4. streams its progress back to the UI
5. shows the generated files in the right panel

The important thing is that the app is not just prompting a model for freeform text.

It is running a tool-using agent with:

- a system prompt
- a restricted tool policy
- file generation
- multi-turn session behavior
- live streamed events

That makes it a better proof of proxy compatibility than a basic “hello world” completion demo.

---

## What The UI Shows

The main UI has three responsibilities:

### Left panel

- choose proxy mode
- choose model
- choose app type
- optionally enable extended thinking on supported Claude models
- inspect cost and token usage

### Center panel

- send prompts
- watch streamed tool calls
- watch partial responses as they arrive
- continue the session across turns

### Right panel

- inspect generated XML files
- verify that file writing actually occurred
- confirm the agent produced structured artifacts, not just plain text

---

## Why XML Test Case Generation Is The Right Demo

This use case is a good proxy test for an agent system because it requires more than simple text output.

It exercises:

- structured output
- file writing
- tool use
- streaming
- session state
- prompt discipline

If the proxy layer only supported “chat completion”, that would not be enough.

This application is more convincing because it requires the model to behave like an agent, not just like a chatbot.

---

## Repository Structure

```text
POC-001/
├── README.md                                <- canonical project README
├── atto-poc/                                <- original Python proof of concept
└── castari-proxy/
    ├── src/                                 <- queryCastari package source
    │   └── queryCastari.ts                  <- fetch interception and routing
    ├── worker/                              <- Cloudflare Worker for Mode 1
    │   └── src/
    │       ├── index.ts                     <- request routing
    │       ├── provider.ts                  <- provider resolution
    │       ├── translator.ts                <- format translation
    │       └── stream.ts                    <- streaming translation
    └── claude-agent-demo/                   <- main Next.js application
        ├── app/
        │   ├── api/
        │   │   ├── generate/route.ts        <- starts agent run, streams events
        │   │   ├── workspace/route.ts       <- lists and clears generated files
        │   │   ├── portkey/v1/messages/     <- local Portkey adapter route
        │   │   └── ollama/v1/messages/      <- local Ollama adapter route
        │   └── components/
        │       └── AttoChat.tsx             <- main application UI
        └── lib/
            ├── agent/
            │   ├── atto-session.ts          <- session setup and model routing
            │   ├── atto-config.ts           <- UI model lists
            │   └── events.ts                <- SDK event to UI event mapping
            ├── policy/
            │   └── permission.ts            <- tool restrictions and path jail
            ├── env.ts                       <- validated environment contract
            └── castariProxy.ts              <- re-export of queryCastari
```

---

## Mode 2 Credential Behavior

This is the most important operational section.

### Required for Mode 2

- `PORTKEY_API_KEY`
- `PORTKEY_VK_ANTHROPIC`
- `PORTKEY_VK_OPENAI`
- `PORTKEY_VK_GOOGLE`
- `ANTHROPIC_API_KEY` for the app's current startup contract

### What Mode 2 actually uses for inference

For `pk:*` models:

- the request is routed through Portkey
- the provider is selected from the model prefix
- the virtual key is selected from the provider
- the actual provider inference is expected to happen through Portkey

### What Mode 2 does not rely on for provider switching

The current Mode 2 path is no longer intended to forward:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

for Portkey inference routing.

That is important because it means Mode 2 is testing the Portkey virtual-key path rather than accidentally falling back to raw direct provider credentials for OpenAI or Gemini.

---

## Mode 1 Credential Behavior

Mode 1 is broader and more explicit.

It can use:

- `ANTHROPIC_API_KEY` for direct Claude
- `OPENROUTER_API_KEY` for `or:*`
- `OPENAI_API_KEY` for `o:*`
- `GEMINI_API_KEY` for `g:*`
- local Ollama for `ollama:*`

This is why Mode 1 is still valuable:

- it shows the translation logic in a self-hosted form
- it allows deeper inspection and control
- it supports more experimental routing choices

But it is not the main point of this POC anymore. Mode 2 is.

---

## Current Model Options

### Mode 2 — Portkey-first

Current UI options include:

- `pk:anthropic/claude-sonnet-4-6`
- `pk:anthropic/claude-haiku-4-5-20251001`
- `pk:anthropic/claude-opus-4-5`
- `pk:openai/gpt-4.1`
- `pk:openai/gpt-4.1-mini`
- `pk:openai/gpt-4o`
- `pk:openai/gpt-4o-mini`
- `pk:openai/o4-mini`
- `pk:openai/o3-mini`
- `pk:google/gemini-2.5-flash`
- `pk:google/gemini-2.5-pro`

These are configured in:

- [`castari-proxy/claude-agent-demo/lib/agent/atto-config.ts`](castari-proxy/claude-agent-demo/lib/agent/atto-config.ts)

### Mode 1 — optional alternative

Current UI options include:

- direct Claude models
- OpenRouter models
- direct OpenAI models
- direct Gemini models
- local Ollama models

---

## Guardrails And Safety

This is still an agent, so the file-writing behavior matters.

The application limits the tool surface and constrains where files can be written.

Key protections:

- `Read`, `Write`, `Glob`, and `Grep` are the primary Atto tools
- file writes are jailed into `.data/workspace/`
- the system prompt reinforces the same constraint
- the server-side policy enforces it regardless of model behavior

This matters because the proxy experiment would be much less credible if the app only demonstrated raw text responses and never touched real tools.

---

## Recommended Local Setup

If your goal is to evaluate the main architectural claim, start with Mode 2 first.

### Prerequisites

- Node.js 18+
- npm
- a Portkey account
- three Portkey virtual keys:
  - Anthropic
  - OpenAI
  - Google

### Environment

Create `castari-proxy/claude-agent-demo/.env.local`:

```env
# Current app startup contract
ANTHROPIC_API_KEY=sk-ant-...

# Optional unless you want Mode 1
CASTARI_WORKER_URL=https://atto-proxy.YOUR-SUBDOMAIN.workers.dev
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Mode 2
PORTKEY_API_KEY=pk-...
PORTKEY_VK_ANTHROPIC=vk-...
PORTKEY_VK_OPENAI=vk-...
PORTKEY_VK_GOOGLE=vk-...
```

### Install and run

```bash
git clone https://github.com/Bharath-Testsigma/POC-001.git
cd POC-001/castari-proxy/claude-agent-demo
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Then:

1. switch to **Portkey**
2. choose a `pk:*` model
3. generate a test case
4. compare behavior across Claude, OpenAI, and Gemini without changing application logic

---

## When To Use Mode 1 Instead

Use Mode 1 if you want:

- full control over the translation layer
- self-hosted routing
- direct visibility into how Anthropic-format requests are being transformed
- a reference implementation for your own proxy logic

Mode 1 is not the main story of this README, but it is still a valid and important option.

---

## What This POC Proves Successfully

This repository demonstrates that:

- a tool-using Claude Agent SDK application can be made multi-model through a proxy layer
- a managed proxy can be sufficient for real agent behavior, not just basic completions
- model switching can be pushed into routing and credential selection
- the same app can compare Claude, OpenAI, and Gemini behavior under one agent UI

The strongest conclusion is not “Portkey is good” or “Cloudflare is good”.

The strongest conclusion is:

> the agent runtime and the inference provider do not need to be coupled as tightly as they first appear.

That is the real result this project is trying to demonstrate.

---

## Limitations

This POC does not claim that:

- every model is equally good at tool use
- every provider will behave identically under translation
- the Claude Agent SDK is truly provider-native
- boot-time Anthropic requirements have been completely removed

Instead, it shows that the architecture is practical enough to run a real agent workload with provider switching behind a proxy.

---

## Legacy Python POC

The `atto-poc/` folder contains the earlier Python prototype using FastAPI, Streamlit, and LiteLLM.

It is kept for reference.

The Next.js application in `castari-proxy/claude-agent-demo/` is the main implementation for this repository because it exercises the Claude Agent SDK directly, which is the more important part of the proof.
