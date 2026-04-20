# Castari Proxy — Complete Deep Dive

Everything you need to understand how this repo works, from concept to source code, line by line.

---

## Table of Contents

1. [What Problem Does This Solve?](#1-what-problem-does-this-solve)
2. [High-Level Architecture](#2-high-level-architecture)
3. [The Three Components](#3-the-three-components)
4. [The Core Trick — Three-Layer Interception](#4-the-core-trick--three-layer-interception)
5. [Layer 1 — Client-Side Fetch Hijack (`src/queryCastari.ts`)](#5-layer-1--client-side-fetch-hijack)
6. [Layer 2 — Cloudflare Worker Routing (`worker/src/index.ts`)](#6-layer-2--cloudflare-worker-routing)
7. [Layer 3 — API Format Translation (`worker/src/translator.ts`)](#7-layer-3--api-format-translation)
8. [Streaming SSE Translation (`worker/src/stream.ts`)](#8-streaming-sse-translation)
9. [Model Naming Convention & Provider Resolution](#9-model-naming-convention--provider-resolution)
10. [Subagent Model Inheritance (Task Tool)](#10-subagent-model-inheritance-task-tool)
11. [Server Tool Policy Enforcement](#11-server-tool-policy-enforcement)
12. [Reasoning Config Injection](#12-reasoning-config-injection)
13. [Configuration & Deployment (`worker/src/config.ts`, `wrangler.toml`)](#13-configuration--deployment)
14. [The Demo App — End-to-End Flow](#14-the-demo-app--end-to-end-flow)
15. [Complete Request Lifecycle Walkthrough](#15-complete-request-lifecycle-walkthrough)
16. [Key File Reference](#16-key-file-reference)
17. [Is This Legal?](#17-is-this-legal)

---

## 1. What Problem Does This Solve?

The **Anthropic Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) is designed to drive an AI agent loop exclusively through Anthropic's API. It hardwires the request format, endpoint, and authentication to Anthropic's Messages API at `https://api.anthropic.com/v1/messages`.

This is a problem if you want to:
- Use GPT-4o, Gemini, Llama, or any other model without rewriting your agent code
- Test the same agent against multiple providers to compare cost/quality
- Route specific agent runs to cheaper OpenRouter models in production

The Claude Agent SDK gives you one env hook: `ANTHROPIC_BASE_URL`. If you point that at something other than Anthropic, the SDK will POST there — but whatever is at that URL must still speak the **Anthropic Messages API format**. That's the seam Castari exploits.

**Castari's solution:** Put a smart proxy (the Castari Worker) between the SDK and the world. The proxy accepts Anthropic-format requests, decides which upstream to call, and translates requests/responses so the SDK never knows it was talking to a different provider.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Your Application (Node.js / Next.js)                           │
│                                                                 │
│   queryCastari({ prompt, options: { model: "or:gpt-5-mini" } }) │
│          │                                                      │
│          ▼                                                      │
│   @anthropic-ai/claude-agent-sdk  ◄── options.env.ANTHROPIC_    │
│         query()                        BASE_URL = Worker URL    │
│          │                                                      │
│   global fetch() ──► [INTERCEPTED by Castari Wrapper]          │
│          │           Adds headers:                              │
│          │             x-castari-provider: openrouter           │
│          │             x-castari-model: or:gpt-5-mini           │
│          │             x-castari-wire-model: openai/gpt-5-mini  │
│          │           Injects reasoning config into body         │
│          │                                                      │
└──────────┼──────────────────────────────────────────────────────┘
           │  POST /v1/messages
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Castari Worker (Cloudflare Worker)                             │
│                                                                 │
│   Reads headers → decides provider                              │
│          │                                                      │
│          ├──────────────────────────────────────────────────┐   │
│          │ provider = anthropic                              │   │
│          ▼                                                   │   │
│   proxyAnthropic()                                           │   │
│   Passthrough to api.anthropic.com/v1/messages               │   │
│                                                              │   │
│          │ provider = openrouter                             │   │
│          ▼                                                   │   │
│   handleOpenRouter()                                         │   │
│     buildOpenRouterRequest() ── Translate Anthropic→OR fmt   │   │
│     fetch(openrouter.ai/api/v1/chat/completions)             │   │
│     mapOpenRouterResponse() ── Translate OR→Anthropic fmt    │   │
│     (or) streamOpenRouterToAnthropic() ── SSE translation    │   │
└──────────────────────────────────────────────────────────────┘
           │  Anthropic-format response
           ▼
   SDK receives it as if Anthropic replied. Agent loop continues.
```

---

## 3. The Three Components

### Component 1: Wrapper Package (`src/`)

An npm package (`castari-proxy`) that exports one main function: `queryCastari()`. It is a **drop-in replacement** for the SDK's `query()`. You swap the import, and nothing else in your agent code changes.

**Files:**
- `src/queryCastari.ts` — All the logic (407 lines)
- `src/index.ts` — Just re-exports `queryCastari` and helpers

### Component 2: Cloudflare Worker (`worker/`)

A stateless HTTP proxy deployed on Cloudflare's global edge network. It listens on `POST /v1/messages` and routes to either Anthropic or OpenRouter based on custom headers injected by the wrapper.

**Files:**
- `worker/src/index.ts` — Main fetch handler, routing logic
- `worker/src/translator.ts` — Anthropic ↔ OpenRouter format conversion
- `worker/src/stream.ts` — SSE streaming translation
- `worker/src/provider.ts` — Provider/model resolution, server tool categorization
- `worker/src/config.ts` — Worker config from env vars
- `worker/src/types.ts` — All TypeScript types for both APIs
- `worker/src/errors.ts` — Structured error responses
- `worker/src/utils.ts` — Header helpers, random ID generation

### Component 3: Demo App (`claude-agent-demo/`)

A full Next.js application showing a real-world integration. It uses the wrapper package and exposes a chat UI with model selection (3 Claude + 9 OpenRouter models), streaming, image upload, thinking controls, and transcript storage.

**Key files:**
- `claude-agent-demo/lib/agent/session.ts` — Builds options and calls `queryCastari()`
- `claude-agent-demo/app/api/chat/route.ts` — Next.js API route that streams results to the browser

---

## 4. The Core Trick — Three-Layer Interception

The whole system hinges on **one SDK env var**: `ANTHROPIC_BASE_URL`.

When you set `ANTHROPIC_BASE_URL=https://castari-worker.castari-proxy.workers.dev`, the SDK will POST all `/v1/messages` calls to the Castari Worker instead of Anthropic. The SDK doesn't know or care — it just follows the base URL.

But the SDK also talks to itself internally (for the Task tool / subagents) using the same env var. So the wrapper must also:
1. Make sure all subagent spawns go to the worker (not back to Anthropic directly)
2. Pass the right API key for the actual upstream provider

Here's how the three layers accomplish this:

| Layer | Where | What it does |
|-------|-------|-------------|
| 1 | Client (Node.js) | Intercepts `globalThis.fetch`, tags requests with routing headers |
| 2 | Worker (Cloudflare) | Reads routing headers, picks upstream, calls Anthropic or OpenRouter |
| 3 | Worker (Cloudflare) | Translates request/response format between Anthropic and OpenRouter APIs |

---

## 5. Layer 1 — Client-Side Fetch Hijack

**File:** `src/queryCastari.ts`

### 5.1 Entry Point: `queryCastari()`

```typescript
// src/queryCastari.ts:97-201
export function queryCastari({ prompt, options = {} }): Query {
  const model = options.model;  // e.g., "or:gpt-5-mini"
  const provider = resolveProvider(model);         // → "openrouter"
  const wireModel = resolveWireModel(model, provider); // → "openai/gpt-5-mini"
  
  // Set ANTHROPIC_API_KEY to the correct provider key
  // (OpenRouter key for OpenRouter, Anthropic key for Anthropic)
  effectiveEnv.ANTHROPIC_API_KEY = credential;  // Line 139
  
  // Point SDK at the Castari Worker, not Anthropic directly
  effectiveEnv.ANTHROPIC_BASE_URL = baseUrl;    // Line 140
  
  // Store routing context in AsyncLocalStorage
  const ctx: InterceptorContext = {
    provider,         // "openrouter"
    originalModel: model,    // "or:gpt-5-mini"
    wireModel,        // "openai/gpt-5-mini"
    reasoning,        // optional reasoning config
    ...
  };
  
  // Install fetch interceptor (once only)
  ensureInterceptorInstalled();
  
  // Run the SDK's query() with the context active in AsyncLocalStorage
  return ctxStore.run(ctx, () => query({ prompt, options: workingOptions }));
}
```

The key insight: **`ctxStore.run(ctx, ...)`** uses Node's `AsyncLocalStorage` to make the routing context available to any async code that runs within the SDK's `query()` call — including the fetch interceptor — without passing anything explicitly.

### 5.2 Provider Resolution

```typescript
// src/queryCastari.ts:64-72
export function resolveProvider(model: string): Provider {
  if (model.startsWith('or:') || model.startsWith('openrouter/')) return 'openrouter';
  if (model.startsWith('openai/'))  return 'openrouter';  // OpenAI models via OpenRouter
  if (model.startsWith('anthropic/')) return 'anthropic';
  if (model.startsWith('claude'))     return 'anthropic';
  return 'anthropic';  // default
}
```

### 5.3 Wire Model Resolution

The "wire model" is what actually gets sent to OpenRouter — the format OpenRouter understands.

```typescript
// src/queryCastari.ts:74-88
export function resolveWireModel(model: string, provider: Provider, defaultVendor = 'openai'): string {
  if (provider === 'openrouter') {
    if (model.startsWith('or:')) {
      const slug = model.slice(3);          // "gpt-5-mini"
      if (slug.includes('/')) return slug;  // already vendor-qualified
      return `${defaultVendor}/${slug}`;    // "openai/gpt-5-mini"
    }
    if (model.startsWith('openrouter/')) return model.substring('openrouter/'.length);
    if (model.startsWith('openai/')) return model;
    return model;
  }
  return model; // Anthropic: pass through unchanged
}
```

**Examples:**
| `options.model` | `provider` | `wireModel` (sent to OpenRouter) |
|-----------------|-----------|----------------------------------|
| `or:gpt-5-mini` | openrouter | `openai/gpt-5-mini` |
| `or:anthropic/claude-3-haiku` | openrouter | `anthropic/claude-3-haiku` |
| `openai/gpt-4o` | openrouter | `openai/gpt-4o` |
| `claude-sonnet-4-5-20250929` | anthropic | `claude-sonnet-4-5-20250929` |

### 5.4 The Fetch Interceptor

```typescript
// src/queryCastari.ts:204-247
function ensureInterceptorInstalled(): void {
  if (interceptorInstalled) return;  // Only wrap once globally
  
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    
    // Only intercept POST /v1/messages to the Castari Worker origin
    if (!(await shouldIntercept(request))) return originalFetch(request);

    // Get routing context from AsyncLocalStorage
    const ctx = ctxStore.getStore();
    const headers = new Headers(request.headers);

    if (ctx) {
      // Tag the request with routing instructions for the worker
      headers.set('x-castari-provider', ctx.provider);       // "openrouter"
      headers.set('x-castari-model', ctx.originalModel);     // "or:gpt-5-mini"
      headers.set('x-castari-wire-model', ctx.wireModel);    // "openai/gpt-5-mini"
      
      // Optional: worker auth token
      if (ctx.workerToken) headers.set('x-worker-token', ctx.workerToken);
      
      // Observability metadata (app name, client ID, etc.)
      if (ctx.resolvedMeta) headers.set('x-client-meta', JSON.stringify(ctx.resolvedMeta));
    }

    // Inject reasoning config into the JSON body (if configured)
    let nextBody = injectReasoningIntoPayload(await request.text(), ctx?.reasoning);

    const nextReq = new Request(request, { headers, body: nextBody });
    return originalFetch(nextReq);
  };
  
  interceptorInstalled = true;
}
```

**shouldIntercept filter** (`src/queryCastari.ts:249-259`):
```typescript
async function shouldIntercept(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  if (request.method !== 'POST') return false;
  if (url.pathname !== '/v1/messages') return false;
  // Only intercept requests to registered Castari Worker origins
  if (baseOrigins.size > 0 && !baseOrigins.has(url.origin)) return false;
  return true;
}
```

The `baseOrigins` set is populated with the origin extracted from `ANTHROPIC_BASE_URL` / `CASTARI_GATEWAY_URL`. This prevents the interceptor from tagging unrelated `fetch` calls to other URLs in your app.

### 5.5 AsyncLocalStorage: The Glue

This is the most subtle part. The SDK spawns multiple async operations internally (tool calls, retries, subagents). `AsyncLocalStorage` ensures the routing context propagates through all of them automatically — just like how a thread-local variable works in Java, but for Node.js async contexts.

```
queryCastari() sets ctxStore.run(ctx, ...)
  └─► SDK's query() starts running
        └─► SDK calls globalThis.fetch('/v1/messages')
              └─► Our interceptor runs
                    └─► ctxStore.getStore() → gets ctx ✓
                          └─► Tags headers with provider/model info
```

No explicit passing needed. Any `fetch` to `/v1/messages` within the async call tree automatically gets the correct routing headers.

---

## 6. Layer 2 — Cloudflare Worker Routing

**File:** `worker/src/index.ts`

### 6.1 Main Handler

```typescript
// worker/src/index.ts:16-78
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only handle POST /v1/messages
    if (new URL(request.url).pathname !== '/v1/messages' || request.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }

    const config = resolveConfig(env);
    const headers = normalizeCastariHeaders(request.headers); // reads x-castari-* headers
    const body = await readJsonBody<AnthropicRequest>(request);
    const authHeader = extractApiKey(request.headers); // reads x-api-key or Authorization: Bearer

    // Parse reasoning and web search from metadata.castari (injected by wrapper)
    const metadata = normalizeMetadata(body.metadata);
    const reasoning = metadata?.castari?.reasoning;
    let webSearch = metadata?.castari?.web_search_options;

    // Resolve provider: from headers (set by client wrapper) or infer from model name
    let { provider, wireModel, originalModel } = resolveProvider(headers, body, config);

    // Categorize any server tools (MCP, web search, etc.)
    const serverToolEntries = categorizeServerTools(body.tools);
    const webSearchTools = serverToolEntries.filter(e => e.kind === 'websearch');
    const otherServerTools = serverToolEntries.filter(e => e.kind === 'other');

    // Enforce: non-web-search server tools can't run on OpenRouter
    if (provider === 'openrouter' && otherServerTools.length) {
      if (config.serverToolsMode === 'error') throw invalidRequest('Server tools require Anthropic');
      if (config.serverToolsMode === 'enforceAnthropic') {
        provider = 'anthropic';  // Auto-switch to Anthropic
        wireModel = originalModel;
      }
    }

    // Enable web search plugin for OpenRouter if web search tools detected
    if (provider === 'openrouter' && webSearchTools.length && !webSearch) {
      webSearch = {};
    }

    // Route to the right upstream
    if (provider === 'anthropic') {
      return proxyAnthropic(body, request, authHeader.value, config.anthropicBaseUrl);
    }
    return handleOpenRouter({ body, wireModel, originalModel, apiKey: authHeader.value, config, reasoning, webSearch });
  }
};
```

### 6.2 Anthropic Passthrough

When the provider is Anthropic, the worker is just a transparent proxy:

```typescript
// worker/src/index.ts:96-116
async function proxyAnthropic(body, request, apiKey, upstreamUrl): Promise<Response> {
  const upstreamResp = await fetch(upstreamUrl, {  // https://api.anthropic.com/v1/messages
    method: 'POST',
    headers: buildAnthropicHeaders(request.headers, apiKey),
    body: JSON.stringify(body),   // Body is passed through unchanged
  });
  // ...stream or return the response directly
  return upstreamResp;
}

function buildAnthropicHeaders(original: Headers, apiKey: string): HeadersInit {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('x-api-key', apiKey);             // Forward the API key
  const anthropicVersion = original.get('anthropic-version');
  if (anthropicVersion) headers.set('anthropic-version', anthropicVersion);
  return headers;
  // Note: x-castari-* headers are deliberately NOT forwarded to Anthropic
}
```

### 6.3 OpenRouter Handling

```typescript
// worker/src/index.ts:138-174
async function handleOpenRouter(ctx: OpenRouterContext): Promise<Response> {
  // Translate the Anthropic-format body to OpenRouter format
  const openRouterRequest = buildOpenRouterRequest(ctx.body, {
    wireModel: ctx.wireModel,     // "openai/gpt-5-mini"
    reasoning: ctx.reasoning,     // optional reasoning config
    webSearch: ctx.webSearch,     // optional web search config
  });

  const upstreamResp = await fetch(ctx.config.openRouterBaseUrl, {
    // https://openrouter.ai/api/v1/chat/completions
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ctx.apiKey}`,  // Forward the OpenRouter API key
    },
    body: JSON.stringify(openRouterRequest),
  });

  if (ctx.body.stream) {
    // Translate SSE stream from OpenRouter format to Anthropic SSE format
    return streamOpenRouterToAnthropic(upstreamResp, { originalModel: ctx.originalModel });
  }

  // Non-streaming: translate the JSON response
  const json = await upstreamResp.json();
  const responseBody = mapOpenRouterResponse(json, ctx.originalModel);
  // Note: response model field is set to ctx.originalModel ("or:gpt-5-mini")
  // so the SDK sees the same model name it requested
  return new Response(JSON.stringify(responseBody), { status: 200, ... });
}
```

### 6.4 Provider & Model Resolution in the Worker

```typescript
// worker/src/provider.ts:45-75
export function resolveProvider(headers, body, config): ProviderResolution {
  const originalModel = body.model;
  
  // Primary: trust the header set by the client wrapper
  const provider = headers.provider ?? inferProviderFromModel(originalModel);
  
  const wireModel = provider === 'openrouter'
    ? resolveOpenRouterModel(headers.wireModel ?? originalModel, config.defaultOpenRouterVendor)
    : originalModel;
    
  return { provider, wireModel, originalModel };
}

// Fallback when no header: infer from model string (same logic as client)
function inferProviderFromModel(model: string): Provider {
  const normalized = model.toLowerCase();
  if (normalized.startsWith('claude') || normalized.startsWith('anthropic/')) return 'anthropic';
  if (normalized.startsWith('or:') || normalized.startsWith('openrouter/') || normalized.startsWith('openai/')) return 'openrouter';
  return 'anthropic';
}
```

The worker also does its own provider inference as a fallback, so it works even if the client wrapper headers are absent (e.g., when used directly as an API gateway).

---

## 7. Layer 3 — API Format Translation

**File:** `worker/src/translator.ts`

This is where the deepest technical work happens. The Anthropic Messages API and the OpenRouter/OpenAI Chat Completions API are structurally different. Every field must be mapped.

### 7.1 Anthropic Request → OpenRouter Request

```typescript
// worker/src/translator.ts:30-58
export function buildOpenRouterRequest(body: AnthropicRequest, options): OpenRouterRequest {
  const request: OpenRouterRequest = {
    model: options.wireModel,         // "openai/gpt-5-mini" (not the original "or:gpt-5-mini")
    messages: convertMessages(body),  // Anthropic messages → OpenRouter messages
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stop: body.stop_sequences,       // Anthropic "stop_sequences" → OpenRouter "stop"
    stream: body.stream ?? false,
  };

  const clientTools = convertTools(body.tools);  // Filter out server tools, convert format
  if (clientTools.length) request.tools = clientTools;
  
  const toolChoice = convertToolChoice(body.tool_choice);
  if (toolChoice) request.tool_choice = toolChoice;

  if (options.reasoning) request.reasoning = options.reasoning;  // Pass through reasoning config

  if (options.webSearch) {
    // OpenRouter web search via plugins API
    request.plugins = [{ id: 'web', engine: options.webSearch.engine, max_results: options.webSearch.max_results }];
    request.web_search_options = options.webSearch;
  }

  return request;
}
```

### 7.2 Message Format Conversion

Anthropic and OpenRouter have different message structures:

**Anthropic format:**
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is 2+2?" },
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "..." } }
  ]
}
```

**OpenRouter format:**
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is 2+2?" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

The translator handles this (`worker/src/translator.ts:60-123`):

```typescript
function convertMessage(message: AnthropicMessage): OpenRouterMessage[] {
  // Split content into three buckets
  const textSegments = [];    // regular text/image content
  const toolResults = [];     // tool_result blocks (user's response to tool calls)
  const toolUses = [];        // tool_use blocks (assistant's tool call requests)

  for (const segment of segments) {
    if (segment.type === 'tool_result') toolResults.push(segment);
    else if (segment.type === 'tool_use') toolUses.push(segment);
    else textSegments.push(segment);
  }

  const resolved: OpenRouterMessage[] = [];

  // Regular content → user/assistant message
  if (textSegments.length) {
    resolved.push({ role: message.role, content: convertContentParts(textSegments) });
  }

  // Tool use (assistant) → OpenRouter tool_calls format
  if (message.role === 'assistant' && toolUses.length) {
    resolved.push({
      role: 'assistant',
      content: '',
      tool_calls: toolUses.map(item => ({
        id: item.id,
        type: 'function',
        function: {
          name: item.name,
          arguments: JSON.stringify(item.input),  // Anthropic: object → OpenRouter: string
        }
      }))
    });
  }

  // Tool results (user) → OpenRouter "tool" role messages
  for (const result of toolResults) {
    resolved.push({
      role: 'tool',                          // Different role name!
      tool_call_id: result.tool_use_id,      // ID linking result to the call
      content: deriveToolResultContent(result),
    });
  }

  return resolved;
}
```

The system message is also different — Anthropic has a top-level `system` field, OpenRouter embeds it as the first message with `role: "system"`:

```typescript
// worker/src/translator.ts:60-69
function convertMessages(body: AnthropicRequest): OpenRouterMessage[] {
  const output: OpenRouterMessage[] = [];
  if (body.system) {
    output.push({ role: 'system', content: stringifySystem(body.system) }); // Moved into messages array
  }
  for (const message of body.messages) {
    output.push(...convertMessage(message));
  }
  return output;
}
```

### 7.3 Tool Definition Conversion

```typescript
// worker/src/translator.ts:148-164
function convertTools(tools?: AnthropicToolDefinition[]): OpenRouterToolDefinition[] {
  const converted = [];
  for (const tool of tools) {
    if (isServerTool(tool)) continue;  // Skip web search, MCP, computer use, etc.
    converted.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,  // Anthropic "input_schema" → OpenRouter "parameters"
      }
    });
  }
  return converted;
}
```

**Anthropic tool format:**
```json
{ "name": "get_weather", "description": "...", "input_schema": { "type": "object", "properties": {...} } }
```

**OpenRouter tool format:**
```json
{ "type": "function", "function": { "name": "get_weather", "description": "...", "parameters": {...} } }
```

### 7.4 OpenRouter Response → Anthropic Response

```typescript
// worker/src/translator.ts:193-232
export function mapOpenRouterResponse(providerResponse: OpenRouterResponse, originalModel: string): AnthropicResponse {
  const choice = providerResponse.choices[0];
  const content: AnthropicContent[] = [];

  // Regular text content
  if (choice.message?.content) {
    content.push(...convertOpenRouterContent(choice.message.content));
  }

  // Tool calls → Anthropic tool_use blocks
  if (choice.message?.tool_calls) {
    for (const call of choice.message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments),  // OpenRouter: string → Anthropic: object
      });
    }
  }

  return {
    id: providerResponse.id ?? randomId('msg'),
    type: 'message',
    role: 'assistant',
    model: originalModel,    // ← KEY: "or:gpt-5-mini", NOT "openai/gpt-5-mini"
    stop_reason: mapStopReason(choice.finish_reason),
    stop_sequence: null,
    content,
    usage: {
      input_tokens: providerResponse.usage.prompt_tokens,
      output_tokens: providerResponse.usage.completion_tokens,
      reasoning_tokens: providerResponse.usage.reasoning_tokens,
    }
  };
}
```

Notice `model: originalModel` — the response tells the SDK the model is `or:gpt-5-mini` (what the caller specified), not `openai/gpt-5-mini` (what was actually sent to OpenRouter). The SDK sees a consistent model name throughout.

### 7.5 Stop Reason Mapping

```typescript
// worker/src/translator.ts:253-267
export function mapStopReason(reason: string | null): string | null {
  switch (reason) {
    case 'stop':           return 'end_turn';       // OpenRouter → Anthropic
    case 'tool_calls':     return 'tool_use';        // OpenRouter → Anthropic
    case 'length':         return 'max_tokens';      // OpenRouter → Anthropic
    case 'content_filter': return 'content_filter';  // Same
    default:               return reason;
  }
}
```

---

## 8. Streaming SSE Translation

**File:** `worker/src/stream.ts`

Streaming is significantly more complex because OpenRouter sends events in OpenAI's SSE format, but the SDK expects Anthropic's SSE format. The two have completely different event structures.

**Anthropic SSE events** (what the SDK expects):
```
event: message_start
data: {"type":"message_start","message":{"id":"...","type":"message","role":"assistant","model":"or:gpt-5-mini","content":[]}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"usage":{"input_tokens":10,"output_tokens":5}}}

event: message_stop
data: {"type":"message_stop","stop_reason":"end_turn"}
```

**OpenRouter SSE events** (what OpenRouter sends):
```
data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"get_weather","arguments":"{\"city\""}}]},"finish_reason":null}]}

data: {"id":"chatcmpl-...","choices":[{"finish_reason":"tool_calls"}],"usage":{...}}

data: [DONE]
```

The `streamOpenRouterToAnthropic` function (`worker/src/stream.ts:17-201`) handles this translation:

### 8.1 Stream Initialization

```typescript
export function streamOpenRouterToAnthropic(upstream: Response, options: StreamOptions): Response {
  const messageId = randomId('msg');
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      // Always start with message_start (required by Anthropic protocol)
      send('message_start', {
        type: 'message_start',
        message: { id: messageId, type: 'message', role: 'assistant', model: options.originalModel, content: [] }
      });

      // State tracking
      let textBlockOpen = false;
      let accumulatedStopReason: string | null = null;
      const toolBlocks = new Map<string, ToolBlockState>(); // Track in-progress tool calls
```

### 8.2 Text Streaming

```typescript
      // Lazy-open a text block only when text arrives
      const ensureTextBlock = () => {
        if (!textBlockOpen) {
          textBlockOpen = true;
          send('content_block_start', {
            type: 'content_block_start', index: 0,
            content_block: { type: 'text', text: '' }
          });
        }
      };

      const handleChunk = (json: any) => {
        const choice = json?.choices?.[0];
        if (choice?.delta?.content) {
          ensureTextBlock();
          send('content_block_delta', {
            type: 'content_block_delta', index: 0,
            delta: { type: 'text_delta', text: choice.delta.content }
          });
        }
```

### 8.3 Tool Call Streaming (the Hard Part)

OpenRouter streams tool calls in fragments across multiple SSE events. The function must buffer and assemble them:

```typescript
      interface ToolBlockState {
        index: number;   // Position in content array (text=0, tools=1,2,3...)
        name: string;    // Tool function name
        id: string;      // Tool call ID (e.g., "call_abc123")
        buffer: string;  // Accumulated JSON arguments
        open: boolean;   // Whether content_block_start was sent
      }

      const ensureToolBlock = (call: OpenRouterToolCall): ToolBlockState => {
        let state = toolBlocks.get(call.id);
        if (!state) {
          const index = toolBlocks.size + 1; // text block is at 0, tools at 1, 2, ...
          state = { index, name: call.function.name, id: call.id, buffer: '', open: false };
          toolBlocks.set(call.id, state);
        }
        if (!state.open) {
          state.open = true;
          send('content_block_start', {
            type: 'content_block_start', index: state.index,
            content_block: { type: 'tool_use', id: state.id, name: state.name, input: {} }
          });
        }
        return state;
      };

      const handleToolCalls = (toolCalls?: OpenRouterToolCall[]) => {
        for (const call of toolCalls) {
          const state = ensureToolBlock(call);
          if (call.function.arguments) {
            state.buffer += call.function.arguments;  // Accumulate JSON fragments
            send('content_block_delta', {
              type: 'content_block_delta', index: state.index,
              delta: { type: 'input_json_delta', partial_json: call.function.arguments }
            });
          }
        }
      };
```

### 8.4 SSE Parsing Loop

```typescript
      // Read the upstream SSE stream byte by byte
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE events (delimited by \n\n)
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          processEvent(rawEvent.trim());
          boundary = buffer.indexOf('\n\n');
        }
      }

      // Finalize: close all open blocks
      flushTextBlockStop();     // content_block_stop for text
      finalizeToolBlocks();     // content_block_stop for each tool

      send('message_stop', {
        type: 'message_stop',
        stop_reason: accumulatedStopReason ?? 'end_turn'
      });
      controller.close();
```

---

## 9. Model Naming Convention & Provider Resolution

The naming convention is the user-facing contract. It's consistent between client (`src/queryCastari.ts`) and worker (`worker/src/provider.ts`).

| Model string you pass | Provider | What gets sent to upstream |
|-----------------------|---------|---------------------------|
| `claude-sonnet-4-5-20250929` | `anthropic` | `claude-sonnet-4-5-20250929` |
| `claude-haiku-4-5-20251001` | `anthropic` | `claude-haiku-4-5-20251001` |
| `or:gpt-5-mini` | `openrouter` | `openai/gpt-5-mini` |
| `or:anthropic/claude-3-haiku` | `openrouter` | `anthropic/claude-3-haiku` |
| `or:meta-llama/llama-3.1-8b-instruct` | `openrouter` | `meta-llama/llama-3.1-8b-instruct` |
| `openai/gpt-4o` | `openrouter` | `openai/gpt-4o` |
| `openrouter/mistralai/mistral-7b` | `openrouter` | `mistralai/mistral-7b` |

The `or:` prefix is the primary shorthand. When you write `or:some-model`, it becomes `openai/some-model` by default (configurable via `OPENROUTER_DEFAULT_VENDOR`).

---

## 10. Subagent Model Inheritance (Task Tool)

When the SDK's **Task tool** is used, the agent spawns a subagent to handle a subtask. The subagent also calls the Claude Agent SDK internally, but it uses a *different* model env var: `CLAUDE_CODE_SUBAGENT_MODEL`.

**The problem:** If your main model is `or:gpt-5-mini` (OpenRouter) but the subagent defaults to `claude-haiku` (Anthropic), the subagent will try to call Anthropic using your OpenRouter key — which will fail.

**The solution** (`src/queryCastari.ts:159-170`):

```typescript
const resolvedSubagentModel = resolveSubagentModel({
  requested: subagentModel ?? effectiveEnv.CASTARI_SUBAGENT_MODEL,
  fallback: model,  // Default to the same model as the parent
});

// Set the subagent model so the SDK's Task tool picks it up
effectiveEnv.CLAUDE_CODE_SUBAGENT_MODEL = resolvedSubagentModel;

// Also set it in process.env so nested processes inherit it
const globalEnv = getProcessEnv();
if (globalEnv && !globalEnv.CLAUDE_CODE_SUBAGENT_MODEL) {
  globalEnv.CLAUDE_CODE_SUBAGENT_MODEL = resolvedSubagentModel;
}
```

**The `inherit` keyword** (`src/queryCastari.ts:397-406`):

```typescript
const CLAUDE_TIER_ALIASES: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-1-20240808',
};

function resolveSubagentModel(params: SubagentResolutionParams): string {
  const input = params.requested?.trim() ?? '';
  if (!input) return params.fallback;
  
  // "inherit" / "auto" / "default" → use the same model as the parent
  if (input.toLowerCase() === 'inherit' || input.toLowerCase() === 'auto') {
    return params.fallback;
  }
  
  // Short aliases → full Claude model IDs
  const alias = CLAUDE_TIER_ALIASES[input.toLowerCase()];
  return alias ?? input;
}
```

**Recommendation from README:** Always set `CASTARI_SUBAGENT_MODEL=inherit`. This ensures all subagents use the same provider and model as the main agent — avoiding cross-provider key mismatches.

---

## 11. Server Tool Policy Enforcement

Anthropic has "server tools" — special tools that run server-side rather than client-side. Examples: `web_search`, `computer_use`, `code_execution`, `text_editor`. These are Anthropic-specific and cannot be forwarded to OpenRouter.

**Detection** (`worker/src/provider.ts:103-124`):

```typescript
// Detects by tool type or name pattern
export function isServerTool(tool: AnthropicToolDefinition): boolean {
  const type = tool.type;
  if (type && /Tool_|Tool$/i.test(type)) return true;  // e.g., "computer_use_20241022"
  const name = tool.name?.toLowerCase();
  if (!name) return false;
  if (/Tool_|Tool$/i.test(name)) return true;
  if (SERVER_TOOL_ALIAS.has(name)) return true;  // websearch, webfetch, codeexecution, etc.
  return false;
}

const SERVER_TOOL_ALIAS = new Set([
  'websearch', 'webfetch', 'codeexecution', 'computeruse', 'texteditor', 'memorytool'
]);
```

**Enforcement policy** (configurable via `SERVER_TOOLS_MODE` env var):

| Mode | Behavior |
|------|----------|
| `error` (default) | Return 400 error if server tools used with OpenRouter |
| `enforceAnthropic` | Auto-switch to Anthropic provider |
| `emulate` | (future) Client-side emulation |

**Web search special case:** Web search is a server tool but *can* be handled via OpenRouter's plugins API. The worker detects web search tools and converts them to OpenRouter `plugins: [{ id: "web" }]` rather than erroring:

```typescript
// worker/src/index.ts:50-55
if (provider === 'openrouter') {
  const wantsWebSearch = webSearchTools.length > 0;
  if (wantsWebSearch && !webSearch) {
    webSearch = {};  // Enable OpenRouter web search plugin
  }
}
```

**Tool filtering in translation** (`worker/src/translator.ts:148-164`):
Server tools are stripped from OpenRouter requests entirely (they have no OpenRouter equivalent):

```typescript
function convertTools(tools): OpenRouterToolDefinition[] {
  for (const tool of tools) {
    if (isServerTool(tool)) continue;  // Skip — no OpenRouter equivalent
    converted.push({ type: 'function', function: { name: tool.name, ... } });
  }
}
```

---

## 12. Reasoning Config Injection

Models like Claude (extended thinking) and some OpenRouter models support a "reasoning" parameter that controls how much "thinking" the model does before answering.

The reasoning config is injected **into the request body's `metadata.castari.reasoning` field** by the client wrapper, then extracted by the worker.

**Injection** (`src/queryCastari.ts:325-353`):

```typescript
function injectReasoningIntoPayload(raw: string, reasoning?: ReasoningConfig): string | null {
  if (!reasoning) return null;
  const payload = JSON.parse(raw);
  
  // Nest into metadata.castari.reasoning
  const metadata = payload.metadata ?? {};
  const castari = metadata.castari ?? {};
  
  const r: Record<string, unknown> = {};
  if (reasoning.effort) r.effort = reasoning.effort;          // "low" | "medium" | "high" | "max"
  if (reasoning.maxTokens) r.max_tokens = reasoning.maxTokens;
  if (reasoning.exclude) r.exclude = reasoning.exclude;       // Exclude thinking from response
  if (reasoning.summary) r.summary = reasoning.summary;       // "concise" | "detailed" | "none"
  
  castari.reasoning = r;
  metadata.castari = castari;
  payload.metadata = metadata;
  return JSON.stringify(payload);
}
```

**Extraction in worker** (`worker/src/index.ts:27-29`):

```typescript
const metadata = normalizeMetadata(body.metadata);
const reasoning = metadata?.castari?.reasoning;  // Read from metadata
```

**Forwarding to OpenRouter** (`worker/src/translator.ts:50`):

```typescript
if (options.reasoning) request.reasoning = options.reasoning;  // Passed to OpenRouter as-is
```

**Reasoning priority cascade** (`src/queryCastari.ts:142-152`):
Reasoning settings are resolved from multiple sources in priority order:

1. `options.reasoning.effort` (explicit, per-call)
2. `options.reasoningEffort` (shorthand)
3. `options.meta.reasoningEffort` (in metadata)
4. `CASTARI_REASONING_EFFORT` env var (global default)

---

## 13. Configuration & Deployment

**File:** `worker/src/config.ts` and `worker/wrangler.toml`

### Worker Config

```typescript
// worker/src/config.ts:14-28
export function resolveConfig(env: Env): WorkerConfig {
  return {
    // Upstream endpoints (configurable for AI Gateway, etc.)
    anthropicBaseUrl: normalizeBaseUrl(
      env.UPSTREAM_ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
      '/v1/messages'
    ),
    openRouterBaseUrl: normalizeBaseUrl(
      env.UPSTREAM_OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api',
      '/v1/chat/completions'
    ),
    serverToolsMode: normalizeServerToolsMode(env.SERVER_TOOLS_MODE), // 'error' | 'enforceAnthropic' | 'emulate'
    mcpMode: normalizeMcpMode(env.MCP_BRIDGE_MODE),  // 'off' | 'http-sse'
    defaultOpenRouterVendor: env.OPENROUTER_DEFAULT_VENDOR?.trim() || 'openai',
  };
}
```

### Deployment Config (`wrangler.toml`)

```toml
name = "castari-worker"
main = "src/index.ts"
account_id = "6444e0f9662766ec34cfeef001af3549"
workers_dev = true
compatibility_date = "2024-10-01"
compatibility_flags = ["nodejs_compat"]

[vars]
SERVER_TOOLS_MODE = "emulate"
MCP_BRIDGE_MODE = "off"
OPENROUTER_DEFAULT_VENDOR = "openai"
UPSTREAM_ANTHROPIC_BASE_URL = "https://api.anthropic.com"
UPSTREAM_OPENROUTER_BASE_URL = "https://openrouter.ai/api"
```

The worker is deployed to Cloudflare at:
`https://castari-worker.castari-proxy.workers.dev`

### API Keys Flow

**Important security design:** API keys are never stored in the worker. They flow through in every request:

1. Client sets `ANTHROPIC_API_KEY` in env (could be an Anthropic key or an OpenRouter key)
2. The SDK sends it as `x-api-key: <key>` in every request
3. The wrapper intercepts and sets `ANTHROPIC_API_KEY` to the correct provider key
4. The worker reads it from the `x-api-key` / `Authorization: Bearer` header
5. The worker forwards it directly to the chosen upstream
6. Nothing is logged or persisted server-side

---

## 14. The Demo App — End-to-End Flow

**Files:** `claude-agent-demo/lib/agent/session.ts`, `claude-agent-demo/app/api/chat/route.ts`

### Building Options (`session.ts`)

```typescript
// claude-agent-demo/lib/agent/session.ts:20-58
export function buildOptions(config: QueryRuntimeConfig = {}): CastariOptions {
  const policy = buildPolicy(config.mode ?? 'safe');  // Tool permissions
  const mcpServers = buildMcpServers();
  
  const envOverrides: Record<string, string> = {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,          // Could be Anthropic or OpenRouter key
    ANTHROPIC_BASE_URL: env.CASTARI_WORKER_URL,         // Points SDK at the Castari Worker
    CASTARI_GATEWAY_URL: env.CASTARI_WORKER_URL
  };

  if (env.OPENROUTER_API_KEY) envOverrides.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
  if (env.CASTARI_WORKER_TOKEN) envOverrides.X_WORKER_TOKEN = env.CASTARI_WORKER_TOKEN;
  if (env.CASTARI_SUBAGENT_MODEL) envOverrides.CASTARI_SUBAGENT_MODEL = env.CASTARI_SUBAGENT_MODEL;

  const options: Options = {
    model: config.model ?? env.CLAUDE_MODEL ?? 'claude-sonnet-4-5-20250929',
    env: envOverrides,
    permissionMode: env.AGENT_PERMISSION_MODE ?? 'default',
    allowedTools: policy.allowedTools,
    disallowedTools: policy.disallowedTools,
    mcpServers,
    ...
  };

  if (config.thinking?.enabled) {
    options.maxThinkingTokens = config.thinking.budgetTokens;
  }

  return options as CastariOptions;
}

export function startQuery(prompt: QueryPrompt, config: QueryRuntimeConfig = {}) {
  return queryCastari({ prompt, options: buildOptions(config) });
}
```

### The API Route (`route.ts`)

```typescript
// claude-agent-demo/app/api/chat/route.ts:55-148
export async function POST(req: NextRequest) {
  const { message, model, sessionId, thinking } = payload.body;
  
  // Build user message (text + optional images)
  const userMessage = buildUserMessageContent(message, images);
  
  // Create async iterable prompt stream
  const promptStream = buildPromptStream(userMessage);
  
  // Start the agent query
  const query = startQuery(promptStream, { mode, model, sessionId, thinking });

  // Stream results to browser as NDJSON
  const stream = new ReadableStream({
    async start(controller) {
      for await (const message of query) {
        const events = mapMessageToUIEvents(message);
        for (const event of events) {
          await recordTranscriptEntry(message, event);           // Save to transcript store
          controller.enqueue(encodeEvent(event, encoder));       // Send to browser
        }
      }
      controller.close();
    },
    cancel() {
      query.interrupt?.().catch(() => {}); // Handle browser disconnect
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
```

---

## 15. Complete Request Lifecycle Walkthrough

Let's trace a single query: `queryCastari({ prompt: "What is 2+2?", options: { model: "or:gpt-5-mini" } })`

### Step 1: `queryCastari()` runs

- `resolveProvider("or:gpt-5-mini")` → `"openrouter"`
- `resolveWireModel("or:gpt-5-mini", "openrouter")` → `"openai/gpt-5-mini"`
- Picks `OPENROUTER_API_KEY` as the credential
- Sets `effectiveEnv.ANTHROPIC_API_KEY = sk-or-...` (the OpenRouter key)
- Sets `effectiveEnv.ANTHROPIC_BASE_URL = https://castari-worker.castari-proxy.workers.dev`
- Creates `ctx = { provider: "openrouter", originalModel: "or:gpt-5-mini", wireModel: "openai/gpt-5-mini" }`
- Runs `ctxStore.run(ctx, () => query({ prompt, options }))` → SDK takes over

### Step 2: SDK builds and sends the request

SDK creates an Anthropic-format request body:
```json
{
  "model": "or:gpt-5-mini",
  "messages": [{ "role": "user", "content": "What is 2+2?" }],
  "max_tokens": 8096,
  "stream": true
}
```

SDK calls `fetch("https://castari-worker.castari-proxy.workers.dev/v1/messages", { method: "POST", body: ... })`

### Step 3: Fetch interceptor activates

`shouldIntercept` returns `true` (POST to `/v1/messages` at the registered origin).

`ctxStore.getStore()` returns the `ctx` from Step 1.

Interceptor adds headers:
```
x-castari-provider: openrouter
x-castari-model: or:gpt-5-mini
x-castari-wire-model: openai/gpt-5-mini
x-api-key: sk-or-...  (set by the SDK from ANTHROPIC_API_KEY env)
```

Interceptor calls `originalFetch` with the tagged request → request travels to Cloudflare.

### Step 4: Cloudflare Worker receives the request

- `normalizeCastariHeaders` reads `x-castari-*` headers
- `resolveProvider` returns `{ provider: "openrouter", wireModel: "openai/gpt-5-mini", originalModel: "or:gpt-5-mini" }`
- No server tools in this request → no policy enforcement needed
- `provider === 'openrouter'` → calls `handleOpenRouter()`

### Step 5: `buildOpenRouterRequest()` translates the body

Input (Anthropic format):
```json
{
  "model": "or:gpt-5-mini",
  "messages": [{ "role": "user", "content": "What is 2+2?" }],
  "stream": true
}
```

Output (OpenRouter format):
```json
{
  "model": "openai/gpt-5-mini",
  "messages": [{ "role": "user", "content": "What is 2+2?" }],
  "stream": true
}
```

### Step 6: Worker fetches from OpenRouter

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer sk-or-...
Content-Type: application/json

{ "model": "openai/gpt-5-mini", "messages": [...], "stream": true }
```

### Step 7: Streaming response translation

OpenRouter sends SSE:
```
data: {"choices":[{"delta":{"content":"4"},"finish_reason":null}]}
data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":1}}
data: [DONE]
```

`streamOpenRouterToAnthropic()` converts to Anthropic SSE:
```
event: message_start
data: {"type":"message_start","message":{"id":"msg_abc","model":"or:gpt-5-mini",...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"4"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"usage":{"input_tokens":10,"output_tokens":1}}}

event: message_stop
data: {"type":"message_stop","stop_reason":"end_turn"}
```

### Step 8: SDK receives and processes the response

The SDK reads the Anthropic SSE stream. It sees `model: "or:gpt-5-mini"` in the response — the same model it sent. It has no idea it actually called GPT-5-mini via OpenRouter.

The SDK yields messages from the `query()` async iterable. Your `for await (const message of query)` loop receives them.

---

## 16. Key File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/queryCastari.ts` | 1-407 | Main client wrapper. Provider resolution, fetch interception, reasoning injection, subagent model management |
| `src/queryCastari.ts:64-72` | — | `resolveProvider()` — maps model name to provider |
| `src/queryCastari.ts:74-88` | — | `resolveWireModel()` — maps model name to upstream format |
| `src/queryCastari.ts:92-95` | — | `installCastariInterceptor()` — public API to install interceptor without `queryCastari` |
| `src/queryCastari.ts:97-201` | — | `queryCastari()` — main entry point |
| `src/queryCastari.ts:204-247` | — | `ensureInterceptorInstalled()` — wraps `globalThis.fetch` |
| `src/queryCastari.ts:249-259` | — | `shouldIntercept()` — filter for which requests to tag |
| `src/queryCastari.ts:325-353` | — | `injectReasoningIntoPayload()` — embeds reasoning config in request body |
| `src/queryCastari.ts:391-406` | — | `resolveSubagentModel()` — handles `inherit`, aliases, explicit models |
| `worker/src/index.ts` | 1-175 | Worker entry point. Request routing, authentication |
| `worker/src/index.ts:16-78` | — | Main fetch handler — the worker's entire routing logic |
| `worker/src/index.ts:96-116` | — | `proxyAnthropic()` — passthrough to Anthropic |
| `worker/src/index.ts:138-174` | — | `handleOpenRouter()` — translate & forward to OpenRouter |
| `worker/src/translator.ts` | 1-268 | Bidirectional API format translation |
| `worker/src/translator.ts:30-58` | — | `buildOpenRouterRequest()` — Anthropic body → OpenRouter body |
| `worker/src/translator.ts:60-123` | — | Message format conversion (including tool_use, tool_result) |
| `worker/src/translator.ts:148-164` | — | `convertTools()` — strips server tools, converts format |
| `worker/src/translator.ts:193-232` | — | `mapOpenRouterResponse()` — OpenRouter response → Anthropic response |
| `worker/src/translator.ts:253-267` | — | `mapStopReason()` — stop reason string mapping |
| `worker/src/stream.ts` | 1-201 | SSE streaming translation (OpenRouter → Anthropic SSE format) |
| `worker/src/stream.ts:67-83` | — | `ensureToolBlock()` — opens a new tool_use content block |
| `worker/src/stream.ts:85-98` | — | `handleToolCalls()` — buffers streaming tool call fragments |
| `worker/src/stream.ts:136-149` | — | `finalizeToolBlocks()` — closes all open tool blocks at stream end |
| `worker/src/provider.ts` | 1-125 | Provider resolution and server tool detection |
| `worker/src/provider.ts:45-57` | — | `resolveProvider()` — reads headers, falls back to model name inference |
| `worker/src/provider.ts:82-97` | — | `categorizeServerTools()` — web search vs other server tools |
| `worker/src/provider.ts:103-112` | — | `isServerTool()` — detects Anthropic-specific tools |
| `worker/src/config.ts` | 1-57 | Worker config from env vars |
| `worker/src/types.ts` | 1-206 | TypeScript types for both Anthropic and OpenRouter APIs |
| `worker/src/errors.ts` | 1-72 | Structured error types and `errorResponse()` helper |
| `worker/src/utils.ts` | 1-62 | Header helpers, `normalizeCastariHeaders()`, `randomId()` |
| `worker/wrangler.toml` | 1-14 | Cloudflare Worker deployment config |
| `claude-agent-demo/lib/agent/session.ts` | 1-66 | Demo: builds `CastariOptions`, calls `queryCastari()` |
| `claude-agent-demo/app/api/chat/route.ts` | 1-204 | Demo: Next.js API route, validates request, streams results |

---

## 17. Is This Legal?

Short answer: **yes, with awareness**.

### What is actually happening

1. **Your own API keys are used.** You supply your own `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`. The worker forwards them directly to the respective upstream. No key sharing or impersonation of another user.

2. **OpenRouter is a legitimate service.** OpenRouter (`openrouter.ai`) is a legal API aggregator with documented agreements with model providers. Using it is standard practice.

3. **You pay for what you use.** Each call to OpenRouter via Castari is billed to your OpenRouter account. Each call to Anthropic is billed to your Anthropic account.

4. **No data is stored.** The worker is stateless. No prompts, responses, or keys are logged or persisted by default.

### Potential gray areas

| Concern | Reality |
|---------|---------|
| Anthropic SDK ToS | The SDK's ToS primarily governs Anthropic API usage. Redirecting traffic to other providers via `ANTHROPIC_BASE_URL` is an env hook the SDK explicitly provides. However, Anthropic's ToS does not explicitly authorize or prohibit this pattern. |
| "Passing off" responses as Claude | The response format is Anthropic-compatible, but this is a protocol format, not a claim of being Claude. Your app knows it called `or:gpt-5-mini`. |
| OpenRouter's upstream agreements | OpenRouter handles the legal agreements with OpenAI, Google, Meta, etc. As an OpenRouter customer, you're downstream of those agreements. |
| Self-hosting the worker | Completely fine. You deploy to your own Cloudflare account with your own account ID. |

### Analogous patterns in the industry

This proxy pattern is widely used and well-established:
- **LiteLLM** — routes to any provider via OpenAI format
- **LangChain** — provider-agnostic agent framework
- **AWS Bedrock / Azure OpenAI** — provider wrappers used by millions

Castari Proxy is simply a more targeted version: it specifically preserves the **Claude Agent SDK's** interface while allowing model substitution underneath.

---

*Generated from a full read of the castari-proxy source code. All file paths and line numbers are accurate as of the codebase at time of writing.*
