# Claude Agent Chat (Next.js + Claude Agent SDK)

Production-ready chat surface that hosts a Claude Agent SDK runtime with safe tool policies, streaming responses, transcript logging, and extensible MCP tooling.

## Features

- **Claude Agent SDK integration** with curated tool policies, custom MCP server registry, and optional project instructions (CLAUDE.md) loading.
- **Streaming JSON lines API** (`/api/chat`) that normalizes SDK messages into UI-friendly events and records them to local transcripts.
- **Client-side chat UI** with partial response rendering, tool-mode toggles, image attachments (paste/drag/upload), project-instruction + extended-thinking controls, and reasoning/tool-call visualizations.
- **Safety & persistence**: Filesystem jail enforcement, `.data/out` write sandbox, `.data/sessions` transcripts via hooks, and in-process MCP tooling.
- **Testing & quality**: Vitest-based unit tests for policy and event mapping plus linting; production builds verified with `next build`.

## Getting started

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-... # required at runtime
export CASTARI_WORKER_URL=https://<worker-subdomain>.workers.dev # required to reach the Castari proxy
# Required for OpenRouter models (default: or:gpt-5-mini)
export OPENROUTER_API_KEY=sk-or-...
export CASTARI_WORKER_TOKEN=shared-secret
npm run dev
```

Visit http://localhost:3000 to chat.

## Scripts

| Command            | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| `npm run dev`      | Start Next.js in development mode.                          |
| `npm run build`    | Production build (requires `ANTHROPIC_API_KEY` to be set).  |
| `npm start`        | Launch the production server.                               |
| `npm run lint`     | ESLint (Next.js base rules).                                |
| `npm run test`     | Vitest unit tests (`tests/`).                               |

## Configuration

- `ANTHROPIC_API_KEY` – required for all SDK usage (still used for Anthropic models and by the Castari proxy).
- `CASTARI_WORKER_URL` – required. Points to the deployed Castari Worker (`https://.../v1/messages`). Both `ANTHROPIC_BASE_URL` and `CASTARI_GATEWAY_URL` are derived from this.
- `OPENROUTER_API_KEY` – required when using the default OpenRouter model (`or:gpt-5-mini`) or any `or:*`/`openrouter/*` model.
- `CASTARI_WORKER_TOKEN` – optional shared secret validated by the Worker before proxying requests.
- Optional overrides (see `lib/env.ts`): `CLAUDE_MODEL`, `AGENT_PERMISSION_MODE`, `AGENT_ENABLE_PARTIALS`.
- Chat payload options: `toolMode` (`safe` / `full`) and `useProjectInstructions` (loads CLAUDE.md context when true).

## Project structure highlights

- `app/api/chat/route.ts` — streaming route that drives the Claude Agent SDK.
- `app/components/Chat.tsx` — client UI with streaming parser & controls.
- `lib/agent` — SDK option builder, message mappers, and transcript hooks.
- `lib/policy` — filesystem jail + tool safety enforcement.
- `lib/store/transcripts.ts` — JSONL transcript writer (`.data/sessions`).
- `lib/mcp/servers.ts` — registry for in-process MCP servers (sample echo tool).
- `tests/` — Vitest suites with environment bootstrapping (`tests/setup.ts`).

## Local data directories

- `.data/sessions` — transcript JSONL files (gitignored).
- `.data/out` — write sandbox for `Write`/`Edit` tools.

## Note

- The SDK reads project instructions only when `useProjectInstructions` is explicitly enabled per request.
- Streaming responses include partial deltas when `AGENT_ENABLE_PARTIALS=true`.
- All filesystem paths are normalized and compared against the repo root; writes are restricted to `.data/out`.
