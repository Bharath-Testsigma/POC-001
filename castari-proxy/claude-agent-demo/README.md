# Atto — AI Test Case Generator (Next.js App)

This branch is the dedicated **Portkey demo deployment**. The UI is locked to Portkey mode so this branch can be deployed as a single-purpose showcase.

Portkey is the only active routing path in this branch. Cloudflare Worker deployment is not part of this demo variant.

This is the main application. It uses the **Claude Agent SDK** with a self-hosted proxy to generate XML test case files from plain-English prompts, with support for any AI model — Claude, Gemini, GPT-4o, Llama, and more.

## What This Branch Is For

- demoing a managed gateway instead of a self-hosted worker
- showing Portkey virtual-key routing across Anthropic, OpenAI, and Google
- keeping the same orchestration/UI layer while swapping the gateway
- presenting gateway observability and routing governance as the core value proposition

For demo deployments, you can pin the UI to a single proxy path with:

```env
NEXT_PUBLIC_ATTO_DEMO_MODE=cloudflare
```

or

```env
NEXT_PUBLIC_ATTO_DEMO_MODE=portkey
```

When that variable is set, the sidebar shows a fixed mode badge and hides the runtime toggle so each deployment can represent one clean architecture story.

For this branch, keep it set to:

```env
NEXT_PUBLIC_ATTO_DEMO_MODE=portkey
```

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

# Portkey gateway key
PORTKEY_API_KEY=pk-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
NEXT_PUBLIC_ATTO_DEMO_MODE=portkey
```

`CASTARI_WORKER_URL` is not part of this demo path. The Portkey route is handled through the local `/api/portkey` endpoint and forwarded to `https://api.portkey.ai/v1/messages`.

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
  { query: "...", model: "pk:google/gemini-2.5-flash", appType: "web" }
        │
        ▼
startAttoQuery()
  Builds Options:
    - systemPrompt: Atto instructions (XML format, workspace path, tool usage rules)
    - allowedTools: ['Read', 'Write', 'Glob', 'Grep']
    - canUseTool:   path-jails Write to .data/workspace/
    - model:        "pk:google/gemini-2.5-flash"
        │
        ▼
queryCastari()
  - Reads model prefix → resolves provider (portkey)
  - Patches globalThis.fetch to intercept /v1/messages calls
  - Adds Portkey auth and provider headers
        │
        ▼
Claude Agent SDK — query()
  Spawns agent subprocess, begins conversation
        │
        ▼
[Every fetch to /v1/messages is intercepted]
        │
        ▼
Local /api/portkey route
  Resolves provider from pk: prefix
  Forwards request to Portkey Gateway
        │
        ▼
Portkey → Gemini 2.5 Flash
        │
        ▼ (response)
Portkey returns Anthropic-compatible response
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

## Deployment Checklist

1. Set `PORTKEY_API_KEY`.
2. Set `NEXT_PUBLIC_ATTO_DEMO_MODE=portkey`.
3. Add only the upstream provider keys needed for the models you want to show.
4. Run `npm run dev` locally or deploy the Next.js app to your hosting platform.
