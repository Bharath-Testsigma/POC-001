# Atto POC — LiteLLM Local Demo

This branch is the dedicated **LiteLLM local deployment**. It uses:

- Streamlit for the demo UI
- FastAPI for the orchestration layer
- LiteLLM on `localhost:4000` as the proxy gateway

## Start the Demo

```bash
cd atto-poc
docker compose up -d
uv run python main.py
uv run streamlit run ui.py
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

This branch is intended for local demos where you want to show a fully self-hosted proxy layer without relying on the Cloudflare Worker or Portkey gateway variants.
