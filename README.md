# POC-001 — Atto-like AI Test Case Generator

A standalone Python FastAPI application that replicates Testsigma's internal **Atto** system — an AI-powered test case generator — using **LiteLLM** as the model-agnostic backend instead of the Claude Code CLI.

## Architecture

```
POST /generate
     │
     ▼
Orchestrator (agentic loop, max 20 iterations)
     │
     ├── LiteLLM → OpenRouter (Gemini Flash / Claude Haiku fallback)
     │
     ├── Tools: ReadFile, WriteFile, DeleteFile, ListFiles, ValidateXML
     │
     ├── Hooks: post_write (XML validation), pre_delete (protect existing files)
     │
     └── Retry loop (max 3 retries on validation failure)
          │
          ▼
     GenerateResponse { workflow_type, test_cases, summary, ... }
```

## Project Structure

```
atto-poc/
├── main.py                  # FastAPI entry point
├── pyproject.toml           # uv dependencies
├── .env.example             # Environment variable template
├── app/
│   ├── orchestrator.py      # Core agentic loop
│   ├── tools.py             # ReadFile, WriteFile, DeleteFile, ValidateXML, ListFiles
│   ├── hooks.py             # Pre/post tool hooks
│   ├── prompts.py           # System & user prompt templates
│   ├── tracer.py            # Portkey observability integration
│   ├── models.py            # Pydantic request/response models
│   └── config.py            # Settings loaded from .env
└── workspace/               # Generated XML test case files land here
```

## Quick Start

```bash
cd atto-poc

# Copy and fill in your API keys
cp .env.example .env
# Edit .env: set OPENROUTER_API_KEY (required), PORTKEY_API_KEY (optional)

# Install dependencies and run
uv run main.py
```

Server starts at `http://localhost:8000`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/generate` | Generate test cases from a natural language query |
| `GET`  | `/workspace` | List all generated XML files |
| `GET`  | `/workspace/{filename}` | Get content of a specific test case |
| `DELETE` | `/workspace` | Clear all files (reset session) |

## Example Request

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Generate a login test case for Gmail",
    "app_type": "web",
    "existing_files": []
  }'
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | **Required.** Your OpenRouter API key |
| `PORTKEY_API_KEY` | — | Optional. Enables Portkey observability |
| `DEFAULT_MODEL` | `openrouter/google/gemini-flash-1.5` | Primary LLM model |
| `FALLBACK_MODEL` | `openrouter/anthropic/claude-3-haiku` | Fallback if primary fails |
| `MAX_ITERATIONS` | `20` | Hard cap on agentic loop iterations |
| `MAX_RETRIES` | `3` | Max XML validation retries |

## Tech Stack

- **Python 3.12** + **FastAPI** — API layer
- **LiteLLM** — Model-agnostic LLM interface
- **OpenRouter** — Multi-model provider (Gemini, Claude, GPT-4o, Mistral, …)
- **Portkey** — LLM observability & tracing
- **Pydantic v2** — Request/response validation
- **uv** — Dependency management
