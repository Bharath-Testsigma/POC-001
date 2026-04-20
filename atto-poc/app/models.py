from pydantic import BaseModel, Field
from uuid import uuid4


class GenerateRequest(BaseModel):
    query: str
    app_type: str = "web"
    conversation_id: str = Field(default_factory=lambda: str(uuid4()))
    existing_files: list[str] = []


class TestCase(BaseModel):
    file_name: str
    title: str
    content: str


class GenerateResponse(BaseModel):
    conversation_id: str
    workflow_type: str  # GENERATION | QUESTION | EDIT
    answer: str | None = None
    test_cases: list[TestCase] = []
    summary: str
    tool_calls_made: int
    retries: int


class WorkspaceFile(BaseModel):
    file_name: str
    size_bytes: int


class WorkspaceListResponse(BaseModel):
    files: list[WorkspaceFile]
    total: int
