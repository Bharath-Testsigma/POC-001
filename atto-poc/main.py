import logging
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse

from app.config import settings
from app.models import GenerateRequest, GenerateResponse, WorkspaceFile, WorkspaceListResponse
from app.orchestrator import run_orchestrator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="Atto POC — AI Test Case Generator",
    description="Replicates Atto's agentic test generation loop using a self-hosted LiteLLM proxy.",
    version="0.1.0",
)


@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest) -> GenerateResponse:
    """Generate test cases from a natural language query."""
    try:
        return await run_orchestrator(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/workspace", response_model=WorkspaceListResponse)
async def list_workspace() -> WorkspaceListResponse:
    """List all test case files currently in the workspace."""
    workspace = settings.workspace_path
    workspace.mkdir(parents=True, exist_ok=True)
    files = [
        WorkspaceFile(file_name=f.name, size_bytes=f.stat().st_size)
        for f in sorted(workspace.iterdir())
        if f.is_file()
    ]
    return WorkspaceListResponse(files=files, total=len(files))


@app.get("/workspace/{filename}", response_class=PlainTextResponse)
async def get_file(filename: str) -> str:
    """Return the XML content of a specific test case file."""
    workspace = settings.workspace_path
    # Sanitize: only allow simple filenames, no path traversal
    safe_name = Path(filename).name
    target = workspace / safe_name
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    return target.read_text(encoding="utf-8")


@app.delete("/workspace")
async def clear_workspace() -> dict:
    """Delete all files in the workspace (reset for a new session)."""
    workspace = settings.workspace_path
    if workspace.exists():
        shutil.rmtree(workspace)
    workspace.mkdir(parents=True, exist_ok=True)
    return {"message": "Workspace cleared."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
