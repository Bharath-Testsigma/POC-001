# Castari Worker

This Cloudflare Worker translates Anthropic Messages API requests (from the Castari Proxy wrapper) into provider-specific calls. By default it routes to the public Anthropic and OpenRouter APIs, so you can deploy it without relying on Cloudflare AI Gateway. Clients supply their own API keys on every request; nothing is stored or logged server-side.

## Default Upstreams
- Anthropic: `https://api.anthropic.com/v1/messages`
- OpenRouter: `https://openrouter.ai/api/v1/chat/completions`

You can override these via environment variables (`UPSTREAM_ANTHROPIC_BASE_URL`, `UPSTREAM_OPENROUTER_BASE_URL`) or by editing `wrangler.toml` before deployment.

## Running Locally
```bash
npm install
npm run dev
```
This starts `wrangler dev` with your local changes. Requests to `http://127.0.0.1:8787/v1/messages` behave exactly like the hosted worker—as long as you forward your API key in the request headers.

## Deploying
```bash
npm install
npx wrangler login
npm run deploy
```
Set any additional environment variables via `wrangler secret put` or `wrangler deploy --env` flags.

## Safety Notes
- The worker simply forwards headers/body to upstream APIs. Ensure your clients send `x-api-key` (Anthropic) or `Authorization: Bearer <token>` (OpenRouter) in each request.
- No request/response bodies are persisted by default. Add logging only if you own the deployment and comply with provider terms.

See the repository root README for more context and client integration details.
