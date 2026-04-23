# Atto POC — LiteLLM Local Demo

This branch is the dedicated **LiteLLM local deployment**. It uses:

- Streamlit for the demo UI
- FastAPI for the orchestration layer
- LiteLLM on `localhost:4000` as the proxy gateway

## What This Mode Demonstrates

- one orchestration loop across multiple providers
- a local proxy layer instead of provider-specific code paths in the app
- controlled fallback behavior when a provider fails or is rate-limited
- a demo that can be run locally without Cloudflare Worker or Portkey setup

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
- LiteLLM health: `http://localhost:4000/health/liveliness`

## Architecture

```text
Streamlit UI
  -> FastAPI orchestrator
    -> LiteLLM proxy
      -> Anthropic / Google / OpenAI
```

## Environment

Use [`.env.example`](./.env.example) as the starting point.

Required values:

- `GOOGLE_API_KEY` for Gemini routes
- `ANTHROPIC_API_KEY` for Claude routes
- `OPENAI_API_KEY` for GPT routes

Behavior settings:

- `DEFAULT_MODEL` is the first-choice model sent through LiteLLM
- `FALLBACK_MODEL` is used if the primary model fails
- `MAX_ITERATIONS` and `MAX_RETRIES` control the agent loop

## Health Checks

```bash
curl http://127.0.0.1:4000/health/liveliness
curl http://127.0.0.1:8000/workspace
```

## End-to-End Smoke Test

```bash
curl -X POST http://127.0.0.1:8000/generate \
  -H 'Content-Type: application/json' \
  --data '{"query":"Generate a simple login test case for a web app","app_type":"web","model":"openai/gemini-flash"}'
```

Expected outcome:

- FastAPI accepts the request
- LiteLLM routes it to the selected provider
- XML files appear in `workspace/`
- if the primary provider fails, the configured fallback model may complete the run

This branch is intended for local demos where you want to show a self-hosted proxy layer without relying on the Cloudflare Worker or Portkey gateway variants.
