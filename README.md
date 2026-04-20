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

## Prerequisites

- **Python 3.12+**
- **uv** package manager — install with:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- An **OpenRouter API key** — sign up at [openrouter.ai](https://openrouter.ai) (free tier available)
- *(Optional)* A **Portkey API key** for observability — [portkey.ai](https://portkey.ai)

## Setup & Run

```bash
# 1. Clone the repo
git clone https://github.com/Bharath-Testsigma/POC-001.git
cd POC-001/atto-poc

# 2. Create your .env file
cp .env.example .env
```

Edit `.env` and fill in your keys:

```env
OPENROUTER_API_KEY=sk-or-v1-...   # Required
PORTKEY_API_KEY=...                # Optional — leave as-is to disable
DEFAULT_MODEL=openrouter/google/gemini-flash-1.5
FALLBACK_MODEL=openrouter/anthropic/claude-3-haiku
OPENROUTER_API_BASE=https://openrouter.ai/api/v1
WORKSPACE_DIR=workspace
MAX_ITERATIONS=20
MAX_RETRIES=3
```

```bash
# 3. Install dependencies and start the server
uv run main.py
```

Server starts at `http://localhost:8000`.  
Interactive API docs available at `http://localhost:8000/docs`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/generate` | Generate test cases from a natural language query |
| `GET`  | `/workspace` | List all generated XML files |
| `GET`  | `/workspace/{filename}` | Get content of a specific test case file |
| `DELETE` | `/workspace` | Clear all files (reset for a new session) |

## Example Usage

### Generate test cases

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Generate a login test case for Gmail",
    "app_type": "web",
    "existing_files": []
  }'
```

**Response:**

```json
{
  "conversation_id": "abc-123",
  "workflow_type": "GENERATION",
  "answer": null,
  "test_cases": [
    {
      "file_name": "gmail_login_success.xml",
      "title": "Gmail Login - Happy Path",
      "content": "<?xml version=\"1.0\"?>..."
    }
  ],
  "summary": "Generated 1 test case for Gmail login.",
  "tool_calls_made": 2,
  "retries": 0
}
```

### Ask a question (no files written)

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What XML format do test cases use?",
    "app_type": "web"
  }'
```

### Edit an existing test case

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Add a logout step to gmail_login_success.xml",
    "app_type": "web",
    "existing_files": ["gmail_login_success.xml"]
  }'
```

### List workspace files

```bash
curl http://localhost:8000/workspace
```

### Read a specific file

```bash
curl http://localhost:8000/workspace/gmail_login_success.xml
```

### Clear the workspace

```bash
curl -X DELETE http://localhost:8000/workspace
```

## Switching Models

Change `DEFAULT_MODEL` in `.env` to any OpenRouter-supported model:

```env
# Gemini Flash (default — fast & cheap)
DEFAULT_MODEL=openrouter/google/gemini-flash-1.5

# GPT-4o
DEFAULT_MODEL=openrouter/openai/gpt-4o

# Claude 3.5 Sonnet
DEFAULT_MODEL=openrouter/anthropic/claude-3.5-sonnet

# Mistral Large
DEFAULT_MODEL=openrouter/mistralai/mistral-large
```

Full model list: [openrouter.ai/models](https://openrouter.ai/models)

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | **Required.** Your OpenRouter API key |
| `PORTKEY_API_KEY` | — | Optional. Enables Portkey observability tracing |
| `DEFAULT_MODEL` | `openrouter/google/gemini-flash-1.5` | Primary LLM model |
| `FALLBACK_MODEL` | `openrouter/anthropic/claude-3-haiku` | Fallback if primary model fails |
| `OPENROUTER_API_BASE` | `https://openrouter.ai/api/v1` | OpenRouter endpoint |
| `WORKSPACE_DIR` | `workspace` | Directory where XML files are written |
| `MAX_ITERATIONS` | `20` | Hard cap on agentic loop iterations |
| `MAX_RETRIES` | `3` | Max retries after XML validation failure |

## How It Works

1. Your query hits `POST /generate`.
2. The orchestrator builds a system prompt (XML format rules, available tools, existing files list) and sends it to the LLM via LiteLLM.
3. The LLM enters an agentic loop — it calls tools (`WriteFile`, `ReadFile`, etc.) until it's done.
4. After every `WriteFile`, a **post-write hook** automatically validates the XML. If invalid, the error is fed back to the LLM for self-correction (up to 3 retries).
5. A **pre-delete hook** prevents the LLM from deleting files passed in `existing_files`.
6. Once the LLM emits a plain text response with an `<output>` block, the loop exits and a structured `GenerateResponse` is returned.

## Tech Stack

- **Python 3.12** + **FastAPI** — API layer
- **LiteLLM** — Model-agnostic LLM interface (one API for all providers)
- **OpenRouter** — Multi-model provider (Gemini, Claude, GPT-4o, Mistral, …)
- **Portkey** — LLM observability & tracing (optional)
- **Pydantic v2** — Request/response validation
- **uv** — Fast Python dependency management
