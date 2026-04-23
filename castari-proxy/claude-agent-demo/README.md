# Atto — AI Test Case Generator (Next.js App)

This branch is the dedicated **Cloudflare demo deployment**. The UI is locked to Cloudflare mode so this branch can be deployed as a single-purpose showcase.

This is the main application. It uses the **Claude Agent SDK** with a self-hosted proxy to generate XML test case files from plain-English prompts, with support for any AI model — Claude, Gemini, GPT-4o, Llama, and more.

For demo deployments, you can pin the UI to a single proxy path with:

```env
NEXT_PUBLIC_ATTO_DEMO_MODE=cloudflare
```

or

```env
NEXT_PUBLIC_ATTO_DEMO_MODE=portkey
```

When that variable is set, the sidebar shows a fixed mode badge and hides the runtime toggle so each deployment can represent one clean architecture story.

## Quick Start

```bash
npm install
cp .env.example .env.local   # fill in your keys (see below)
npm run dev                  # http://localhost:3000
```

## Environment Variables

```env
# Required — get from console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-...

# Required for non-Claude models — get from openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-v1-...

# Your deployed Cloudflare Worker URL (see worker/ README for how to deploy)
CASTARI_WORKER_URL=https://atto-proxy.YOUR-SUBDOMAIN.workers.dev
PORTKEY_API_KEY=pk-...
NEXT_PUBLIC_ATTO_DEMO_MODE=cloudflare
```

## Project Layout

```
app/
├── api/
│   ├── generate/route.ts     ← POST /api/generate — starts the agent, streams events
│   └── workspace/route.ts    ← GET/DELETE /api/workspace — list & clear XML files
├── components/
│   ├── AttoChat.tsx          ← Main UI component (sidebar + chat + file panel)
│   └── Chat.tsx              ← Original generic chat (kept for reference)
└── page.tsx                  ← Entry point — renders AttoChat

lib/
├── agent/
│   ├── atto-session.ts       ← Builds agent session: system prompt, allowed tools, model routing
│   ├── atto-config.ts        ← Model list and app-type options (no Node.js imports — safe for browser)
│   ├── events.ts             ← Maps Claude Agent SDK messages → UI events
│   └── session.ts            ← Generic session builder (used by original chat)
├── castariProxy.ts           ← queryCastari() — wraps SDK query(), injects routing headers
├── policy/
│   ├── permission.ts         ← Tool allow-list + path jail for Write tool
│   └── paths.ts              ← ensureInside() — prevents path traversal attacks
└── env.ts                    ← Validated environment config (zod)
```

## How a Request Flows

```
User types prompt → clicks Generate
        │
        ▼
POST /api/generate
  { query: "...", model: "or:google/gemini-2.5-flash", appType: "web" }
        │
        ▼
startAttoQuery()
  Builds Options:
    - systemPrompt: Atto instructions (XML format, workspace path, tool usage rules)
    - allowedTools: ['Read', 'Write', 'Glob', 'Grep']
    - canUseTool:   path-jails Write to .data/workspace/
    - model:        "or:google/gemini-2.5-flash"
        │
        ▼
queryCastari()
  - Reads model prefix → resolves provider (openrouter)
  - Patches globalThis.fetch to intercept /v1/messages calls
  - Adds headers: x-castari-provider, x-castari-model, x-castari-wire-model
        │
        ▼
Claude Agent SDK — query()
  Spawns agent subprocess, begins conversation
        │
        ▼
[Every fetch to /v1/messages is intercepted]
        │
        ▼
Your Cloudflare Worker (atto-proxy)
  Reads headers → routes to OpenRouter
  Translates Anthropic format → OpenRouter Chat Completions
        │
        ▼
OpenRouter → Gemini 2.5 Flash
        │
        ▼ (response)
Worker translates back → Anthropic format
        │
        ▼
SDK receives response, executes tool calls (Read/Write/Glob)
  Write tool: path rewritten to .data/workspace/test_name.xml
        │
        ▼
Events streamed as JSONL to browser:
  { type: "tool", data: { name: "Write", status: "call", input: { file_path, content } } }
  { type: "partial", data: { textDelta: "..." } }
  { type: "result", data: { usage, total_cost_usd } }
        │
        ▼
AttoChat.tsx
  - Tool events → displayed in chat, XML extracted → right panel
  - Partial events → streamed into assistant message
  - Result event → cost displayed in sidebar
```

## Tool Policy (permission.ts)

The `atto` mode allows only these tools:

| Tool | Purpose | Path restriction |
|------|---------|-----------------|
| `Read` | Read existing files | Must be inside project directory |
| `Write` | Write new XML files | Forced into `.data/workspace/` — agent cannot escape |
| `Glob` | List files by pattern | Must be inside project directory |
| `Grep` | Search file contents | Must be inside project directory |
| `Bash` | *(always blocked)* | — |

Even if the model tries to write to `/etc/passwd` or `../../secrets`, the `canUseTool` hook rewrites the path to `.data/workspace/`.

## The System Prompt (atto-session.ts)

The system prompt tells the agent exactly:
- It is "Atto", a test case generator for a specific app type
- All files must be written to `.data/workspace/`
- The exact XML format every file must follow
- When to write files vs. answer questions vs. edit existing files
- How to end its response (`<output>` block with workflow_type and summary)

This is why the agent reliably produces structured output instead of freeform text.

## Adding New Models

Edit `lib/agent/atto-config.ts`:

```typescript
export const ATTO_MODEL_OPTIONS = [
  // Anthropic models — use model name directly
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },

  // Any OpenRouter model — prefix with "or:"
  { value: 'or:google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google' },
  { value: 'or:cohere/command-r-plus', label: 'Command R+', provider: 'Cohere' },
];
```

No other code changes needed. The routing is handled automatically by the model prefix.
