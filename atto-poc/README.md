# Atto POC — Helicone OSS Demo

This branch is the dedicated **Helicone OSS local deployment**. It uses:

- Streamlit for the demo UI
- FastAPI for the orchestration layer
- Helicone AI Gateway on `localhost:8080/ai` as the proxy gateway

## What This Mode Demonstrates

- one orchestration loop across multiple providers
- a local proxy layer instead of provider-specific code paths in the app
- controlled fallback behavior when a provider fails or is rate-limited
- a demo that can be run locally without Cloudflare Worker or Portkey setup
- a self-hosted open-source gateway instead of LiteLLM

## Start the Demo

```bash
cd atto-poc
cp .env.example .env
docker compose up -d
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
.venv/bin/streamlit run ui.py
```

Open:

- Streamlit UI: `http://localhost:8501`
- FastAPI API: `http://localhost:8000`
- Helicone models endpoint: `http://localhost:8080/ai/models`

## Architecture

```text
Streamlit UI
  -> FastAPI orchestrator
    -> Helicone AI Gateway
      -> Anthropic / Google / OpenAI
```

## Environment

Use [`.env.example`](./.env.example) as the starting point.

Required values:

- `GOOGLE_API_KEY` for Gemini routes
- `ANTHROPIC_API_KEY` for Claude routes
- `OPENAI_API_KEY` for GPT routes

Behavior settings:

- `HELICONE_GATEWAY_URL` defaults to `http://localhost:8080/ai`
- `HELICONE_API_KEY` can stay as `placeholder-api-key` unless you enable gateway auth
- `DEFAULT_MODEL` is the first-choice model sent through Helicone
- `FALLBACK_MODEL` is used if the primary model fails
- `MAX_ITERATIONS` and `MAX_RETRIES` control the agent loop

The app sends OpenAI-compatible `chat/completions` requests to Helicone. Provider selection happens via model names such as:

- `anthropic/claude-3-5-haiku-latest`
- `google/gemini-2.5-flash`
- `openai/gpt-4o-mini`

## Health Checks

```bash
curl http://127.0.0.1:8080/ai/models
curl http://127.0.0.1:8000/workspace
```

## End-to-End Smoke Test

```bash
curl -X POST http://127.0.0.1:8000/generate \
  -H 'Content-Type: application/json' \
  --data '{"query":"Generate a simple login test case for a web app","app_type":"web","model":"google/gemini-2.5-flash"}'
```

Expected outcome:

- FastAPI accepts the request
- Helicone routes it to the selected provider
- XML files appear in `workspace/`
- if the primary provider fails, the configured fallback model may complete the run

This branch is intended for local demos where you want to show a self-hosted open-source gateway without relying on the Cloudflare Worker or Portkey variants.
